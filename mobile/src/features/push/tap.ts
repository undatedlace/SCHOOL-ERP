import type { RoleKind } from '@/auth/types';
import { routeStackForLink } from './linkToRoute';
import type { PushPayload } from './payload';

export interface TapDeps {
  accounts: readonly { id: string; kind: RoleKind }[];
  activeId: string | null;
  switchAccount: (accountId: string) => Promise<void>;
  /** `POST /notifications/:id/read` for the account now on screen. */
  markRead: (notificationId: string) => Promise<void>;
  /** Fetch the bell and message counts again. */
  refreshCounts: () => void;
  /** Open the first screen, then push the rest on top of it. */
  navigate: (stack: string[]) => void;
}

/**
 * What happens when someone taps a push: move to the account it belongs to (only if the payload
 * says so and that account is on this phone), mark the notification read, refresh the counts and
 * open the screen its link points to. Returns the screens opened (empty if none).
 */
export async function handleNotificationTap(payload: PushPayload, deps: TapDeps): Promise<string[]> {
  let activeId = deps.activeId;
  if (payload.userId && payload.userId !== activeId && deps.accounts.some((a) => a.id === payload.userId)) {
    await deps.switchAccount(payload.userId);
    activeId = payload.userId;
  }
  const account = deps.accounts.find((a) => a.id === activeId);
  if (!account) return [];

  if (payload.notificationId) {
    await deps.markRead(payload.notificationId).catch(() => undefined);
  }
  deps.refreshCounts();

  const stack = routeStackForLink(payload.link, account.kind);
  if (stack.length > 0) deps.navigate(stack);
  return stack;
}
