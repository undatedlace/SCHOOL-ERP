import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { Page, skipTake } from '../../common/dto/page-query.dto.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  MAX_RANGE_DAYS,
  daysBetween,
  isIsoDate,
  toDate,
  toIso,
  todayInIndia,
} from '../attendance/attendance-rules.js';
import { AuditService } from '../audit/audit.service.js';
import {
  Entitlement,
  balanceOf,
  entitledHalfDays,
  leaveSize,
  overlaps,
  toDays,
  toHalfDays,
} from './leave-rules.js';
import {
  ApplyLeaveDto,
  DecideLeaveDto,
  ListLeaveQueryDto,
  SaveEntitlementsDto,
  CreateLeaveTypeDto,
  UpdateLeaveTypeDto,
} from './dto/leave.dto.js';

const REQUEST_INCLUDE = {
  staff: {
    select: { id: true, firstName: true, surname: true, designation: true },
  },
  leaveType: { select: { id: true, name: true } },
} satisfies Prisma.LeaveRequestInclude;
type Row = Prisma.LeaveRequestGetPayload<{ include: typeof REQUEST_INCLUDE }>;

const name = (s: { firstName: string; surname: string }) =>
  `${s.firstName} ${s.surname}`;

const view = (r: Row, own: boolean) => ({
  id: r.id,
  staff: {
    id: r.staff.id,
    name: name(r.staff),
    designation: r.staff.designation,
  },
  leaveType: r.leaveType,
  startsOn: toIso(r.startsOn),
  endsOn: toIso(r.endsOn),
  halfDay: r.halfDay,
  days: toDays(r.halfDays),
  reason: r.reason,
  status: r.status,
  decidedAt: r.decidedAt,
  decisionNote: r.decisionNote,
  createdAt: r.createdAt,
  mine: own,
});

