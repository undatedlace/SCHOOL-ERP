import { ComingSoon } from '@/features/shell/ComingSoon';

/** Placeholder. Wave 2 (F) fills this in; replace the body of this file with the real screen. */
export default function FamilyNotifications() {
  return (
    <ComingSoon
      title="Notifications"
      icon="notifications-outline"
      description="Everything the school has told you."
      willShow={["Unread first, tap to open", "Mark all as read"]}
    />
  );
}
