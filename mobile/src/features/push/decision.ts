/**
 * When to tell the server about this phone. A push token belongs to one person at a time (the
 * server moves it to whoever registered last), so only the account on screen can actually receive
 * pushes on this phone. "Registered once" is judged per account and per token:
 *   - every saved account is registered once for the current token (so each has a device id to
 *     delete at sign-out, as the brief asks);
 *   - the account on screen is also registered again whenever the token is no longer under it
 *     (another saved account registered after it, or it was switched to), so it is the one that
 *     receives the pushes.
 */
export interface DeviceRecord {
  /** The device id the server gave this account. */
  deviceId: string;
  pushToken: string;
}

/** The account the server currently has the token under, as far as this phone knows. */
export interface TokenOwner {
  accountId: string;
  pushToken: string;
}

export type RegistrationDecision = 'no-token' | 'register' | 'already-registered';

export function registrationDecision(input: {
  /** The phone's Expo push token, or null when there is none (simulator, Expo Go, permission). */
  pushToken: string | null;
  accountId: string;
  /** The account on screen. */
  isActive: boolean;
  record: DeviceRecord | null;
  owner: TokenOwner | null;
}): RegistrationDecision {
  const { pushToken, accountId, isActive, record, owner } = input;
  if (!pushToken) return 'no-token';
  if (!record || record.pushToken !== pushToken) return 'register';
  if (!isActive) return 'already-registered';
  if (!owner || owner.accountId !== accountId || owner.pushToken !== pushToken) return 'register';
  return 'already-registered';
}

/**
 * The order to register saved accounts in: the account on screen last, so it is the one the
 * server ends up with, and the one whose pushes arrive.
 */
export function registrationOrder<T extends { id: string }>(accounts: readonly T[], activeId: string | null): T[] {
  return [...accounts.filter((a) => a.id !== activeId), ...accounts.filter((a) => a.id === activeId)];
}

/** A pushed message that was already acted on should not be acted on twice. */
export function createHandledSet(limit = 50) {
  const seen: string[] = [];
  return {
    has: (key: string) => seen.includes(key),
    add: (key: string) => {
      if (seen.includes(key)) return;
      seen.push(key);
      if (seen.length > limit) seen.shift();
    },
  };
}
