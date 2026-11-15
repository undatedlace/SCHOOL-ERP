/**
 * What a push carries. The server never puts names, marks or amounts in a push: the data is only
 * `{ notificationId, link }` (see docs/push.md). Anything else in it is ignored, and what is
 * there is checked before it is used, because it arrives from outside the app.
 */
export interface PushPayload {
  notificationId: string | null;
  /** A web path such as `/portal/messages/<id>`. Mapped to a screen by `routeStackForLink`. */
  link: string | null;
  /** Only if a later API version says which account the push is for. */
  userId: string | null;
}

const ID = /^[A-Za-z0-9-]{8,64}$/;
const MAX_LINK = 300;

const text = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/** Reads the `data` of a notification. Returns null when it holds nothing the app can act on. */
export function parsePushData(data: unknown): PushPayload | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const rawId = text(d.notificationId);
  const rawLink = text(d.link);
  const rawUser = text(d.userId);
  const notificationId = rawId && ID.test(rawId) ? rawId : null;
  const link = rawLink && rawLink.length <= MAX_LINK && rawLink.startsWith('/') && !rawLink.startsWith('//') ? rawLink : null;
  const userId = rawUser && ID.test(rawUser) ? rawUser : null;
  if (!notificationId && !link) return null;
  return { notificationId, link, userId };
}
