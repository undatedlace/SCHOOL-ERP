import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { PrismaService } from '../../database/prisma.service.js';
import { toDate, toIso, todayInIndia } from '../attendance/attendance-rules.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  CopyTimetableDto,
  EntryDto,
  ReassignDto,
  SetEntriesDto,
} from './dto/timetable.dto.js';
import {
  divisionLabel,
  personOf,
  TimetableData,
  type Booking,
  type PersonRef,
  type Tx,
  type Year,
} from './timetable-data.js';
import { weekDates, weekdayOf, WEEKDAY_NAMES } from './timetable-rules.js';

const PERSON = {
  select: { id: true, firstName: true, surname: true },
} as const;
const DIVISION = {
  select: { id: true, name: true, class: { select: { id: true, name: true } } },
} as const;

/** A row down the side of the grid. For a class it is a row of its timings; for a teacher a time of day. */
export interface GridRow {
  key: string;
  kind: 'PERIOD' | 'BREAK' | 'ASSEMBLY';
  label: string;
  startsAt: string;
  endsAt: string;
  days: number[];
}

export interface GridCell {
  id: string;
  rowKey: string;
  slotId: string;
  weekday: number;
  subject: { id: string; name: string } | null;
  staff: PersonRef | null;
  room: string | null;
  division: { id: string; label: string };
}

export interface GridChange {
  id: string;
  date: string;
  rowKey: string;
  slotId: string;
  kind: 'SUBSTITUTE' | 'CANCELLED';
  division: { id: string; label: string };
  substitute: PersonRef | null;
  subject: { id: string; name: string } | null;
  /** Only for staff: it may say why a teacher is away. */
  reason: string | null;
}

export interface WeekView {
  academicYear: { id: string; name: string };
  today: string;
  weekOf: string;
  days: {
    date: string;
    weekday: number;
    name: string;
    holiday: string | null;
  }[];
  rows: GridRow[];
  cells: GridCell[];
  changes: GridChange[];
}

