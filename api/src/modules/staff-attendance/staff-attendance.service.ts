import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  MAX_RANGE_DAYS,
  Status,
  daysBetween,
  isIsoDate,
  summarise,
  tally,
  toDate,
  toIso,
  todayInIndia,
} from '../attendance/attendance-rules.js';
import { AuditService } from '../audit/audit.service.js';
import { MarkStaffAttendanceDto } from './dto/staff-attendance.dto.js';

const fullName = (s: { firstName: string; surname: string }) =>
  `${s.firstName} ${s.surname}`;

/**
 * Attendance of the school's own staff (teachers and others). The school admin marks, changes and
 * removes it. Teachers and other staff see only their own. How people will check in and out is not
 * decided yet; every record is MANUAL for now and the table has room for check-in and check-out.
 */
@Injectable()
export class StaffAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private day(value: string | undefined, name = 'date'): string {
    const iso = value ?? todayInIndia();
    if (!isIsoDate(iso))
      throw new BadRequestException(`${name} is not a real date`);
    return iso;
  }

  private range(q: { from?: string; to?: string }) {
    const to = this.day(q.to, 'to');
    const from = this.day(q.from ?? `${to.slice(0, 8)}01`, 'from');
    if (from > to) throw new BadRequestException('from must not be after to');
    if (daysBetween(from, to) > MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `Choose a range of at most ${MAX_RANGE_DAYS} days`,
      );
    }
    return { from, to };
  }

  /** Staff who had joined by a day and had not yet left. */
  private working(schoolId: string, iso: string) {
    const date = toDate(iso);
    return this.prisma.staff.findMany({
      where: {
        schoolId,
        joinedOn: { lte: date },
        OR: [{ leftOn: null }, { leftOn: { gte: date } }],
      },
      select: {
        id: true,
        employeeNo: true,
        firstName: true,
        surname: true,
        designation: true,
      },
      orderBy: [{ firstName: 'asc' }, { surname: 'asc' }],
    });
  }

  /** Everyone working on a day, with their mark if there is one. */
  async roster(auth: AuthContext, dateIso?: string) {
    const iso = this.day(dateIso);
    const [staff, records] = await Promise.all([
      this.working(auth.schoolId, iso),
      this.prisma.staffAttendanceRecord.findMany({
        where: { schoolId: auth.schoolId, date: toDate(iso) },
        include: { markedBy: { select: { fullName: true } } },
      }),
    ]);
    const byStaff = new Map(records.map((r) => [r.staffId, r]));
    const rows = staff.map((s) => {
      const r = byStaff.get(s.id);
      return {
        staffId: s.id,
        employeeNo: s.employeeNo,
        name: fullName(s),
        designation: s.designation,
        status: (r?.status ?? null) as Status | null,
        note: r?.note ?? null,
        markedBy: r?.markedBy.fullName ?? null,
      };
    });
    return {
      date: iso,
      canMark: auth.permissions.includes('staff_attendance.manage'),
      marked: records.length > 0,
      counts: summarise(
        tally(rows.flatMap((r) => (r.status ? [r.status] : []))),
      ),
      staff: rows,
    };
  }

  /** Saves marks for the staff sent. Sending someone again changes their mark. */
  async mark(auth: AuthContext, dto: MarkStaffAttendanceDto, ip?: string) {
    const iso = this.day(dto.date);
    if (iso > todayInIndia()) {
      throw new BadRequestException(
        'Attendance cannot be marked for a future date',
      );
    }
    const ids = dto.entries.map((e) => e.staffId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('A person appears more than once');
    }
    const allowed = new Set(
      (await this.working(auth.schoolId, iso)).map((s) => s.id),
    );
    if (ids.some((id) => !allowed.has(id))) {
      throw new BadRequestException(
        'Some people were not working at the school on that date',
      );
    }
    await this.prisma.$transaction(
      dto.entries.map((e) =>
        this.prisma.staffAttendanceRecord.upsert({
          where: { staffId_date: { staffId: e.staffId, date: toDate(iso) } },
          create: {
            schoolId: auth.schoolId,
            staffId: e.staffId,
            date: toDate(iso),
            status: e.status,
            note: e.note || null,
            markedById: auth.userId,
          },
          update: {
            status: e.status,
            note: e.note || null,
            markedById: auth.userId,
          },
        }),
      ),
    );
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'staff_attendance.marked',
      entityType: 'staff_attendance',
      entityId: iso,
      metadata: { date: iso, people: ids.length },
      ip,
    });
    return this.roster(auth, iso);
  }

  /** Removes one person's mark for a day. */
  async clear(
    auth: AuthContext,
    staffId: string,
    dateIso: string | undefined,
    ip?: string,
  ) {
    if (!dateIso)
      throw new BadRequestException('Say which date (date=YYYY-MM-DD)');
    const iso = this.day(dateIso);
    const record = await this.prisma.staffAttendanceRecord.findFirst({
      where: { schoolId: auth.schoolId, staffId, date: toDate(iso) },
      select: { id: true, status: true },
    });
    if (!record) throw new NotFoundException('There is no mark to remove');
    await this.prisma.staffAttendanceRecord.delete({
      where: { id: record.id },
    });
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'staff_attendance.mark_removed',
      entityType: 'staff',
      entityId: staffId,
      metadata: { date: iso, was: record.status },
      ip,
    });
    return this.roster(auth, iso);
  }

  /** Everyone's marks over a range, as a grid (people down, days across). */
  async report(auth: AuthContext, q: { from?: string; to?: string }) {
    const { from, to } = this.range(q);
    const [staff, records] = await Promise.all([
      this.prisma.staff.findMany({
        where: {
          schoolId: auth.schoolId,
          joinedOn: { lte: toDate(to) },
          OR: [{ leftOn: null }, { leftOn: { gte: toDate(from) } }],
        },
        select: {
          id: true,
          employeeNo: true,
          firstName: true,
          surname: true,
          designation: true,
        },
        orderBy: [{ firstName: 'asc' }, { surname: 'asc' }],
      }),
      this.prisma.staffAttendanceRecord.findMany({
        where: {
          schoolId: auth.schoolId,
          date: { gte: toDate(from), lte: toDate(to) },
        },
        select: { staffId: true, status: true, date: true },
      }),
    ]);
    return this.grid(
      from,
      to,
      staff.map((s) => ({
        staffId: s.id,
        employeeNo: s.employeeNo,
        name: fullName(s),
        designation: s.designation,
      })),
      records,
    );
  }

  /** The signed-in person's own marks. */
  async mine(auth: AuthContext, q: { from?: string; to?: string }) {
    const { from, to } = this.range(q);
    const me = await this.prisma.staff.findFirst({
      where: { schoolId: auth.schoolId, userId: auth.userId },
      select: {
        id: true,
        employeeNo: true,
        firstName: true,
        surname: true,
        designation: true,
      },
    });
    if (!me) throw new NotFoundException('You have no staff record');
    const records = await this.prisma.staffAttendanceRecord.findMany({
      where: {
        staffId: me.id,
        date: { gte: toDate(from), lte: toDate(to) },
      },
      select: { staffId: true, status: true, date: true, note: true },
      orderBy: { date: 'desc' },
    });
    return {
      ...this.grid(
        from,
        to,
        [
          {
            staffId: me.id,
            employeeNo: me.employeeNo,
            name: fullName(me),
            designation: me.designation,
          },
        ],
        records,
      ),
      records: records.map((r) => ({
        date: toIso(r.date),
        status: r.status as Status,
        note: r.note,
      })),
    };
  }

  private grid(
    from: string,
    to: string,
    people: {
      staffId: string;
      employeeNo: string;
      name: string;
      designation: string;
    }[],
    records: { staffId: string; status: Status; date: Date }[],
  ) {
    const days = new Map<string, Record<string, Status>>();
    const list = new Map<string, Status[]>();
    const taken = new Set<string>();
    for (const r of records) {
      const iso = toIso(r.date);
      taken.add(iso);
      days.set(r.staffId, { ...days.get(r.staffId), [iso]: r.status });
      list.set(r.staffId, [...(list.get(r.staffId) ?? []), r.status]);
    }
    return {
      from,
      to,
      daysMarked: taken.size,
      markedDates: [...taken].sort(),
      people: people.map((p) => ({
        ...p,
        ...summarise(tally(list.get(p.staffId) ?? [])),
        days: days.get(p.staffId) ?? {},
      })),
    };
  }
}
