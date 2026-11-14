import { ComingSoon } from '@/features/shell/ComingSoon';

/** Placeholder. Wave 2 (F) fills this in; replace the body of this file with the real screen. */
export default function FamilyNotices() {
  return (
    <ComingSoon
      title="Notices"
      icon="megaphone-outline"
      description="Announcements from the school and your teachers."
      willShow={["Latest notices first", "Full text in a sheet"]}
    />
  );
}
