import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { addDays, toDate, toIso } from '../attendance/attendance-rules.js';
import { overlaps, WEEKDAY_NAMES } from './timetable-rules.js';

export type Tx = Prisma.TransactionClient;

export interface Year {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
}

export interface PersonRef {
  id: string;
  fullName: string;
}

export const personOf = (s: {
  id: string;
  firstName: string;
  surname: string;
}): PersonRef => ({ id: s.id, fullName: `${s.firstName} ${s.surname}` });

export const divisionLabel = (d: { name: string; class: { name: string } }) =>
  `${d.class.name}-${d.name}`;

/** A teacher's place in the week: what a clash check compares. */
export interface Booking {
  staffId: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  divisionId: string;
  slotId: string;
  /** "7-B, Period 3" for messages. */
  where: string;
}

/** Everything the timetable services share: the year, who may see what, holidays, leave and clashes. */
@Injectable()
export class TimetableData {
  constructor(private readonly prisma: PrismaService) {}

  can = (auth: AuthContext, p: string) => auth.permissions.includes(p);

  async currentYear(schoolId: string): Promise<Year> {
    const y = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      select: { id: true, name: true, startDate: true, endDate: true },
    });
    if (!y)
      throw new BadRequestException(
        'There is no current academic year. Set one in Academic setup.',
      );
    return this.year(y);
  }

  async yearById(schoolId: string, id: string): Promise<Year> {
    const y = await this.prisma.academicYear.findFirst({
      where: { schoolId, id },
      select: { id: true, name: true, startDate: true, endDate: true },
    });
    if (!y) throw new NotFoundException('Academic year not found');
    return this.year(y);
  }

  private year = (y: {
    id: string;
    name: string;
    startDate: Date;
    endDate: Date;
  }): Year => ({
    id: y.id,
    name: y.name,
    startsOn: toIso(y.startDate),
    endsOn: toIso(y.endDate),
  });

  async staffOf(auth: AuthContext) {
    return this.prisma.staff.findFirst({
      where: { schoolId: auth.schoolId, userId: auth.userId },
      select: { id: true, firstName: true, surname: true, status: true },
    });
  }

  /** Divisions of the signed-in person's children (or their own, for a student) this year. */
  async familyDivisions(auth: AuthContext, yearId: string) {
    const rows = await this.prisma.enrollment.findMany({
      where: {
        schoolId: auth.schoolId,
        academicYearId: yearId,
        student: {
          status: 'ACTIVE',
          OR: [
            { userId: auth.userId },
            { guardians: { some: { guardian: { userId: auth.userId } } } },
          ],
        },
      },
      select: {
        divisionId: true,
        student: { select: { id: true, firstName: true, surname: true } },
      },
    });
    return rows.map((r) => ({
      divisionId: r.divisionId,
      student: personOf(r.student),
    }));
  }

  /**
   * The division, if this person may see its timetable: anyone with `timetable.read_all`, or a parent
   * or student whose child is in it this year. Anything else looks like it does not exist.
   */
  async divisionFor(auth: AuthContext, divisionId: string, year: Year) {
    const division = await this.prisma.division.findFirst({
      where: { id: divisionId, schoolId: auth.schoolId },
      select: {
        id: true,
        name: true,
        class: { select: { id: true, name: true } },
      },
    });
    if (!division) throw new NotFoundException('Division not found');
    if (this.can(auth, 'timetable.read_all')) return division;
    const mine = await this.familyDivisions(auth, year.id);
    if (!mine.some((m) => m.divisionId === divisionId))
      throw new NotFoundException('Division not found');
    return division;
  }

  /** The timings a class follows this year, with its rows in order, or null when none is set. */
  async scheduleOfClass(
    schoolId: string,
    yearId: string,
    classId: string,
    db: Tx | PrismaService = this.prisma,
  ) {
    const link = await db.classBellSchedule.findFirst({
      where: { schoolId, academicYearId: yearId, classId },
      select: {
        schedule: {
          select: {
            id: true,
            name: true,
            slots: { orderBy: [{ sortOrder: 'asc' }, { startsAt: 'asc' }] },
          },
        },
      },
    });
    return link?.schedule ?? null;
  }

  /**
   * Holidays that close a division: for everyone, or for its class or itself. Staff-only holidays do
   * not close a class. Date to title.
   */
  async divisionHolidays(
    schoolId: string,
    division: { id: string; class: { id: string } },
    from: string,
    to: string,
  ): Promise<Map<string, string>> {
    return this.holidays(schoolId, from, to, {
      OR: [
        { audience: 'ALL' },
        {
          audience: 'CLASSES',
          targets: { some: { classId: division.class.id } },
        },
        {
          audience: 'DIVISIONS',
          targets: { some: { divisionId: division.id } },
        },
      ],
    });
  }

  /** Holidays that excuse staff (for everyone or for staff), as the leave module counts them. */
  staffHolidays(schoolId: string, from: string, to: string) {
    return this.holidays(schoolId, from, to, {
      audience: { in: ['ALL', 'STAFF'] },
    });
  }

  private async holidays(
    schoolId: string,
    from: string,
    to: string,
    where: Prisma.CalendarEventWhereInput,
  ) {
    const events = await this.prisma.calendarEvent.findMany({
      where: {
        schoolId,
        category: 'HOLIDAY',
        archivedAt: null,
        startsOn: { lte: toDate(to) },
        endsOn: { gte: toDate(from) },
        ...where,
      },
      select: { title: true, startsOn: true, endsOn: true },
      orderBy: { startsOn: 'asc' },
    });
    const days = new Map<string, string>();
    for (const e of events) {
      const start = toIso(e.startsOn) < from ? from : toIso(e.startsOn);
      const end = toIso(e.endsOn) > to ? to : toIso(e.endsOn);
      for (let d = start; d <= end; d = addDays(d, 1))
        if (!days.has(d)) days.set(d, e.title);
    }
    return days;
  }

  /** Approved leave covering a day, by member of staff. */
  async approvedLeaveOn(schoolId: string, date: string, staffIds?: string[]) {
    const rows = await this.prisma.leaveRequest.findMany({
      where: {
        schoolId,
        status: 'APPROVED',
        startsOn: { lte: toDate(date) },
        endsOn: { gte: toDate(date) },
        ...(staffIds ? { staffId: { in: staffIds } } : {}),
      },
      select: {
        staffId: true,
        halfDay: true,
        leaveType: { select: { name: true } },
      },
    });
    const byStaff = new Map<string, { halfDay: boolean; leaveType: string }>();
    for (const r of rows) {
      const prev = byStaff.get(r.staffId);
      // A full day wins over a half day if both are recorded.
      if (!prev || (prev.halfDay && !r.halfDay))
        byStaff.set(r.staffId, {
          halfDay: r.halfDay,
          leaveType: r.leaveType.name,
        });
    }
    return byStaff;
  }

  /** Where the given teachers already are in the regular week this year. */
  async bookings(
    schoolId: string,
    yearId: string,
    staffIds: string[],
    db: Tx | PrismaService = this.prisma,
  ): Promise<Booking[]> {
    if (staffIds.length === 0) return [];
    const rows = await db.timetableEntry.findMany({
      where: { schoolId, academicYearId: yearId, staffId: { in: staffIds } },
      select: {
        staffId: true,
        weekday: true,
        divisionId: true,
        slotId: true,
        slot: { select: { label: true, startsAt: true, endsAt: true } },
        division: { select: { name: true, class: { select: { name: true } } } },
      },
    });
    return rows.map((r) => ({
      staffId: r.staffId!,
      weekday: r.weekday,
      startsAt: r.slot.startsAt,
      endsAt: r.slot.endsAt,
      divisionId: r.divisionId,
      slotId: r.slotId,
      where: `${divisionLabel(r.division)}, ${r.slot.label}`,
    }));
  }

  /**
   * Finds a teacher booked twice at overlapping times on the same weekday. `planned` are the bookings
   * being saved; `existing` are what is already saved, less the boxes being replaced. Returns messages.
   */
  clashes(
    planned: Booking[],
    existing: Booking[],
    names: Map<string, string>,
  ): string[] {
    const messages: string[] = [];
    const say = (a: Booking, b: Booking) =>
      `${names.get(a.staffId) ?? 'That teacher'} would be in ${a.where} and ${b.where} at the same time on ${WEEKDAY_NAMES[a.weekday]}`;
    planned.forEach((a, i) => {
      for (const b of existing) {
        if (
          a.staffId === b.staffId &&
          a.weekday === b.weekday &&
          overlaps(a, b)
        )
          messages.push(say(a, b));
      }
      for (const b of planned.slice(i + 1)) {
        if (
          a.staffId === b.staffId &&
          a.weekday === b.weekday &&
          overlaps(a, b)
        )
          messages.push(say(a, b));
      }
    });
    return [...new Set(messages)];
  }

  async staffNames(schoolId: string, ids: string[]) {
    const rows = await this.prisma.staff.findMany({
      where: { schoolId, id: { in: [...new Set(ids)] } },
      select: { id: true, firstName: true, surname: true },
    });
    return new Map(rows.map((r) => [r.id, `${r.firstName} ${r.surname}`]));
  }

  /** One writer at a time for a school's timetable in a year, so two edits cannot both pass a clash check. */
  lock(tx: Tx, schoolId: string, yearId: string) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`timetable:${schoolId}:${yearId}`}))`;
  }
}
