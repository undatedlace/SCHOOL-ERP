import { ComingSoon } from '@/features/shell/ComingSoon';

/** Placeholder. Wave 3 (H) fills this in; replace the body of this file with the real screen. */
export default function TeacherMyLeave() {
  return (
    <ComingSoon
      title="My leave"
      icon="airplane-outline"
      description="Your leave balance and requests."
      willShow={["Balance by kind of leave", "Ask for leave and withdraw it"]}
    />
  );
}
