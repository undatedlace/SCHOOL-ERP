import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { Page, skipTake } from '../../common/dto/page-query.dto.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { NoticeAudience } from '../../generated/prisma/enums.js';
import { AuditService } from '../audit/audit.service.js';
import {
  isIsoDate,
  toDate,
  toIso,
  todayInIndia,
} from '../attendance/attendance-rules.js';
import {
  CreateNoticeDto,
  ListNoticesQueryDto,
  UpdateNoticeDto,
} from './dto/notices.dto.js';

const INCLUDE = {
  createdBy: { select: { id: true, fullName: true } },
  targets: {
    include: {
      class: { select: { id: true, name: true } },
      division: {
        select: {
          id: true,
          name: true,
          class: { select: { id: true, name: true } },
        },
      },
    },
  },
} satisfies Prisma.NoticeInclude;
type Row = Prisma.NoticeGetPayload<{ include: typeof INCLUDE }>;

export interface Scope {
  /** A parent or student who is not also a member of staff. */
  portalOnly: boolean;
  classIds: string[];
  divisionIds: string[];
  /** Divisions the person teaches (the only ones a teacher may write to). */
  taughtDivisionIds: string[];
}

@Injectable()
export class NoticesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private can(auth: AuthContext, permission: string) {
    return auth.permissions.includes(permission);
  }

  // ---------- who belongs to which audience ----------

  /** Which classes and divisions this person belongs to (also used by the calendar). */
  async scope(auth: AuthContext): Promise<Scope> {
    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId: auth.schoolId, isCurrent: true },
      select: { id: true },
    });
    const me = {
      OR: [
        { userId: auth.userId },
        { guardians: { some: { guardian: { userId: auth.userId } } } },
      ],
    };
    const teacher = {
      academicYearId: year?.id ?? '',
      staff: { userId: auth.userId, status: 'ACTIVE' as const },
    };
    const [children, linked, staff, asClass, asSubject] = await Promise.all([
      year
        ? this.prisma.enrollment.findMany({
            where: {
              schoolId: auth.schoolId,
              academicYearId: year.id,
              student: { ...me, status: 'ACTIVE' },
            },
            select: {
              divisionId: true,
              division: { select: { classId: true } },
            },
          })
        : [],
      this.prisma.student.count({ where: me }),
      this.prisma.staff.count({ where: { userId: auth.userId } }),
      year
        ? this.prisma.classTeacher.findMany({
            where: teacher,
            select: { divisionId: true },
          })
        : [],
      year
        ? this.prisma.subjectTeacher.findMany({
            where: teacher,
            select: { divisionId: true },
          })
        : [],
    ]);
    const taught = [
      ...new Set([...asClass, ...asSubject].map((r) => r.divisionId)),
    ];
    const taughtDivs = taught.length
      ? await this.prisma.division.findMany({
          where: { id: { in: taught } },
          select: { id: true, classId: true },
        })
      : [];
    return {
      portalOnly: linked > 0 && staff === 0,
      divisionIds: [
        ...new Set([...children.map((c) => c.divisionId), ...taught]),
      ],
      classIds: [
        ...new Set([
          ...children.map((c) => c.division.classId),
          ...taughtDivs.map((d) => d.classId),
        ]),
      ],
      taughtDivisionIds: taught,
    };
  }

  /** Everything this person may read. Archived notices are never in it. */
  private visible(auth: AuthContext, scope: Scope): Prisma.NoticeWhereInput {
    const base = { schoolId: auth.schoolId, archivedAt: null };
    if (this.can(auth, 'notices.read_all')) return base;
    return {
      ...base,
      OR: [
        { createdById: auth.userId },
        { audience: 'ALL' },
        ...(scope.portalOnly ? [] : [{ audience: 'STAFF' as const }]),
        {
          audience: 'CLASSES',
          targets: { some: { classId: { in: scope.classIds } } },
        },
        {
          audience: 'DIVISIONS',
          targets: { some: { divisionId: { in: scope.divisionIds } } },
        },
      ],
    };
  }

  private mayChange(auth: AuthContext, createdById: string) {
    return createdById === auth.userId || this.can(auth, 'notices.manage_all');
  }

  // ---------- reading ----------

  async list(
    auth: AuthContext,
    q: ListNoticesQueryDto,
  ): Promise<Page<ReturnType<NoticesService['view']>>> {
    const scope = await this.scope(auth);
    const today = toDate(todayInIndia());
    const status = q.status ?? 'active';
    const showing: Prisma.NoticeWhereInput = {
      OR: [{ expiresOn: null }, { expiresOn: { gte: today } }],
    };
    const mine: Prisma.NoticeWhereInput = this.can(auth, 'notices.manage_all')
      ? {}
      : { createdById: auth.userId };
    const where: Prisma.NoticeWhereInput = {
      AND: [
        this.visible(auth, scope),
        status === 'active'
          ? showing
          : status === 'expired'
            ? { expiresOn: { lt: today } }
            : {},
        status === 'active' ? {} : mine,
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.notice.findMany({
        where,
        include: INCLUDE,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q),
      }),
      this.prisma.notice.count({ where }),
    ]);
    return {
      items: rows.map((r) => this.view(auth, r)),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async one(auth: AuthContext, id: string) {
    const scope = await this.scope(auth);
    const row = await this.prisma.notice.findFirst({
      where: { AND: [{ id }, this.visible(auth, scope)] },
      include: INCLUDE,
    });
    if (!row) throw new NotFoundException('Notice not found');
    // A notice past its last day is only for the people who may change it.
    if (
      row.expiresOn &&
      toIso(row.expiresOn) < todayInIndia() &&
      !this.mayChange(auth, row.createdById)
    ) {
      throw new NotFoundException('Notice not found');
    }
    return this.view(auth, row);
  }

  /** Who the signed-in person may send a notice to. */
  async audiences(auth: AuthContext) {
    const wide = this.can(auth, 'notices.read_all');
    const scope = wide ? null : await this.scope(auth);
    const divisions = await this.prisma.division.findMany({
      where: {
        schoolId: auth.schoolId,
        ...(scope ? { id: { in: scope.taughtDivisionIds } } : {}),
      },
      select: {
        id: true,
        name: true,
        class: { select: { id: true, name: true, sortOrder: true } },
      },
    });
    divisions.sort(
      (a, b) =>
        a.class.sortOrder - b.class.sortOrder || a.name.localeCompare(b.name),
    );
    const classes = wide
      ? await this.prisma.schoolClass.findMany({
          where: { schoolId: auth.schoolId },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, name: true },
        })
      : [];
    return {
      /** True for the people who may write to everyone, to staff, or to whole classes. */
      canAddressAnyone: wide,
      classes,
      divisions: divisions.map((d) => ({
        id: d.id,
        classId: d.class.id,
        label: `${d.class.name}-${d.name}`,
      })),
    };
  }

  // ---------- writing ----------

  async create(auth: AuthContext, dto: CreateNoticeDto, ip?: string) {
    const expiresOn = this.expiry(dto.expiresOn);
    const targets = await this.checkAudience(auth, dto.audience, dto);
    const created = await this.prisma.notice.create({
      data: {
        schoolId: auth.schoolId,
        title: dto.title,
        body: dto.body,
        audience: dto.audience,
        expiresOn,
        createdById: auth.userId,
        targets: { create: targets },
      },
      select: { id: true },
    });
    await this.record(auth, 'notice.created', created.id, ip, {
      audience: dto.audience,
    });
    return this.one(auth, created.id);
  }

  async update(
    auth: AuthContext,
    id: string,
    dto: UpdateNoticeDto,
    ip?: string,
  ) {
    const current = await this.prisma.notice.findFirst({
      where: { id, schoolId: auth.schoolId, archivedAt: null },
      include: { targets: true },
    });
    // Someone who could not see the notice gets the same answer as for one that is not there.
    if (!current) throw new NotFoundException('Notice not found');
    if (!this.mayChange(auth, current.createdById)) {
      await this.one(auth, id); // 404 when they cannot see it either
      throw new ForbiddenException(
        'Only the author or the school admin can change a notice',
      );
    }
    const audience = dto.audience ?? current.audience;
    const retarget =
      dto.audience !== undefined ||
      dto.classIds !== undefined ||
      dto.divisionIds !== undefined;
    // Changing the audience starts the targets afresh; otherwise the old ones carry over.
    const keep = audience === current.audience;
    const targets = retarget
      ? await this.checkAudience(auth, audience, {
          classIds:
            dto.classIds ??
            (keep
              ? current.targets.flatMap((t) => (t.classId ? [t.classId] : []))
              : []),
          divisionIds:
            dto.divisionIds ??
            (keep
              ? current.targets.flatMap((t) =>
                  t.divisionId ? [t.divisionId] : [],
                )
              : []),
        })
      : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.notice.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.body !== undefined ? { body: dto.body } : {}),
          ...(dto.audience !== undefined ? { audience: dto.audience } : {}),
          ...(dto.expiresOn !== undefined
            ? { expiresOn: this.expiry(dto.expiresOn) }
            : {}),
        },
      });
      if (targets) {
        await tx.noticeTarget.deleteMany({ where: { noticeId: id } });
        await tx.noticeTarget.createMany({
          data: targets.map((t) => ({ ...t, noticeId: id })),
        });
      }
    });
    await this.record(auth, 'notice.updated', id, ip);
    return this.one(auth, id);
  }

  /** Takes a notice down. It is kept, never deleted. */
  async archive(auth: AuthContext, id: string, ip?: string) {
    const current = await this.prisma.notice.findFirst({
      where: { id, schoolId: auth.schoolId, archivedAt: null },
      select: { createdById: true },
    });
    if (!current) throw new NotFoundException('Notice not found');
    if (!this.mayChange(auth, current.createdById)) {
      await this.one(auth, id);
      throw new ForbiddenException(
        'Only the author or the school admin can remove a notice',
      );
    }
    await this.prisma.notice.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    await this.record(auth, 'notice.archived', id, ip);
  }

  // ---------- helpers ----------

  private expiry(value: string | null | undefined): Date | null {
    if (value === null || value === undefined) return null;
    if (!isIsoDate(value))
      throw new BadRequestException('expiresOn is not a real date');
    if (value < todayInIndia()) {
      throw new BadRequestException('The last day cannot be in the past');
    }
    return toDate(value);
  }

  /** Checks the audience and returns the targets to save. */
  /** Also used by the calendar, which has the same audiences. */
  async checkAudience(
    auth: AuthContext,
    audience: NoticeAudience,
    ids: { classIds?: string[]; divisionIds?: string[] },
  ): Promise<{ classId?: string; divisionId?: string }[]> {
    const classIds = [...new Set(ids.classIds ?? [])];
    const divisionIds = [...new Set(ids.divisionIds ?? [])];
    const wide = this.can(auth, 'notices.read_all');

    if (audience === 'ALL' || audience === 'STAFF') {
      if (classIds.length || divisionIds.length) {
        throw new BadRequestException(
          'A notice to everyone or to staff does not have classes or divisions',
        );
      }
      if (!wide) {
        throw new ForbiddenException(
          'You can send notices to the divisions you teach',
        );
      }
      return [];
    }
    if (audience === 'CLASSES') {
      if (divisionIds.length) {
        throw new BadRequestException(
          'Choose classes, not divisions, for this audience',
        );
      }
      if (classIds.length === 0)
        throw new BadRequestException('Choose at least one class');
      if (!wide) {
        throw new ForbiddenException(
          'You can send notices to the divisions you teach',
        );
      }
      const found = await this.prisma.schoolClass.count({
        where: { schoolId: auth.schoolId, id: { in: classIds } },
      });
      if (found !== classIds.length)
        throw new BadRequestException('A chosen class does not exist');
      return classIds.map((classId) => ({ classId }));
    }
    // DIVISIONS
    if (classIds.length) {
      throw new BadRequestException(
        'Choose divisions, not classes, for this audience',
      );
    }
    if (divisionIds.length === 0)
      throw new BadRequestException('Choose at least one division');
    const found = await this.prisma.division.count({
      where: { schoolId: auth.schoolId, id: { in: divisionIds } },
    });
    if (found !== divisionIds.length)
      throw new BadRequestException('A chosen division does not exist');
    if (!wide) {
      const taught = new Set((await this.scope(auth)).taughtDivisionIds);
      if (divisionIds.some((d) => !taught.has(d))) {
        throw new ForbiddenException(
          'You can only send notices to divisions you teach',
        );
      }
    }
    return divisionIds.map((divisionId) => ({ divisionId }));
  }

  private view(auth: AuthContext, r: Row) {
    return {
      id: r.id,
      title: r.title,
      body: r.body,
      audience: r.audience,
      classes: r.targets.flatMap((t) => (t.class ? [t.class] : [])),
      divisions: r.targets.flatMap((t) =>
        t.division
          ? [
              {
                id: t.division.id,
                label: `${t.division.class.name}-${t.division.name}`,
              },
            ]
          : [],
      ),
      createdBy: r.createdBy,
      createdAt: r.createdAt,
      expiresOn: r.expiresOn ? toIso(r.expiresOn) : null,
      expired: r.expiresOn ? toIso(r.expiresOn) < todayInIndia() : false,
      canChange: this.mayChange(auth, r.createdById),
    };
  }

  private record(
    auth: AuthContext,
    action: string,
    entityId: string,
    ip?: string,
    metadata?: Prisma.InputJsonObject,
  ) {
    return this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action,
      entityType: 'notice',
      entityId,
      metadata,
      ip,
    });
  }
}
