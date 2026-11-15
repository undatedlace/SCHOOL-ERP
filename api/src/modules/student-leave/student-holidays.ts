import { PrismaService } from '../../database/prisma.service.js';
import { addDays, toDate, toIso } from '../attendance/attendance-rules.js';

/**
 * The days between two days (inclusive) on which a student's school is closed, as a set of "YYYY-MM-DD".
 * The same idea as the staff leave holidays (`leave/holidays.ts`: calendar events of the kind Holiday),
 * but for a student: a holiday for everyone, or one for the student's own class or division. A
 * "staff only" holiday does not close the school for students.
 */
export async function studentHolidayDates(
  prisma: PrismaService,
  schoolId: string,
  from: string,
  to: string,
  place: { classId: string | null; divisionId: string | null },
): Promise<Set<string>> {
  const audiences = [
    { audience: 'ALL' as const },
    ...(place.classId
      ? [
          {
            audience: 'CLASSES' as const,
            targets: { some: { classId: place.classId } },
          },
        ]
      : []),
    ...(place.divisionId
      ? [
          {
            audience: 'DIVISIONS' as const,
            targets: { some: { divisionId: place.divisionId } },
          },
        ]
      : []),
  ];
  const events = await prisma.calendarEvent.findMany({
    where: {
      schoolId,
      category: 'HOLIDAY',
      archivedAt: null,
      OR: audiences,
      startsOn: { lte: toDate(to) },
      endsOn: { gte: toDate(from) },
    },
    select: { startsOn: true, endsOn: true },
  });
  const days = new Set<string>();
  for (const e of events) {
    const start = toIso(e.startsOn) < from ? from : toIso(e.startsOn);
    const end = toIso(e.endsOn) > to ? to : toIso(e.endsOn);
    for (let d = start; d <= end; d = addDays(d, 1)) days.add(d);
  }
  return days;
}
