import { ComingSoon } from '@/features/shell/ComingSoon';

/** Placeholder. Wave 2 (E) fills this in; replace the body of this file with the real screen. */
export default function FamilyTimetable() {
  return (
    <ComingSoon
      title="Timetable"
      icon="calendar-outline"
      description="Your class timetable, day by day and week by week."
      willShow={["Today with a live now line", "Breaks, substitutes and cancelled periods", "Day and Week views"]}
    />
  );
}
