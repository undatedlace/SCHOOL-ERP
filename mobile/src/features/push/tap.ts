import type { RoleKind } from '@/auth/types';
import { linkToRoute } from '@/features/notifications/link-to-route';
import type { PushPayload } from './payload';

/**
 * The screens to open for a notification link, using the shared link mapping. A conversation opens
 * over the inbox so Back lands there. The teacher app has no conversation screen yet, so a teacher
 * lands on the Messages tab.
 */
export function routeStackFor(link: string | null | undefined, kind: RoleKind): string[] {
  if (kind === 'other') return [];
  if (kind === 'teacher') return [linkToRoute(link, 'teacher').replace(/^(\/teacher\/messages)\/.+$/, '$1')];
  const route = linkToRoute(link, 'family');
  return /^\/family\/messages\/.+/.test(route) ? ['/family/messages', route] : [route];
}

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

  const stack = routeStackFor(payload.link, account.kind);
  if (stack.length > 0) deps.navigate(stack);
  return stack;
}
