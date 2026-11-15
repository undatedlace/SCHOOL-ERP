import { api } from '@/api/client';
import type { Account } from '@/auth';
import { Avatar } from '@/ui';

/** An account's photo (fetched with that account's token when it is the signed-in one), or its initials. */
export function AccountAvatar({ account, size = 36, isActive = true }: { account: Account; size?: number; isActive?: boolean }) {
  // Only the signed-in account's token is loaded, so another saved account shows initials.
  const photo = isActive ? api.fileSource(account.photoFileId) : null;
  return <Avatar name={account.fullName} size={size} photo={photo} />;
}
