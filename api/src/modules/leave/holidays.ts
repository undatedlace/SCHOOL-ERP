import { PrismaService } from '../../database/prisma.service.js';
import { addDays, toDate, toIso } from '../attendance/attendance-rules.js';

/**
 * The school's holidays between two days (inclusive), as a set of "YYYY-MM-DD". A holiday is a calendar
 * event of the kind Holiday that is for everyone or for staff (a holiday for one class does not close
 * the school, so it does not excuse staff). Leave is not counted on these days.
 */
export async function holidayDates(
  prisma: PrismaService,
  schoolId: string,
  from: string,
  to: string,
): Promise<Set<string>> {
  const events = await prisma.calendarEvent.findMany({
    where: {
      schoolId,
      category: 'HOLIDAY',
      archivedAt: null,
      audience: { in: ['ALL', 'STAFF'] },
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
