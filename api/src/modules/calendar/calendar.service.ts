import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  isIsoDate,
  toDate,
  toIso,
  todayInIndia,
} from '../attendance/attendance-rules.js';
import { AuditService } from '../audit/audit.service.js';
import { NoticesService, Scope } from '../notices/notices.service.js';
import {
  announcementBody,
  daysBetween,
  MAX_RANGE_DAYS,
  timingProblem,
} from './calendar-rules.js';
import {
  CreateEventDto,
  RangeQueryDto,
  UpdateEventDto,
} from './dto/calendar.dto.js';

const INCLUDE = {
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
} satisfies Prisma.CalendarEventInclude;
type Row = Prisma.CalendarEventGetPayload<{ include: typeof INCLUDE }>;

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notices: NoticesService,
  ) {}

  /** Same audiences as a notice: everyone, staff, or the classes and divisions chosen. */
  private visible(
    auth: AuthContext,
    scope: Scope,
  ): Prisma.CalendarEventWhereInput {
    const base = { schoolId: auth.schoolId, archivedAt: null };
    if (auth.permissions.includes('notices.read_all')) return base;
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

  /** Events that touch the days from..to (inclusive), earliest first. */
  async list(auth: AuthContext, q: RangeQueryDto) {
    if (!isIsoDate(q.from) || !isIsoDate(q.to)) {
      throw new BadRequestException('from and to must be real dates');
    }
    if (q.to < q.from) throw new BadRequestException('to is before from');
    if (daysBetween(q.from, q.to) > MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `Ask for at most ${MAX_RANGE_DAYS} days at a time`,
      );
    }
    const scope = await this.notices.scope(auth);
    const rows = await this.prisma.calendarEvent.findMany({
      where: {
        AND: [
          this.visible(auth, scope),
          { startsOn: { lte: toDate(q.to) }, endsOn: { gte: toDate(q.from) } },
        ],
      },
      include: INCLUDE,
      orderBy: [
        { startsOn: 'asc' },
        { startTime: 'asc' },
        { createdAt: 'asc' },
      ],
      take: 500,
    });
    return rows.map((r) => this.view(auth, r));
  }

  /** Who the signed-in person may address an event to. */
  audiences(auth: AuthContext) {
    return this.notices.audiences(auth);
  }

  async create(auth: AuthContext, dto: CreateEventDto, ip?: string) {
    const endsOn = dto.endsOn ?? dto.startsOn;
    this.checkTiming({
      startsOn: dto.startsOn,
      endsOn,
      startTime: dto.startTime ?? null,
      endTime: dto.endTime ?? null,
    });
    if (dto.announce && endsOn < todayInIndia()) {
      throw new BadRequestException(
        'A notice cannot be sent about an event that is already over',
      );
    }
    const targets = await this.notices.checkAudience(auth, dto.audience, dto);

    let noticeId: string | null = null;
    if (dto.announce) {
      const notice = await this.notices.create(
        auth,
        {
          title: `${this.prefix(dto.category)}${dto.title}`,
          body: announcementBody({
            startsOn: dto.startsOn,
            endsOn,
            startTime: dto.startTime ?? null,
            endTime: dto.endTime ?? null,
            description: dto.description ?? null,
          }),
          audience: dto.audience,
          classIds: dto.classIds,
          divisionIds: dto.divisionIds,
          expiresOn: endsOn,
        },
        ip,
      );
      noticeId = notice.id;
    }

    const created = await this.prisma.calendarEvent.create({
      data: {
        schoolId: auth.schoolId,
        title: dto.title,
        description: dto.description || null,
        category: dto.category ?? 'EVENT',
        startsOn: toDate(dto.startsOn),
        endsOn: toDate(endsOn),
        startTime: dto.startTime ?? null,
        endTime: dto.endTime ?? null,
        audience: dto.audience,
        noticeId,
        createdById: auth.userId,
        targets: { create: targets },
      },
      select: { id: true },
    });
    await this.record(auth, 'calendar.event_created', created.id, ip, {
      audience: dto.audience,
      announced: noticeId !== null,
    });
    return this.one(auth, created.id);
  }

  async update(
    auth: AuthContext,
    id: string,
    dto: UpdateEventDto,
    ip?: string,
  ) {
    const current = await this.find(auth, id);
    const next = {
      startsOn: dto.startsOn ?? toIso(current.startsOn),
      endsOn: dto.endsOn ?? toIso(current.endsOn),
      startTime:
        dto.startTime !== undefined ? dto.startTime : current.startTime,
      endTime: dto.endTime !== undefined ? dto.endTime : current.endTime,
    };
    // Moving the first day without the last keeps a one-day event one day long.
    if (
      dto.startsOn &&
      !dto.endsOn &&
      current.startsOn.getTime() === current.endsOn.getTime()
    ) {
      next.endsOn = dto.startsOn;
    }
    if (!isIsoDate(next.startsOn) || !isIsoDate(next.endsOn)) {
      throw new BadRequestException('The dates are not real dates');
    }
    this.checkTiming(next);

    const audience = dto.audience ?? current.audience;
    const retarget =
      dto.audience !== undefined ||
      dto.classIds !== undefined ||
      dto.divisionIds !== undefined;
    const keep = audience === current.audience;
    const targets = retarget
      ? await this.notices.checkAudience(auth, audience, {
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
      await tx.calendarEvent.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description || null }
            : {}),
          ...(dto.category !== undefined ? { category: dto.category } : {}),
          ...(dto.audience !== undefined ? { audience: dto.audience } : {}),
          startsOn: toDate(next.startsOn),
          endsOn: toDate(next.endsOn),
          startTime: next.startTime,
          endTime: next.endTime,
        },
      });
      if (targets) {
        await tx.calendarEventTarget.deleteMany({ where: { eventId: id } });
        await tx.calendarEventTarget.createMany({
          data: targets.map((t) => ({ ...t, eventId: id })),
        });
      }
    });
    await this.record(auth, 'calendar.event_updated', id, ip);
    return this.one(auth, id);
  }

  /** Takes an event off the calendar. It is kept, never deleted. */
  async archive(auth: AuthContext, id: string, ip?: string) {
    await this.find(auth, id);
    await this.prisma.calendarEvent.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    await this.record(auth, 'calendar.event_archived', id, ip);
  }

  // ---------- helpers ----------

  private async one(auth: AuthContext, id: string) {
    return this.view(auth, await this.find(auth, id));
  }

  private async find(auth: AuthContext, id: string): Promise<Row> {
    const row = await this.prisma.calendarEvent.findFirst({
      where: { id, schoolId: auth.schoolId, archivedAt: null },
      include: INCLUDE,
    });
    if (!row) throw new NotFoundException('Event not found');
    return row;
  }

  private checkTiming(t: {
    startsOn: string;
    endsOn: string;
    startTime: string | null;
    endTime: string | null;
  }) {
    if (!isIsoDate(t.startsOn) || !isIsoDate(t.endsOn)) {
      throw new BadRequestException('The dates are not real dates');
    }
    const problem = timingProblem(t);
    if (problem) throw new BadRequestException(problem);
  }

  private prefix(category?: string) {
    return category === 'HOLIDAY'
      ? 'Holiday: '
      : category === 'EXAM'
        ? 'Exam: '
        : category === 'MEETING'
          ? 'Meeting: '
          : 'Event: ';
  }

  private view(auth: AuthContext, r: Row) {
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      category: r.category,
      startsOn: toIso(r.startsOn),
      endsOn: toIso(r.endsOn),
      startTime: r.startTime,
      endTime: r.endTime,
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
      announced: r.noticeId !== null,
      canChange: auth.permissions.includes('calendar.manage'),
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
      entityType: 'calendar_event',
      entityId,
      metadata,
      ip,
    });
  }
}