@Injectable()
export class TimetableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly data: TimetableData,
  ) {}

  // ---------- reading ----------

  /** A division's week: its timings, lessons, that week's changes and holidays, and the totals beside the grid. */
  async divisionWeek(auth: AuthContext, divisionId: string, weekOf?: string) {
    const year = await this.data.currentYear(auth.schoolId);
    const division = await this.data.divisionFor(auth, divisionId, year);
    const schedule = await this.data.scheduleOfClass(
      auth.schoolId,
      year.id,
      division.class.id,
    );
    const dates = weekDates(weekOf ?? todayInIndia());
    const staffSide = this.data.can(auth, 'timetable.read_all');

    const [entries, adjustments, holidays, classTeacher, subjectTeachers] =
      await Promise.all([
        this.prisma.timetableEntry.findMany({
          where: {
            schoolId: auth.schoolId,
            academicYearId: year.id,
            divisionId,
          },
          include: {
            subject: { select: { id: true, name: true } },
            staff: PERSON,
          },
        }),
        this.prisma.timetableAdjustment.findMany({
          where: {
            schoolId: auth.schoolId,
            divisionId,
            archivedAt: null,
            date: {
              gte: toDate(dates[0]),
              lte: toDate(dates[dates.length - 1]),
            },
          },
          include: {
            substitute: PERSON,
            subject: { select: { id: true, name: true } },
          },
        }),
        this.data.divisionHolidays(
          auth.schoolId,
          division,
          dates[0],
          dates[dates.length - 1],
        ),
        this.prisma.classTeacher.findFirst({
          where: {
            schoolId: auth.schoolId,
            academicYearId: year.id,
            divisionId,
          },
          select: { staff: PERSON },
        }),
        this.prisma.subjectTeacher.findMany({
          where: {
            schoolId: auth.schoolId,
            academicYearId: year.id,
            divisionId,
          },
          select: {
            subject: { select: { id: true, name: true } },
            staff: PERSON,
          },
        }),
      ]);
    const label = divisionLabel(division);
    const ref = { id: division.id, label };

    const cells: GridCell[] = entries.map((e) => ({
      id: e.id,
      rowKey: e.slotId,
      slotId: e.slotId,
      weekday: e.weekday,
      subject: e.subject,
      staff: e.staff ? personOf(e.staff) : null,
      room: e.room,
      division: ref,
    }));

    // Periods a week by subject, and who teaches it (from the timetable, then Academic setup).
    const periods = new Map<
      string,
      {
        subject: { id: string; name: string };
        count: number;
        staff: Map<string, PersonRef>;
      }
    >();
    for (const c of cells) {
      if (!c.subject) continue;
      const p = periods.get(c.subject.id) ?? {
        subject: c.subject,
        count: 0,
        staff: new Map(),
      };
      p.count++;
      if (c.staff) p.staff.set(c.staff.id, c.staff);
      periods.set(c.subject.id, p);
    }
    const team = new Map<
      string,
      { subject: { id: string; name: string }; staff: PersonRef[] }
    >();
    for (const p of periods.values())
      team.set(p.subject.id, {
        subject: p.subject,
        staff: [...p.staff.values()],
      });
    for (const st of subjectTeachers) {
      const t = team.get(st.subject.id) ?? { subject: st.subject, staff: [] };
      if (!t.staff.some((s) => s.id === st.staff.id))
        t.staff.push(personOf(st.staff));
      team.set(st.subject.id, t);
    }

    const view: WeekView & Record<string, unknown> = {
      ...this.frame(year, dates, holidays),
      rows: (schedule?.slots ?? []).map((s) => ({
        key: s.id,
        kind: s.kind,
        label: s.label,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        days: s.days,
      })),
      cells,
      changes: adjustments.map((a) => ({
        id: a.id,
        date: toIso(a.date),
        rowKey: a.slotId,
        slotId: a.slotId,
        kind: a.kind,
        division: ref,
        substitute: a.substitute ? personOf(a.substitute) : null,
        subject: a.subject,
        reason: staffSide ? a.reason : null,
      })),
    };
    return {
      ...view,
      division: {
        id: division.id,
        name: division.name,
        class: division.class,
        label,
      },
      schedule: schedule ? { id: schedule.id, name: schedule.name } : null,
      classTeacher: classTeacher ? personOf(classTeacher.staff) : null,
      periodsPerWeek: [...periods.values()]
        .map((p) => ({ subject: p.subject, count: p.count }))
        .sort(
          (a, b) =>
            b.count - a.count || a.subject.name.localeCompare(b.subject.name),
        ),
      team: [...team.values()].sort((a, b) =>
        a.subject.name.localeCompare(b.subject.name),
      ),
    };
  }

  /** The signed-in teacher's week. */
  async mine(auth: AuthContext, weekOf?: string) {
    const staff = await this.data.staffOf(auth);
    if (!staff) throw new NotFoundException('You do not have a staff record');
    return this.staffWeek(auth, staff.id, weekOf, true);
  }

  /**
   * A teacher's week: their lessons in every class, with that week's changes (covered or cancelled
   * lessons, and periods they cover for someone else). Administrators may see anyone's; a teacher their own.
   */
  async staffWeek(
    auth: AuthContext,
    staffId: string,
    weekOf?: string,
    self = false,
  ) {
    const year = await this.data.currentYear(auth.schoolId);
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, schoolId: auth.schoolId },
      select: { id: true, firstName: true, surname: true, userId: true },
    });
    if (!staff) throw new NotFoundException('Staff member not found');
    if (
      !self &&
      !this.data.can(auth, 'timetable.manage') &&
      staff.userId !== auth.userId
    )
      throw new NotFoundException('Staff member not found');

    const dates = weekDates(weekOf ?? todayInIndia());
    const range = {
      gte: toDate(dates[0]),
      lte: toDate(dates[dates.length - 1]),
    };
    const [entries, covering, holidays] = await Promise.all([
      this.prisma.timetableEntry.findMany({
        where: { schoolId: auth.schoolId, academicYearId: year.id, staffId },
        include: {
          subject: { select: { id: true, name: true } },
          slot: true,
          division: DIVISION,
        },
      }),
      this.prisma.timetableAdjustment.findMany({
        where: {
          schoolId: auth.schoolId,
          substituteStaffId: staffId,
          archivedAt: null,
          date: range,
        },
        include: {
          slot: true,
          division: DIVISION,
          subject: { select: { id: true, name: true } },
          substitute: PERSON,
        },
      }),
      this.data.staffHolidays(auth.schoolId, dates[0], dates[dates.length - 1]),
    ]);
    // Changes to this teacher's own lessons that week.
    const own = entries.length
      ? await this.prisma.timetableAdjustment.findMany({
          where: {
            schoolId: auth.schoolId,
            archivedAt: null,
            date: range,
            OR: entries.map((e) => ({
              divisionId: e.divisionId,
              slotId: e.slotId,
            })),
          },
          include: {
            division: DIVISION,
            subject: { select: { id: true, name: true } },
            substitute: PERSON,
            slot: true,
          },
        })
      : [];
    const ownLessons = own.filter((a) =>
      entries.some(
        (e) =>
          e.divisionId === a.divisionId &&
          e.slotId === a.slotId &&
          e.weekday === weekdayOf(toIso(a.date)),
      ),
    );

    // Rows are the distinct times of day this teacher is in a class.
    const rows = new Map<string, GridRow>();
    const keyOf = (s: { startsAt: string; endsAt: string }) =>
      `${s.startsAt}-${s.endsAt}`;
    const addRow = (
      s: {
        kind: GridRow['kind'];
        label: string;
        startsAt: string;
        endsAt: string;
      },
      day: number,
    ) => {
      const key = keyOf(s);
      const r = rows.get(key);
      if (r) {
        if (!r.days.includes(day)) r.days.push(day);
        if (r.label !== s.label && !r.label.includes(s.label))
          r.label = `${s.startsAt}–${s.endsAt}`;
      } else
        rows.set(key, {
          key,
          kind: s.kind,
          label: s.label,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          days: [day],
        });
    };
    for (const e of entries) addRow(e.slot, e.weekday);
    for (const a of covering) addRow(a.slot, weekdayOf(toIso(a.date)));

    const isStaffSide = this.data.can(auth, 'timetable.read_all') || self;
    const changeView = (a: (typeof covering)[number]): GridChange => ({
      id: a.id,
      date: toIso(a.date),
      rowKey: keyOf(a.slot),
      slotId: a.slotId,
      kind: a.kind,
      division: { id: a.division.id, label: divisionLabel(a.division) },
      substitute: a.substitute ? personOf(a.substitute) : null,
      subject: a.subject,
      reason: isStaffSide ? a.reason : null,
    });
    const byId = new Map<string, GridChange>();
    for (const a of [...covering, ...ownLessons]) byId.set(a.id, changeView(a));

    return {
      ...this.frame(year, dates, holidays),
      staff: personOf(staff),
      rows: [...rows.values()]
        .map((r) => ({ ...r, days: r.days.sort((a, b) => a - b) }))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      cells: entries.map((e) => ({
        id: e.id,
        rowKey: keyOf(e.slot),
        slotId: e.slotId,
        weekday: e.weekday,
        subject: e.subject,
        staff: personOf(staff),
        room: e.room,
        division: { id: e.division.id, label: divisionLabel(e.division) },
      })),
      changes: [...byId.values()],
      periodsPerWeek: entries.length,
    };
  }

  /** The divisions a person may open, for the picker: all of them for staff, their children's for families. */
  async divisions(auth: AuthContext) {
    const year = await this.data.currentYear(auth.schoolId);
    if (this.data.can(auth, 'timetable.read_all')) {
      const rows = await this.prisma.division.findMany({
        where: { schoolId: auth.schoolId },
        select: {
          id: true,
          name: true,
          class: { select: { id: true, name: true, sortOrder: true } },
        },
        orderBy: [{ class: { sortOrder: 'asc' } }, { name: 'asc' }],
      });
      return rows.map((d) => ({
        id: d.id,
        name: d.name,
        class: { id: d.class.id, name: d.class.name },
        label: divisionLabel(d),
        students: [] as PersonRef[],
      }));
    }
    const mine = await this.data.familyDivisions(auth, year.id);
    const rows = await this.prisma.division.findMany({
      where: {
        schoolId: auth.schoolId,
        id: { in: mine.map((m) => m.divisionId) },
      },
      select: DIVISION.select,
    });
    return rows.map((d) => ({
      id: d.id,
      name: d.name,
      class: d.class,
      label: divisionLabel(d),
      students: mine.filter((m) => m.divisionId === d.id).map((m) => m.student),
    }));
  }

  // ---------- changing the regular week ----------

  /**
   * Fills or clears boxes of a division's week. The teacher defaults to the subject teacher from
   * Academic setup. A teacher already in another class at an overlapping time is refused.
   */
  async setEntries(
    auth: AuthContext,
    divisionId: string,
    dto: SetEntriesDto,
    ip?: string,
  ) {
    const year = await this.data.currentYear(auth.schoolId);
    const division = await this.prisma.division.findFirst({
      where: { id: divisionId, schoolId: auth.schoolId },
      select: DIVISION.select,
    });
    if (!division) throw new NotFoundException('Division not found');
    const { warnings } = await this.prisma.$transaction(async (tx) => {
      await this.data.lock(tx, auth.schoolId, year.id);
      return this.writeEntries(tx, auth, year, division, dto.entries);
    });
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'timetable.entries_changed',
      entityType: 'division',
      entityId: divisionId,
      metadata: { boxes: dto.entries.length },
      ip,
    });
    const view = await this.divisionWeek(auth, divisionId);
    return { ...view, warnings };
  }

  /**
   * The checks and writes behind `setEntries`, inside the caller's transaction (the Excel import uses
   * it too). Throws with every problem found; returns warnings that do not stop the save.
   */
  async writeEntries(
    tx: Tx,
    auth: AuthContext,
    year: Year,
    division: { id: string; name: string; class: { id: string; name: string } },
    entries: EntryDto[],
  ): Promise<{ warnings: string[] }> {
    const schedule = await this.data.scheduleOfClass(
      auth.schoolId,
      year.id,
      division.class.id,
      tx,
    );
    if (!schedule)
      throw new BadRequestException(
        `${division.class.name} has no timings yet. Choose its timings in Timetable, Timings first.`,
      );
    const slots = new Map(schedule.slots.map((s) => [s.id, s]));
    const keys = new Set<string>();
    const errors: string[] = [];
    for (const e of entries) {
      const slot = slots.get(e.slotId);
      const key = `${e.slotId}:${e.weekday}`;
      if (keys.has(key)) errors.push('The same box is listed twice');
      keys.add(key);
      if (!slot) {
        errors.push(`A period is not part of ${schedule.name}`);
        continue;
      }
      if (!slot.days.includes(e.weekday))
        errors.push(
          `${slot.label} does not run on ${WEEKDAY_NAMES[e.weekday]}`,
        );
      if (slot.kind === 'BREAK' && (e.subjectId || e.staffId))
        errors.push(`${slot.label} is a break; nothing can be taught in it`);
    }
    if (errors.length) throw new BadRequestException([...new Set(errors)]);

    const subjectIds = [
      ...new Set(entries.flatMap((e) => (e.subjectId ? [e.subjectId] : []))),
    ];
    const [subjects, subjectTeachers] = await Promise.all([
      tx.subject.findMany({
        where: { schoolId: auth.schoolId, id: { in: subjectIds } },
        select: { id: true, name: true },
      }),
      tx.subjectTeacher.findMany({
        where: {
          schoolId: auth.schoolId,
          academicYearId: year.id,
          divisionId: division.id,
        },
        select: {
          subjectId: true,
          staffId: true,
          staff: { select: { status: true } },
        },
      }),
    ]);
    if (subjects.length !== subjectIds.length)
      throw new NotFoundException('Subject not found');
    const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
    const usual = new Map(
      subjectTeachers
        .filter((s) => s.staff.status === 'ACTIVE')
        .map((s) => [s.subjectId, s.staffId]),
    );

    // The teacher for each box: as sent, or the subject teacher when none was sent.
    const resolved = entries.map((e) => {
      const staffId =
        e.staffId === undefined
          ? e.subjectId
            ? (usual.get(e.subjectId) ?? null)
            : null
          : e.staffId;
      return {
        slotId: e.slotId,
        weekday: e.weekday,
        staffId: staffId ?? null,
        subjectId: e.subjectId ?? null,
        room: e.room ?? null,
      };
    });
    const staffIds = [
      ...new Set(resolved.flatMap((e) => (e.staffId ? [e.staffId] : []))),
    ];
    const staff = await tx.staff.findMany({
      where: { schoolId: auth.schoolId, id: { in: staffIds } },
      select: { id: true, firstName: true, surname: true, status: true },
    });
    if (staff.length !== staffIds.length)
      throw new NotFoundException('Staff member not found');
    const left = staff.filter((s) => s.status !== 'ACTIVE');
    if (left.length)
      throw new BadRequestException(
        `${left.map((s) => `${s.firstName} ${s.surname}`).join(', ')} has left. Choose a current member of staff.`,
      );
    const names = new Map(
      staff.map((s) => [s.id, `${s.firstName} ${s.surname}`]),
    );

    const warnings: string[] = [];
    for (const e of resolved) {
      if (!e.subjectId || !e.staffId) continue;
      const expected = usual.get(e.subjectId);
      if (expected && expected !== e.staffId)
        warnings.push(
          `${names.get(e.staffId)} is not the ${subjectName.get(e.subjectId)} teacher of ${divisionLabel(division)} in Academic setup`,
        );
    }

    // Clashes: the teachers' other lessons, less the boxes being replaced here.
    const replaced = new Set(
      resolved.map((e) => `${division.id}:${e.slotId}:${e.weekday}`),
    );
    const existing = (
      await this.data.bookings(auth.schoolId, year.id, staffIds, tx)
    ).filter((b) => !replaced.has(`${b.divisionId}:${b.slotId}:${b.weekday}`));
    const planned: Booking[] = resolved.flatMap((e) => {
      if (!e.staffId) return [];
      const s = slots.get(e.slotId)!;
      return [
        {
          staffId: e.staffId,
          weekday: e.weekday,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          divisionId: division.id,
          slotId: s.id,
          where: `${divisionLabel(division)}, ${s.label}`,
        },
      ];
    });
    const clash = this.data.clashes(planned, existing, names);
    if (clash.length) throw new ConflictException(clash);

    for (const e of resolved) {
      const where = {
        divisionId_slotId_weekday: {
          divisionId: division.id,
          slotId: e.slotId,
          weekday: e.weekday,
        },
      };
      if (!e.subjectId && !e.staffId && !e.room) {
        await tx.timetableEntry.deleteMany({
          where: {
            divisionId: division.id,
            slotId: e.slotId,
            weekday: e.weekday,
          },
        });
        continue;
      }
      const row = { subjectId: e.subjectId, staffId: e.staffId, room: e.room };
      await tx.timetableEntry.upsert({
        where,
        update: row,
        create: {
          ...row,
          schoolId: auth.schoolId,
          academicYearId: year.id,
          divisionId: division.id,
          slotId: e.slotId,
          weekday: e.weekday,
        },
      });
    }
    return { warnings: [...new Set(warnings)] };
  }

  /** Clears a division's whole week (needed before its class moves to other timings). */
  async clearDivision(auth: AuthContext, divisionId: string, ip?: string) {
    const year = await this.data.currentYear(auth.schoolId);
    const division = await this.prisma.division.findFirst({
      where: { id: divisionId, schoolId: auth.schoolId },
      select: { id: true },
    });
    if (!division) throw new NotFoundException('Division not found');
    const { count } = await this.prisma.timetableEntry.deleteMany({
      where: { schoolId: auth.schoolId, academicYearId: year.id, divisionId },
    });
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'timetable.entries_cleared',
      entityType: 'division',
      entityId: divisionId,
      metadata: { boxes: count },
      ip,
    });
    return { cleared: count };
  }

  /**
   * Hands every lesson of one subject in one division from one teacher to another, for good (for a
   * day only, use a substitute). Optionally makes the new teacher the subject teacher too.
   */
  async reassign(auth: AuthContext, dto: ReassignDto, ip?: string) {
    if (dto.fromStaffId === dto.toStaffId)
      throw new BadRequestException('Choose a different teacher');
    const year = await this.data.currentYear(auth.schoolId);
    const [division, subject, to] = await Promise.all([
      this.prisma.division.findFirst({
        where: { id: dto.divisionId, schoolId: auth.schoolId },
        select: DIVISION.select,
      }),
      this.prisma.subject.findFirst({
        where: { id: dto.subjectId, schoolId: auth.schoolId },
        select: { id: true, name: true },
      }),
      this.prisma.staff.findFirst({
        where: { id: dto.toStaffId, schoolId: auth.schoolId },
        select: {
          id: true,
          firstName: true,
          surname: true,
          status: true,
          userId: true,
        },
      }),
    ]);
    if (!division) throw new NotFoundException('Division not found');
    if (!subject) throw new NotFoundException('Subject not found');
    if (!to) throw new NotFoundException('Staff member not found');
    if (to.status !== 'ACTIVE')
      throw new BadRequestException(
        'That person has left. Choose a current member of staff.',
      );

    const moved = await this.prisma.$transaction(async (tx) => {
      await this.data.lock(tx, auth.schoolId, year.id);
      const lessons = await tx.timetableEntry.findMany({
        where: {
          schoolId: auth.schoolId,
          academicYearId: year.id,
          divisionId: division.id,
          subjectId: subject.id,
          staffId: dto.fromStaffId,
        },
        include: { slot: true },
      });
      if (!lessons.length && !dto.alsoSubjectTeacher)
        throw new BadRequestException(
          `That teacher has no ${subject.name} lessons in ${divisionLabel(division)}`,
        );
      const planned: Booking[] = lessons.map((l) => ({
        staffId: to.id,
        weekday: l.weekday,
        startsAt: l.slot.startsAt,
        endsAt: l.slot.endsAt,
        divisionId: division.id,
        slotId: l.slotId,
        where: `${divisionLabel(division)}, ${l.slot.label}`,
      }));
      const existing = await this.data.bookings(
        auth.schoolId,
        year.id,
        [to.id],
        tx,
      );
      const clash = this.data.clashes(
        planned,
        existing,
        new Map([[to.id, `${to.firstName} ${to.surname}`]]),
      );
      if (clash.length) throw new ConflictException(clash);
      await tx.timetableEntry.updateMany({
        where: { id: { in: lessons.map((l) => l.id) } },
        data: { staffId: to.id },
      });
      if (dto.alsoSubjectTeacher) {
        await tx.subjectTeacher.upsert({
          where: {
            academicYearId_divisionId_subjectId: {
              academicYearId: year.id,
              divisionId: division.id,
              subjectId: subject.id,
            },
          },
          update: { staffId: to.id },
          create: {
            schoolId: auth.schoolId,
            academicYearId: year.id,
            divisionId: division.id,
            subjectId: subject.id,
            staffId: to.id,
          },
        });
      }
      return lessons.length;
    });

    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'timetable.reassigned',
      entityType: 'division',
      entityId: division.id,
      metadata: {
        subject: subject.name,
        fromStaffId: dto.fromStaffId,
        toStaffId: to.id,
        lessons: moved,
        subjectTeacher: !!dto.alsoSubjectTeacher,
      },
      ip,
    });
    await this.notifications.notify(auth.schoolId, [to.userId], {
      type: 'timetable.reassigned',
      title: `You now teach ${subject.name} to ${divisionLabel(division)}`,
      body: `${moved} lesson${moved === 1 ? '' : 's'} a week were given to you.`,
      link: '/app/my-timetable',
    });
    return { moved, view: await this.divisionWeek(auth, division.id) };
  }

  /**
   * Carries an earlier year's timings, which classes follow them, and every lesson into the current
   * year, which must have no timings yet. Teachers who have left are copied as empty boxes, and listed.
   */
  async copy(auth: AuthContext, dto: CopyTimetableDto, ip?: string) {
    const to = await this.data.currentYear(auth.schoolId);
    const from = await this.data.yearById(
      auth.schoolId,
      dto.fromAcademicYearId,
    );
    if (from.id === to.id)
      throw new BadRequestException('Choose an earlier year');
    const result = await this.prisma.$transaction(async (tx) => {
      await this.data.lock(tx, auth.schoolId, to.id);
      const already = await tx.bellSchedule.count({
        where: { schoolId: auth.schoolId, academicYearId: to.id },
      });
      if (already)
        throw new ConflictException(
          `${to.name} already has timings. Copying only fills a year that has none.`,
        );
      const schedules = await tx.bellSchedule.findMany({
        where: {
          schoolId: auth.schoolId,
          academicYearId: from.id,
          archivedAt: null,
        },
        include: { slots: true, classes: true },
      });
      if (!schedules.length)
        throw new BadRequestException(`${from.name} has no timings to copy`);
      const slotMap = new Map<string, string>();
      for (const s of schedules) {
        const created = await tx.bellSchedule.create({
          data: {
            schoolId: auth.schoolId,
            academicYearId: to.id,
            name: s.name,
          },
        });
        for (const slot of s.slots) {
          const c = await tx.bellSlot.create({
            data: {
              schoolId: auth.schoolId,
              scheduleId: created.id,
              kind: slot.kind,
              label: slot.label,
              startsAt: slot.startsAt,
              endsAt: slot.endsAt,
              days: slot.days,
              sortOrder: slot.sortOrder,
            },
          });
          slotMap.set(slot.id, c.id);
        }
        await tx.classBellSchedule.createMany({
          data: s.classes.map((c) => ({
            schoolId: auth.schoolId,
            academicYearId: to.id,
            classId: c.classId,
            scheduleId: created.id,
          })),
        });
      }
      const entries = await tx.timetableEntry.findMany({
        where: {
          schoolId: auth.schoolId,
          academicYearId: from.id,
          slotId: { in: [...slotMap.keys()] },
        },
        include: {
          staff: { select: { firstName: true, surname: true, status: true } },
          slot: { select: { label: true } },
          division: {
            select: { name: true, class: { select: { name: true } } },
          },
        },
      });
      const withoutTeacher: string[] = [];
      await tx.timetableEntry.createMany({
        data: entries.map((e) => {
          const gone = e.staff && e.staff.status !== 'ACTIVE';
          if (gone)
            withoutTeacher.push(
              `${divisionLabel(e.division)}, ${WEEKDAY_NAMES[e.weekday]} ${e.slot.label} (${e.staff!.firstName} ${e.staff!.surname} has left)`,
            );
          return {
            schoolId: auth.schoolId,
            academicYearId: to.id,
            divisionId: e.divisionId,
            slotId: slotMap.get(e.slotId)!,
            weekday: e.weekday,
            subjectId: e.subjectId,
            staffId: gone ? null : e.staffId,
            room: e.room,
          };
        }),
      });
      return {
        schedules: schedules.length,
        lessons: entries.length,
        withoutTeacher,
      };
    });
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'timetable.copied',
      entityType: 'academic_year',
      entityId: to.id,
      metadata: {
        from: from.name,
        to: to.name,
        schedules: result.schedules,
        lessons: result.lessons,
      },
      ip,
    });
    return { from: from.name, to: to.name, ...result };
  }

  // ---------- helpers ----------

  private frame(year: Year, dates: string[], holidays: Map<string, string>) {
    return {
      academicYear: { id: year.id, name: year.name },
      today: todayInIndia(),
      weekOf: dates[0],
      days: dates.map((date) => ({
        date,
        weekday: weekdayOf(date),
        name: WEEKDAY_NAMES[weekdayOf(date)],
        holiday: holidays.get(date) ?? null,
      })),
    };
  }
}
