import { ComingSoon } from '@/features/shell/ComingSoon';

/** Placeholder. Wave 3 (H) fills this in; replace the body of this file with the real screen. */
export default function TeacherMarks() {
  return (
    <ComingSoon
      title="Marks"
      icon="create-outline"
      description="Your tests: enter marks and publish results."
      willShow={["Marks per student, absent and remarks", "Publish when ready"]}
    />
  );
}
