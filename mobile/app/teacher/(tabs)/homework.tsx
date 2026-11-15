import { ComingSoon } from '@/features/shell/ComingSoon';

/** Placeholder. Wave 3 (H) fills this in; replace the body of this file with the real screen. */
export default function TeacherHomework() {
  return (
    <ComingSoon
      title="Homework"
      icon="book-outline"
      description="Set homework and review what was handed in."
      willShow={["Set for divisions or students", "Review hand-ins, mark or send back"]}
    />
  );
}
