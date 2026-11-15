import { ComingSoon } from '@/features/shell/ComingSoon';

/** Placeholder. Wave 3 (H) fills this in; replace the body of this file with the real screen. */
export default function TeacherAttendance() {
  return (
    <ComingSoon
      title="Attendance"
      icon="checkmark-done-outline"
      description="Take attendance for the divisions you teach."
      willShow={["Present, Absent, Late and Leave per student", "Mark everyone present", "Approved leave pre-filled"]}
    />
  );
}
