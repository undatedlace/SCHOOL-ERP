/**
 * What a push message says. A push passes through other companies' servers (Expo, Google, Apple) and appears
 * on a locked screen, so it never carries the notification's own title or body (names, marks, amounts).
 * The title is chosen from the notification's TYPE only; the real text is read in the app after sign-in.
 */

export const PUSH_BODY = 'Open the app to read it.';
export const DEFAULT_PUSH_TITLE = 'School update';

/** An exact type wins; otherwise the part before the first dot decides. */
const BY_TYPE: Record<string, string> = {
  'message.received': 'New message',
  'result.published': 'New results',
  'fee.reminder': 'Fees update',
};

const BY_PREFIX: Record<string, string> = {
  message: 'New message',
  homework: 'Homework update',
  leave: 'Leave update',
  student_leave: 'Leave update',
  assessment: 'New results',
  result: 'New results',
  results: 'New results',
  fee: 'Fees update',
  fees: 'Fees update',
  notice: 'New notice',
  timetable: 'Timetable update',
};

export function pushTitleFor(type: string): string {
  const exact = BY_TYPE[type];
  if (exact) return exact;
  const prefix = type.split('.')[0] ?? '';
  return BY_PREFIX[prefix] ?? DEFAULT_PUSH_TITLE;
}

export interface PushMessage {
  /** The device's push token. */
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data: { notificationId: string; link: string | null };
}

/**
 * The only place a push message is built. It takes the id, type and link and deliberately nothing else,
 * so the notification's title, body or any name cannot get in by accident.
 */
export function buildPushMessage(
  token: string,
  n: { id: string; type: string; link: string | null },
): PushMessage {
  return {
    to: token,
    title: pushTitleFor(n.type),
    body: PUSH_BODY,
    sound: 'default',
    data: { notificationId: n.id, link: n.link },
  };
}

/** Minutes to wait before retry number `failures` (1, 2, 3); null when the retries are used up. */
export const RETRY_MINUTES = [1, 5, 30] as const;
export function retryDelayMinutes(failures: number): number | null {
  return RETRY_MINUTES[failures - 1] ?? null;
}
