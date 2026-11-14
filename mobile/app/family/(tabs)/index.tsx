import { useAuth } from '@/auth';
import { greeting } from '@/lib/dates';
import { ComingSoon } from '@/features/shell/ComingSoon';

/** Placeholder. Wave 2 (E) fills this in; replace the body of this file with the real screen. */
export default function FamilyHome() {
  const { active } = useAuth();
  const first = active?.fullName.split(' ')[0] ?? '';
  return (
    <ComingSoon
      title={`${greeting()}, ${first}`}
      icon="home-outline"
      description="Your day at a glance."
      willShow={["Today's timeline with a live now line", "Attendance ring and homework due this week", "Latest results, notices and upcoming events", "Fees owed (pay at the school office)"]}
    />
  );
}
