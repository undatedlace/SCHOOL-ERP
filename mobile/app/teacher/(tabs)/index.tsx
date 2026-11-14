import { useAuth } from '@/auth';
import { greeting } from '@/lib/dates';
import { ComingSoon } from '@/features/shell/ComingSoon';

/** Placeholder. Wave 3 (H) fills this in; replace the body of this file with the real screen. */
export default function TeacherToday() {
  const { active } = useAuth();
  const first = active?.fullName.split(' ')[0] ?? '';
  return (
    <ComingSoon
      title={`${greeting()}, ${first}`}
      icon="today-outline"
      description="Your day at school."
      willShow={["Your timetable for today with a live now line", "Periods you cover and lessons that are cancelled", "Leave requests waiting for you"]}
    />
  );
}
