import {
  BadRequestException,
  ConflictException,
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
import { NotificationsService } from '../notifications/notifications.service.js';
import { CreateAdjustmentDto } from './dto/timetable.dto.js';
import {
  divisionLabel,
  personOf,
  TimetableData,
  type PersonRef,
  type Year,
} from './timetable-data.js';
import {
  overlaps,
  rankCandidates,
  to12Hour,
  weekdayOf,
  WEEKDAY_NAMES,
  type Candidate,
} from './timetable-rules.js';

const PERSON = {
  select: { id: true, firstName: true, surname: true },
} as const;
const DIVISION = {
  select: {
    id: true,
    name: true,
    class: { select: { id: true, name: true, sortOrder: true } },
  },
} as const;

const niceDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/** Changes for a single day: a substitute when a teacher is away, or a period that does not happen. */
@Injectable()
export class DayChangesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly data: TimetableData,
  ) {}

  /**
   * One day across the school: the teachers on approved leave and each of their periods (covered or
   * still needing a substitute), and every change made for that day.
   */
  async day(auth: AuthContext, date = todayInIndia()) {
    const year = await this.data.currentYear(auth.schoolId);
    const weekday = weekdayOf(date);
    const [holidays, leave, adjustments] = await Promise.all([
      this.data.staffHolidays(auth.schoolId, date, date),
      this.data.approvedLeaveOn(auth.schoolId, date),
      this.prisma.timetableAdjustment.findMany({
        where: {
          schoolId: auth.schoolId,
          date: toDate(date),
          archivedAt: null,
        },
        include: {
          division: DIVISION,
          slot: true,
          substitute: PERSON,
          subject: { select: { id: true, name: true } },
          createdBy: { select: { fullName: true } },
        },
      }),
    ]);
    const lessonsOfAbsent = leave.size
      ? await this.prisma.timetableEntry.findMany({
          where: {
            schoolId: auth.schoolId,
            academicYearId: year.id,
            weekday,
            staffId: { in: [...leave.keys()] },
          },
          include: {
            slot: true,
            division: DIVISION,
            subject: { select: { id: true, name: true } },
            staff: PERSON,
          },
        })
      : [];
    const changeAt = new Map(
      adjustments.map((a) => [`${a.divisionId}:${a.slotId}`, a]),
    );

    // The regular lesson behind each change, to show whose period it was.
    const regular = adjustments.length
      ? await this.prisma.timetableEntry.findMany({
          where: {
            schoolId: auth.schoolId,
            academicYearId: year.id,
            weekday,
            OR: adjustments.map((a) => ({
              divisionId: a.divisionId,
              slotId: a.slotId,
            })),
          },
          include: {
            staff: PERSON,
            subject: { select: { id: true, name: true } },
          },
        })
      : [];
    const regularAt = new Map(
      regular.map((r) => [`${r.divisionId}:${r.slotId}`, r]),
    );

    const away = new Map<
      string,
      {
        staff: PersonRef;
        halfDay: boolean;
        leaveType: string;
        periods: unknown[];
      }
    >();
    for (const e of lessonsOfAbsent) {
      const l = leave.get(e.staffId!)!;
      const entry = away.get(e.staffId!) ?? {
        staff: personOf(e.staff!),
        halfDay: l.halfDay,
        leaveType: l.leaveType,
        periods: [],
      };
      const change = changeAt.get(`${e.divisionId}:${e.slotId}`);
      entry.periods.push({
        division: { id: e.division.id, label: divisionLabel(e.division) },
        slot: {
          id: e.slot.id,
          label: e.slot.label,
          startsAt: e.slot.startsAt,
          endsAt: e.slot.endsAt,
        },
        subject: e.subject,
        change: change
          ? {
              id: change.id,
              kind: change.kind,
              substitute: change.substitute
                ? personOf(change.substitute)
                : null,
            }
          : null,
      });
      away.set(e.staffId!, entry);
    }
    // Teachers on leave with no lessons that day are still listed, so the office sees who is away.
    const noLessons = [...leave.keys()].filter((id) => !away.has(id));
    if (noLessons.length) {
      const names = await this.prisma.staff.findMany({
        where: { id: { in: noLessons } },
        select: PERSON.select,
      });
      for (const s of names) {
        const l = leave.get(s.id)!;
        away.set(s.id, {
          staff: personOf(s),
          halfDay: l.halfDay,
          leaveType: l.leaveType,
          periods: [],
        });
      }
    }
    const sortPeriods = (p: unknown[]) =>
      (p as { slot: { startsAt: string } }[]).sort((a, b) =>
        a.slot.startsAt.localeCompare(b.slot.startsAt),
      );

    return {
      academicYear: { id: year.id, name: year.name },
      date,
      weekday,
      dayName: WEEKDAY_NAMES[weekday],
      holiday: holidays.get(date) ?? null,
      onLeave: [...away.values()]
        .map((a) => ({ ...a, periods: sortPeriods(a.periods) }))
        .sort((a, b) => a.staff.fullName.localeCompare(b.staff.fullName)),
      needsSubstitute: [...away.values()].reduce(
        (n, a) =>
          n +
          (a.periods as { change: unknown }[]).filter((p) => !p.change).length,
        0,
      ),
      changes: adjustments
        .map((a) => {
          const r = regularAt.get(`${a.divisionId}:${a.slotId}`);
          return {
            id: a.id,
            kind: a.kind,
            date: toIso(a.date),
            division: {
              id: a.division.id,
              label: divisionLabel(a.division),
              order: a.division.class.sortOrder,
            },
            slot: {
              id: a.slot.id,
              label: a.slot.label,
              startsAt: a.slot.startsAt,
              endsAt: a.slot.endsAt,
            },
            regularStaff: r?.staff ? personOf(r.staff) : null,
            regularSubject: r?.subject ?? null,
            substitute: a.substitute ? personOf(a.substitute) : null,
            subject: a.subject,
            reason: a.reason,
            by: a.createdBy.fullName,
            createdAt: a.createdAt,
          };
        })
        .sort(
          (a, b) =>
            a.slot.startsAt.localeCompare(b.slot.startsAt) ||
            a.division.order - b.division.order ||
            a.division.label.localeCompare(b.division.label),
        )
        .map(({ division: { order: _o, ...division }, ...rest }) => ({
          ...rest,
          division,
        })),
    };
  }

  /**
   * Teachers free to take a period on a day: in school (not on leave), not teaching then (their own
   * lesson cancelled or covered counts as free) and not already covering another class. Best first.
   */
  async freeTeachers(
    auth: AuthContext,
    date: string,
    divisionId: string,
    slotId: string,
  ) {
    const year = await this.data.currentYear(auth.schoolId);
    const { slot, entry, division } = await this.place(
      auth,
      year,
      date,
      divisionId,
      slotId,
    );
    const weekday = weekdayOf(date);

    const teachers = await this.prisma.staff.findMany({
      where: {
        schoolId: auth.schoolId,
        status: 'ACTIVE',
        OR: [
          { staffType: { isTeaching: true } },
          { subjectsTaught: { some: { academicYearId: year.id } } },
          { classTeacherOf: { some: { academicYearId: year.id } } },
          { timetableEntries: { some: { academicYearId: year.id } } },
          // A teacher's login, even before they have a staff type or classes this year.
          {
            user: {
              status: 'ACTIVE',
              roles: {
                some: {
                  role: {
                    permissions: {
                      some: { permission: { code: 'marks.enter' } },
                    },
                  },
                },
              },
            },
          },
        ],
      },
      select: { id: true, firstName: true, surname: true },
    });
    const ids = teachers.map((t) => t.id);
    const [lessons, dayChanges, leave, assignments] = await Promise.all([
      this.prisma.timetableEntry.findMany({
        where: {
          schoolId: auth.schoolId,
          academicYearId: year.id,
          weekday,
          staffId: { in: ids },
        },
        select: {
          staffId: true,
          divisionId: true,
          slotId: true,
          slot: { select: { startsAt: true, endsAt: true } },
        },
      }),
      this.prisma.timetableAdjustment.findMany({
        where: {
          schoolId: auth.schoolId,
          date: toDate(date),
          archivedAt: null,
        },
        select: {
          divisionId: true,
          slotId: true,
          substituteStaffId: true,
          slot: { select: { startsAt: true, endsAt: true } },
        },
      }),
      this.data.approvedLeaveOn(auth.schoolId, date, ids),
      Promise.all([
        this.prisma.subjectTeacher.findMany({
          where: {
            schoolId: auth.schoolId,
            academicYearId: year.id,
            divisionId,
          },
          select: { staffId: true, subjectId: true },
        }),
        this.prisma.classTeacher.findMany({
          where: {
            schoolId: auth.schoolId,
            academicYearId: year.id,
            divisionId,
          },
          select: { staffId: true },
        }),
      ]),
    ]);
    const changed = new Set(
      dayChanges.map((c) => `${c.divisionId}:${c.slotId}`),
    );
    const [subjectTeachers, classTeachers] = assignments;
    const inDivision = new Set([
      ...subjectTeachers.map((s) => s.staffId),
      ...classTeachers.map((c) => c.staffId),
    ]);

    const busy = new Set<string>();
    const load = new Map<string, number>();
    for (const l of lessons) {
      // A lesson cancelled or covered that day frees its teacher.
      if (changed.has(`${l.divisionId}:${l.slotId}`)) continue;
      load.set(l.staffId!, (load.get(l.staffId!) ?? 0) + 1);
      if (overlaps(l.slot, slot)) busy.add(l.staffId!);
    }
    for (const c of dayChanges) {
      if (!c.substituteStaffId) continue;
      load.set(c.substituteStaffId, (load.get(c.substituteStaffId) ?? 0) + 1);
      if (overlaps(c.slot, slot)) busy.add(c.substituteStaffId);
    }

    const candidates: (Candidate & { halfDayLeave: boolean })[] = [];
    for (const t of teachers) {
      if (t.id === entry.staffId || busy.has(t.id)) continue;
      const l = leave.get(t.id);
      if (l && !l.halfDay) continue;
      candidates.push({
        staffId: t.id,
        name: `${t.firstName} ${t.surname}`,
        teachesSubjectHere:
          !!entry.subjectId &&
          subjectTeachers.some(
            (s) => s.staffId === t.id && s.subjectId === entry.subjectId,
          ),
        teachesDivision: inDivision.has(t.id),
        periodsThatDay: load.get(t.id) ?? 0,
        halfDayLeave: !!l,
      });
    }
    return {
      date,
      division: { id: division.id, label: divisionLabel(division) },
      slot: {
        id: slot.id,
        label: slot.label,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      },
      teachers: rankCandidates(candidates).map((c) => ({
        id: c.staffId,
        fullName: c.name,
        teachesSubjectHere: c.teachesSubjectHere,
        teachesDivision: c.teachesDivision,
        periodsThatDay: c.periodsThatDay,
        halfDayLeave: c.halfDayLeave,
      })),
    };
  }

  async create(auth: AuthContext, dto: CreateAdjustmentDto, ip?: string) {
    const year = await this.data.currentYear(auth.schoolId);
    const weekday = weekdayOf(dto.date);
    const created = await this.prisma.$transaction(async (tx) => {
      await this.data.lock(tx, auth.schoolId, year.id);
      const { slot, entry, division } = await this.place(
        auth,
        year,
        dto.date,
        dto.divisionId,
        dto.slotId,
        tx,
      );
      let substitute: {
        id: string;
        firstName: string;
        surname: string;
        userId: string | null;
      } | null = null;
      if (dto.kind === 'SUBSTITUTE') {
        const s = await tx.staff.findFirst({
          where: { id: dto.substituteStaffId, schoolId: auth.schoolId },
          select: {
            id: true,
            firstName: true,
            surname: true,
            userId: true,
            status: true,
          },
        });
        if (!s) throw new NotFoundException('Staff member not found');
        if (s.status !== 'ACTIVE')
          throw new BadRequestException(
            'That person has left. Choose a current member of staff.',
          );
        if (s.id === entry.staffId)
          throw new BadRequestException(
            'That is the usual teacher of this period',
          );
        const name = `${s.firstName} ${s.surname}`;
        const leave = await this.data.approvedLeaveOn(auth.schoolId, dto.date, [
          s.id,
        ]);
        if (leave.get(s.id) && !leave.get(s.id)!.halfDay)
          throw new ConflictException(
            `${name} is on leave on ${niceDate(dto.date)}`,
          );
        // Not teaching at that time (unless that lesson is itself cancelled or covered), not covering elsewhere.
        const [own, covering, changes] = await Promise.all([
          tx.timetableEntry.findMany({
            where: {
              schoolId: auth.schoolId,
              academicYearId: year.id,
              weekday,
              staffId: s.id,
            },
            include: {
              slot: true,
              division: {
                select: { name: true, class: { select: { name: true } } },
              },
            },
          }),
          tx.timetableAdjustment.findMany({
            where: {
              schoolId: auth.schoolId,
              date: toDate(dto.date),
              archivedAt: null,
              substituteStaffId: s.id,
            },
            include: {
              slot: true,
              division: {
                select: { name: true, class: { select: { name: true } } },
              },
            },
          }),
          tx.timetableAdjustment.findMany({
            where: {
              schoolId: auth.schoolId,
              date: toDate(dto.date),
              archivedAt: null,
            },
            select: { divisionId: true, slotId: true },
          }),
        ]);
        const freed = new Set(
          changes.map((c) => `${c.divisionId}:${c.slotId}`),
        );
        const clash =
          own.find(
            (l) =>
              !freed.has(`${l.divisionId}:${l.slotId}`) &&
              overlaps(l.slot, slot),
          ) ?? covering.find((c) => overlaps(c.slot, slot));
        if (clash)
          throw new ConflictException(
            `${name} is in ${divisionLabel(clash.division)}, ${clash.slot.label} at that time`,
          );
        substitute = s;
      }
      if (dto.subjectId) {
        const subject = await tx.subject.findFirst({
          where: { id: dto.subjectId, schoolId: auth.schoolId },
          select: { id: true },
        });
        if (!subject) throw new NotFoundException('Subject not found');
      }
      try {
        const row = await tx.timetableAdjustment.create({
          data: {
            schoolId: auth.schoolId,
            academicYearId: year.id,
            date: toDate(dto.date),
            divisionId: division.id,
            slotId: slot.id,
            kind: dto.kind,
            substituteStaffId: substitute?.id ?? null,
            subjectId:
              dto.kind === 'SUBSTITUTE' ? (dto.subjectId ?? null) : null,
            reason: dto.reason,
            createdById: auth.userId,
          },
        });
        return { row, slot, entry, division, substitute };
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        )
          throw new ConflictException(
            'This period already has a change that day. Undo it first.',
          );
        throw e;
      }
    });

    const { row, slot, entry, division, substitute } = created;
    const label = divisionLabel(division);
    const when = `${niceDate(dto.date)}, ${slot.label} (${to12Hour(slot.startsAt)}–${to12Hour(slot.endsAt)})`;
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action:
        dto.kind === 'SUBSTITUTE'
          ? 'timetable.substitute_set'
          : 'timetable.period_cancelled',
      entityType: 'timetable_adjustment',
      entityId: row.id,
      metadata: {
        date: dto.date,
        division: label,
        slot: slot.label,
        substituteStaffId: substitute?.id ?? null,
      },
      ip,
    });
    const link = `/app/my-timetable?weekOf=${dto.date}`;
    if (substitute)
      await this.notifications.notify(auth.schoolId, [substitute.userId], {
        type: 'timetable.substitute',
        title: `Please take ${label} on ${when}`,
        body: entry.subject
          ? `${entry.subject.name}, in place of ${entry.staff ? personOf(entry.staff).fullName : 'the usual teacher'}.`
          : undefined,
        link,
      });
    if (entry.staff?.userId && entry.staff.userId !== auth.userId)
      await this.notifications.notify(auth.schoolId, [entry.staff.userId], {
        type:
          dto.kind === 'SUBSTITUTE'
            ? 'timetable.covered'
            : 'timetable.cancelled',
        title:
          dto.kind === 'SUBSTITUTE'
            ? `${substitute!.firstName} ${substitute!.surname} takes your ${label} period on ${when}`
            : `Your ${label} period on ${when} is cancelled`,
        body: dto.reason,
        link,
      });
    return { id: row.id };
  }

  /** Undoes a change for a day (it is kept on record, archived). */
  async remove(auth: AuthContext, id: string, ip?: string) {
    const a = await this.prisma.timetableAdjustment.findFirst({
      where: { id, schoolId: auth.schoolId, archivedAt: null },
      include: {
        slot: true,
        division: { select: { name: true, class: { select: { name: true } } } },
        substitute: { select: { userId: true } },
      },
    });
    if (!a) throw new NotFoundException('Change not found');
    await this.prisma.timetableAdjustment.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'timetable.adjustment_removed',
      entityType: 'timetable_adjustment',
      entityId: id,
      metadata: { kind: a.kind, date: toIso(a.date) },
      ip,
    });
    const date = toIso(a.date);
    if (a.substitute?.userId && date >= todayInIndia())
      await this.notifications.notify(auth.schoolId, [a.substitute.userId], {
        type: 'timetable.substitute_removed',
        title: `You no longer take ${divisionLabel(a.division)} on ${niceDate(date)}, ${a.slot.label}`,
        link: `/app/my-timetable?weekOf=${date}`,
      });
  }

  /**
   * Checks a division's period on a date can be changed: a school day in the current year, not a
   * holiday for that class, a teaching period of its timings that runs that day, and a lesson in it.
   */
  private async place(
    auth: AuthContext,
    year: Year,
    date: string,
    divisionId: string,
    slotId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    if (!isIsoDate(date)) throw new BadRequestException('Not a date');
    if (date < year.startsOn || date > year.endsOn)
      throw new BadRequestException(`Choose a day in ${year.name}`);
    const weekday = weekdayOf(date);
    if (weekday === 7)
      throw new BadRequestException('Sunday is not a school day');
    const division = await db.division.findFirst({
      where: { id: divisionId, schoolId: auth.schoolId },
      select: DIVISION.select,
    });
    if (!division) throw new NotFoundException('Division not found');
    const holiday = await this.data.divisionHolidays(
      auth.schoolId,
      division,
      date,
      date,
    );
    if (holiday.has(date))
      throw new BadRequestException(
        `${niceDate(date)} is a holiday (${holiday.get(date)})`,
      );
    const schedule = await this.data.scheduleOfClass(
      auth.schoolId,
      year.id,
      division.class.id,
      db,
    );
    const slot = schedule?.slots.find((s) => s.id === slotId);
    if (!slot) throw new NotFoundException('Period not found');
    if (slot.kind === 'BREAK' || !slot.days.includes(weekday))
      throw new BadRequestException(
        `${slot.label} does not run on ${WEEKDAY_NAMES[weekday]}`,
      );
    const entry = await db.timetableEntry.findFirst({
      where: { divisionId, slotId, weekday, academicYearId: year.id },
      include: {
        subject: { select: { id: true, name: true } },
        staff: {
          select: { id: true, firstName: true, surname: true, userId: true },
        },
      },
    });
    if (!entry || (!entry.subjectId && !entry.staffId))
      throw new BadRequestException(
        `${divisionLabel(division)} has a free period then; there is nothing to change`,
      );
    return { slot, entry, division };
  }
}
