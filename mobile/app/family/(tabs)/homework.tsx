import { ComingSoon } from '@/features/shell/ComingSoon';

/** Placeholder. Wave 2 (F) fills this in; replace the body of this file with the real screen. */
export default function FamilyHomework() {
  return (
    <ComingSoon
      title="Homework"
      icon="book-outline"
      description="Everything the teachers have set for you, with hand-in."
      willShow={["To do, Handed in and Marked lists", "Instructions and worksheet files", "Hand in photos or PDFs with a note"]}
    />
  );
}
