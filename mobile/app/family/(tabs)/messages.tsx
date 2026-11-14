import { ComingSoon } from '@/features/shell/ComingSoon';

/** Placeholder. Wave 2 (G) fills this in; replace the body of this file with the real screen. */
export default function FamilyMessages() {
  return (
    <ComingSoon
      title="Messages"
      icon="chatbubbles-outline"
      description="Talk with your class teacher and subject teachers."
      willShow={["An inbox with unread messages", "Photo and PDF attachments", "Start a new message with a teacher"]}
    />
  );
}