/** Staff leave: the kinds, the yearly allowance, requests, decisions and balances. */
@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private manages = (auth: AuthContext) =>
    auth.permissions.includes('leave.manage');

  // ---------- the kinds of leave ----------

  async types(schoolId: string, includeInactive: boolean) {
    const rows = await this.prisma.leaveType.findMany({
      where: { schoolId, ...(includeInactive ? {} : { active: true }) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((t) => ({
      id: t.id,
      name: t.name,
      unlimited: t.unlimited,
      active: t.active,
    }));
  }

  async createType(auth: AuthContext, dto: CreateLeaveTypeDto, ip?: string) {
    const last = await this.prisma.leaveType.aggregate({
      where: { schoolId: auth.schoolId },
      _max: { sortOrder: true },
    });
    try {
      const t = await this.prisma.leaveType.create({
        data: {
          schoolId: auth.schoolId,
          name: dto.name,
          unlimited: dto.unlimited ?? false,
          sortOrder: (last._max.sortOrder ?? 0) + 1,
        },
      });
      await this.record(auth, 'leave_type.created', 'leave_type', t.id, ip, {
        name: dto.name,
      });
      return {
        id: t.id,
        name: t.name,
        unlimited: t.unlimited,
        active: t.active,
      };
    } catch (error) {
      throw this.nameClash(error, dto.name);
    }
  }

  async updateType(
    auth: AuthContext,
    id: string,
    dto: UpdateLeaveTypeDto,
    ip?: string,
  ) {
    const found = await this.prisma.leaveType.findFirst({
      where: { id, schoolId: auth.schoolId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Leave type not found');
    try {
      const t = await this.prisma.leaveType.update({
        where: { id },
        data: dto,
      });
      await this.record(auth, 'leave_type.updated', 'leave_type', id, ip, {
        fields: Object.keys(dto).join(','),
      });
      return {
        id: t.id,
        name: t.name,
        unlimited: t.unlimited,
        active: t.active,
      };
    } catch (error) {
      throw this.nameClash(error, dto.name ?? '');
    }
  }

  // ---------- the yearly allowance ----------

  private async assertYear(schoolId: string, id: string) {
    const y = await this.prisma.academicYear.findFirst({
      where: { id, schoolId },
      select: { id: true, name: true, startDate: true, endDate: true },
    });
    if (!y) throw new BadRequestException('That academic year does not exist');
    return y;
  }

  private async currentYear(schoolId: string, onDate?: string) {
    const today = onDate ?? todayInIndia();
    const containing = await this.prisma.academicYear.findFirst({
      where: {
        schoolId,
        startDate: { lte: toDate(today) },
        endDate: { gte: toDate(today) },
      },
      orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }],
    });
    const year =
      containing ??
      (await this.prisma.academicYear.findFirst({
        where: { schoolId, isCurrent: true },
      }));
    if (!year) {
      throw new BadRequestException(
        'There is no academic year. Set one up in Academic setup.',
      );
    }
    return year;
  }

  async entitlements(schoolId: string, academicYearId?: string) {
    const year = academicYearId
      ? await this.assertYear(schoolId, academicYearId)
      : await this.currentYear(schoolId);
    const rows = await this.prisma.leaveEntitlement.findMany({
      where: { schoolId, academicYearId: year.id },
      select: { leaveTypeId: true, staffTypeId: true, halfDays: true },
    });
    return {
      academicYear: { id: year.id, name: year.name },
      items: rows.map((r) => ({
        leaveTypeId: r.leaveTypeId,
        staffTypeId: r.staffTypeId,
        days: toDays(r.halfDays),
      })),
    };
  }

  /** Replaces the year's allowance with exactly what is sent. Done before the year starts. */
  async saveEntitlements(
    auth: AuthContext,
    dto: SaveEntitlementsDto,
    ip?: string,
  ) {
    const year = await this.assertYear(auth.schoolId, dto.academicYearId);
    const types = new Set(
      (
        await this.prisma.leaveType.findMany({
          where: { schoolId: auth.schoolId },
          select: { id: true },
        })
      ).map((t) => t.id),
    );
    const staffTypes = new Set(
      (
        await this.prisma.staffType.findMany({
          where: { schoolId: auth.schoolId },
          select: { id: true },
        })
      ).map((t) => t.id),
    );
    const seen = new Set<string>();
    const data = dto.items.map((i) => {
      if (!types.has(i.leaveTypeId)) {
        throw new BadRequestException(
          'A leave type in the list does not exist',
        );
      }
      if (i.staffTypeId && !staffTypes.has(i.staffTypeId)) {
        throw new BadRequestException(
          'A staff type in the list does not exist',
        );
      }
      const key = `${i.leaveTypeId}:${i.staffTypeId ?? ''}`;
      if (seen.has(key)) {
        throw new BadRequestException(
          'The same leave type is listed twice for the same staff type',
        );
      }
      seen.add(key);
      const halfDays = toHalfDays(i.days);
      if (halfDays === null) {
        throw new BadRequestException('Days must be whole or half days');
      }
      return {
        schoolId: auth.schoolId,
        academicYearId: year.id,
        leaveTypeId: i.leaveTypeId,
        staffTypeId: i.staffTypeId ?? null,
        halfDays,
      };
    });
    await this.prisma.$transaction([
      this.prisma.leaveEntitlement.deleteMany({
        where: { schoolId: auth.schoolId, academicYearId: year.id },
      }),
      this.prisma.leaveEntitlement.createMany({ data }),
    ]);
    await this.record(
      auth,
      'leave.entitlements_saved',
      'academic_year',
      year.id,
      ip,
      {
        rows: data.length,
      },
    );
    return this.entitlements(auth.schoolId, year.id);
  }

  /** Starts next year's allowance from last year's. Refuses to overwrite one that already exists. */
  async copyEntitlements(
    auth: AuthContext,
    fromId: string,
    toId: string,
    ip?: string,
  ) {
    if (fromId === toId) {
      throw new BadRequestException('Choose two different years');
    }
    await this.assertYear(auth.schoolId, fromId);
    await this.assertYear(auth.schoolId, toId);
    const existing = await this.prisma.leaveEntitlement.count({
      where: { schoolId: auth.schoolId, academicYearId: toId },
    });
    if (existing > 0) {
      throw new ConflictException(
        'That year already has an allowance. Change it there instead.',
      );
    }
    const rows = await this.prisma.leaveEntitlement.findMany({
      where: { schoolId: auth.schoolId, academicYearId: fromId },
    });
    await this.prisma.leaveEntitlement.createMany({
      data: rows.map((r) => ({
        schoolId: auth.schoolId,
        academicYearId: toId,
        leaveTypeId: r.leaveTypeId,
        staffTypeId: r.staffTypeId,
        halfDays: r.halfDays,
      })),
    });
    await this.record(
      auth,
      'leave.entitlements_copied',
      'academic_year',
      toId,
      ip,
      {
        rows: rows.length,
      },
    );
    return this.entitlements(auth.schoolId, toId);
  }

  // ---------- balances ----------

  /** The staff record of the signed-in person. */
  private async ownStaff(auth: AuthContext) {
    const s = await this.prisma.staff.findFirst({
      where: { schoolId: auth.schoolId, userId: auth.userId },
      select: {
        id: true,
        status: true,
        staffTypeId: true,
        firstName: true,
        surname: true,
      },
    });
    if (!s) throw new NotFoundException('You have no staff record');
    return s;
  }

  private async targetStaff(auth: AuthContext, staffId?: string) {
    if (!staffId) return this.ownStaff(auth);
    const own = await this.prisma.staff.findFirst({
      where: { id: staffId, schoolId: auth.schoolId, userId: auth.userId },
      select: { id: true },
    });
    if (!own && !this.manages(auth)) {
      throw new NotFoundException('Staff member not found');
    }
    const s = await this.prisma.staff.findFirst({
      where: { id: staffId, schoolId: auth.schoolId },
      select: {
        id: true,
        status: true,
        staffTypeId: true,
        firstName: true,
        surname: true,
      },
    });
    if (!s) throw new NotFoundException('Staff member not found');
    return s;
  }

  private async usage(staffId: string, academicYearId: string) {
    return this.prisma.leaveRequest.findMany({
      where: {
        staffId,
        academicYearId,
        status: { in: ['PENDING', 'APPROVED'] },
      },
      select: {
        leaveTypeId: true,
        status: true,
        endsOn: true,
        halfDays: true,
      },
    });
  }

  async balance(
    auth: AuthContext,
    q: { staffId?: string; academicYearId?: string },
  ) {
    const staff = await this.targetStaff(auth, q.staffId);
    const year = q.academicYearId
      ? await this.assertYear(auth.schoolId, q.academicYearId)
      : await this.currentYear(auth.schoolId);
    const [types, ent, used] = await Promise.all([
      this.prisma.leaveType.findMany({
        where: { schoolId: auth.schoolId },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.leaveEntitlement.findMany({
        where: { schoolId: auth.schoolId, academicYearId: year.id },
        select: { leaveTypeId: true, staffTypeId: true, halfDays: true },
      }),
      this.usage(staff.id, year.id),
    ]);
    const today = todayInIndia();
    const rows = types
      .map((t) => {
        const mine = used.filter((u) => u.leaveTypeId === t.id);
        const b = balanceOf(
          entitledHalfDays(ent, t.id, staff.staffTypeId),
          mine.map((u) => ({
            status: u.status as 'PENDING' | 'APPROVED',
            endsOn: toIso(u.endsOn),
            halfDays: u.halfDays,
          })),
          today,
        );
        return { t, b, used: mine.length };
      })
      // Switched-off kinds show only if something was already booked under them.
      .filter(({ t, used: n }) => t.active || n > 0)
      .map(({ t, b }) => ({
        leaveType: { id: t.id, name: t.name, unlimited: t.unlimited },
        entitled: toDays(b.entitled),
        taken: toDays(b.taken),
        upcoming: toDays(b.upcoming),
        pending: toDays(b.pending),
        remaining: t.unlimited ? null : toDays(b.remaining),
      }));
    return {
      staff: { id: staff.id, name: name(staff) },
      academicYear: { id: year.id, name: year.name },
      balances: rows,
    };
  }

  // ---------- requests ----------

  async apply(auth: AuthContext, dto: ApplyLeaveDto, ip?: string) {
    const onBehalf = dto.staffId !== undefined;
    if (onBehalf && !this.manages(auth)) {
      throw new ForbiddenException(
        'Only an administrator can record leave for someone else',
      );
    }
    const staff = onBehalf
      ? await this.targetStaff(auth, dto.staffId)
      : await this.ownStaff(auth);
    if (staff.status !== 'ACTIVE') {
      throw new BadRequestException('Leave can only be taken by current staff');
    }

    const endsOn = dto.endsOn ?? dto.startsOn;
    if (!isIsoDate(dto.startsOn) || !isIsoDate(endsOn)) {
      throw new BadRequestException('The dates are not real dates');
    }
    const today = todayInIndia();
    if (dto.startsOn < today && !this.manages(auth)) {
      throw new BadRequestException(
        'Leave cannot start in the past. Ask an administrator to record it.',
      );
    }
    const size = leaveSize(dto.startsOn, endsOn, dto.halfDay === true);
    if (!size.ok) throw new BadRequestException(size.problem);

    const type = await this.prisma.leaveType.findFirst({
      where: { id: dto.leaveTypeId, schoolId: auth.schoolId, active: true },
    });
    if (!type)
      throw new BadRequestException('Choose a kind of leave from the list');

    // A request sits inside one academic year, which decides the allowance it counts against.
    const year = await this.currentYear(auth.schoolId, dto.startsOn);
    if (
      toDate(dto.startsOn) < year.startDate ||
      toDate(endsOn) > year.endDate
    ) {
      throw new BadRequestException(
        `A request must be inside one academic year (${year.name}). Split it at the year end.`,
      );
    }

    const others = await this.prisma.leaveRequest.findMany({
      where: {
        staffId: staff.id,
        status: { in: ['PENDING', 'APPROVED'] },
        startsOn: { lte: toDate(endsOn) },
        endsOn: { gte: toDate(dto.startsOn) },
      },
      select: { startsOn: true, endsOn: true },
    });
    if (
      others.some((o) =>
        overlaps(dto.startsOn, endsOn, toIso(o.startsOn), toIso(o.endsOn)),
      )
    ) {
      throw new ConflictException(
        'There is already leave asked for or approved on some of those days',
      );
    }

    if (!type.unlimited) {
      const [ent, used] = await Promise.all([
        this.prisma.leaveEntitlement.findMany({
          where: { schoolId: auth.schoolId, academicYearId: year.id },
          select: { leaveTypeId: true, staffTypeId: true, halfDays: true },
        }),
        this.usage(staff.id, year.id),
      ]);
      const b = balanceOf(
        entitledHalfDays(ent as Entitlement[], type.id, staff.staffTypeId),
        used
          .filter((u) => u.leaveTypeId === type.id)
          .map((u) => ({
            status: u.status as 'PENDING' | 'APPROVED',
            endsOn: toIso(u.endsOn),
            halfDays: u.halfDays,
          })),
        today,
      );
      if (size.halfDays > b.remaining) {
        throw new BadRequestException(
          b.entitled === 0
            ? `There is no ${type.name.toLowerCase()} allowance for ${year.name}`
            : `Only ${toDays(b.remaining)} day(s) of ${type.name.toLowerCase()} are left, and this asks for ${toDays(size.halfDays)}`,
        );
      }
    }

    const created = await this.prisma.leaveRequest.create({
      data: {
        schoolId: auth.schoolId,
        staffId: staff.id,
        leaveTypeId: type.id,
        academicYearId: year.id,
        startsOn: toDate(dto.startsOn),
        endsOn: toDate(endsOn),
        halfDay: dto.halfDay === true,
        halfDays: size.halfDays,
        reason: dto.reason,
        // An administrator recording leave has already decided it.
        status: onBehalf ? 'APPROVED' : 'PENDING',
        requestedById: auth.userId,
        ...(onBehalf
          ? { decidedById: auth.userId, decidedAt: new Date() }
          : {}),
      },
      include: REQUEST_INCLUDE,
    });
    await this.record(
      auth,
      onBehalf ? 'leave.recorded' : 'leave.requested',
      'leave_request',
      created.id,
      ip,
      { staffId: staff.id, days: toDays(size.halfDays), type: type.name },
    );
    return view(created, !onBehalf);
  }

  async list(
    auth: AuthContext,
    q: ListLeaveQueryDto,
  ): Promise<Page<ReturnType<typeof view>>> {
    const own = await this.prisma.staff.findFirst({
      where: { schoolId: auth.schoolId, userId: auth.userId },
      select: { id: true },
    });
    const manages = this.manages(auth);
    if (!manages && !own)
      return { items: [], total: 0, page: q.page, pageSize: q.pageSize };
    const where: Prisma.LeaveRequestWhereInput = {
      schoolId: auth.schoolId,
      staffId: manages ? (q.staffId ?? undefined) : own!.id,
      ...(q.status ? { status: q.status } : {}),
      ...(q.leaveTypeId ? { leaveTypeId: q.leaveTypeId } : {}),
      ...(q.from ? { endsOn: { gte: toDate(q.from) } } : {}),
      ...(q.to ? { startsOn: { lte: toDate(q.to) } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where,
        include: REQUEST_INCLUDE,
        orderBy: [{ startsOn: 'desc' }, { createdAt: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);
    return {
      items: rows.map((r) => view(r, r.staffId === own?.id)),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  /** Approves or rejects a request that is waiting. */
  async decide(
    auth: AuthContext,
    id: string,
    dto: DecideLeaveDto,
    ip?: string,
  ) {
    const r = await this.prisma.leaveRequest.findFirst({
      where: { id, schoolId: auth.schoolId },
      select: { id: true, status: true },
    });
    if (!r) throw new NotFoundException('Leave request not found');
    if (r.status !== 'PENDING') {
      throw new ConflictException('This request has already been dealt with');
    }
    if (dto.decision === 'REJECTED' && !dto.note?.trim()) {
      throw new BadRequestException('Say why the leave is refused');
    }
    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: dto.decision,
        decidedById: auth.userId,
        decidedAt: new Date(),
        decisionNote: dto.note?.trim() || null,
      },
      include: REQUEST_INCLUDE,
    });
    await this.record(
      auth,
      dto.decision === 'APPROVED' ? 'leave.approved' : 'leave.rejected',
      'leave_request',
      id,
      ip,
    );
    return view(updated, false);
  }

  /**
   * Withdraws leave. The person who asked can withdraw a waiting request, or approved leave that has not
   * started; an administrator can withdraw any waiting or approved leave.
   */
  async cancel(auth: AuthContext, id: string, note?: string, ip?: string) {
    const r = await this.prisma.leaveRequest.findFirst({
      where: { id, schoolId: auth.schoolId },
      include: {
        ...REQUEST_INCLUDE,
        staff: {
          select: {
            id: true,
            firstName: true,
            surname: true,
            designation: true,
            userId: true,
          },
        },
      },
    });
    if (!r) throw new NotFoundException('Leave request not found');
    const mine = r.staff.userId === auth.userId;
    if (!mine && !this.manages(auth)) {
      throw new NotFoundException('Leave request not found');
    }
    if (r.status !== 'PENDING' && r.status !== 'APPROVED') {
      throw new ConflictException('This leave is already closed');
    }
    if (
      !this.manages(auth) &&
      r.status === 'APPROVED' &&
      toIso(r.startsOn) <= todayInIndia()
    ) {
      throw new BadRequestException(
        'Leave that has started can only be withdrawn by an administrator',
      );
    }
    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        decisionNote: note?.trim() || r.decisionNote,
        ...(mine ? {} : { decidedById: auth.userId, decidedAt: new Date() }),
      },
      include: REQUEST_INCLUDE,
    });
    await this.record(auth, 'leave.cancelled', 'leave_request', id, ip);
    return view(updated, mine);
  }

  // ---------- the calendar ----------

  /**
   * Leave for the staff calendar. An administrator sees everyone's approved leave and what is waiting;
   * a member of staff sees only their own.
   */
  async calendar(auth: AuthContext, from: string, to: string) {
    if (!isIsoDate(from) || !isIsoDate(to) || to < from) {
      throw new BadRequestException('from and to must be real dates in order');
    }
    if (daysBetween(from, to) > MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `Ask for at most ${MAX_RANGE_DAYS} days at a time`,
      );
    }
    const manages = this.manages(auth);
    const own = manages
      ? null
      : await this.prisma.staff.findFirst({
          where: { schoolId: auth.schoolId, userId: auth.userId },
          select: { id: true },
        });
    if (!manages && !own) return [];
    const rows = await this.prisma.leaveRequest.findMany({
      where: {
        schoolId: auth.schoolId,
        status: manages
          ? { in: ['PENDING', 'APPROVED'] }
          : { in: ['PENDING', 'APPROVED'] },
        ...(own ? { staffId: own.id } : {}),
        startsOn: { lte: toDate(to) },
        endsOn: { gte: toDate(from) },
      },
      include: REQUEST_INCLUDE,
      orderBy: [{ startsOn: 'asc' }],
      take: 500,
    });
    return rows.map((r) => ({
      id: r.id,
      title: `${name(r.staff)}: ${r.leaveType.name}${r.status === 'PENDING' ? ' (waiting)' : ''}`,
      startsOn: toIso(r.startsOn),
      endsOn: toIso(r.endsOn),
      status: r.status,
      halfDay: r.halfDay,
    }));
  }

  // ---------- helpers ----------

  private nameClash(error: unknown, label: string): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException(`There is already a leave type "${label}"`);
    }
    return error;
  }

  private record(
    auth: AuthContext,
    action: string,
    entityType: string,
    entityId: string,
    ip?: string,
    metadata?: Prisma.InputJsonObject,
  ) {
    return this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action,
      entityType,
      entityId,
      metadata,
      ip,
    });
  }
}
