import { ComingSoon } from '@/features/shell/ComingSoon';

/** Placeholder. Wave 2 (E) fills this in; replace the body of this file with the real screen. */
export default function FamilyAttendance() {
  return (
    <ComingSoon
      title="Attendance"
      icon="checkmark-done-outline"
      description="How often you were in school."
      willShow={["Percentage ring and counts", "A month grid of days not present"]}
    />
  );
}
