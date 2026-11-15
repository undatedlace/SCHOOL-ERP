import {
  registrationDecision,
  registrationOrder,
  type DeviceRecord,
  type TokenOwner,
} from './decision';

export interface SyncDeps {
  readRecord: (accountId: string) => Promise<DeviceRecord | null>;
  readOwner: () => Promise<TokenOwner | null>;
  /** Registers one account with its own session token. Resolves the token to use, or null if the account has none. */
  register: (accountId: string, pushToken: string) => Promise<DeviceRecord | null>;
  log?: (message: string) => void;
}

export interface SyncResult {
  registered: string[];
  skipped: string[];
  failed: string[];
}

/**
 * Registers this phone for every saved account that needs it, the account on screen last. An
 * account that fails (offline, a token that no longer works) is skipped and tried at the next
 * start; it never stops the others.
 */
export async function syncRegistrations(
  input: { accounts: readonly { id: string }[]; activeId: string | null; pushToken: string | null },
  deps: SyncDeps,
): Promise<SyncResult> {
  const result: SyncResult = { registered: [], skipped: [], failed: [] };
  for (const account of registrationOrder(input.accounts, input.activeId)) {
    try {
      const [record, owner] = await Promise.all([deps.readRecord(account.id), deps.readOwner()]);
      const decision = registrationDecision({
        pushToken: input.pushToken,
        accountId: account.id,
        isActive: account.id === input.activeId,
        record,
        owner,
      });
      if (decision === 'register' && input.pushToken) {
        const saved = await deps.register(account.id, input.pushToken);
        (saved ? result.registered : result.failed).push(account.id);
      } else {
        deps.log?.(`push: ${decision} for account ${account.id}`);
        result.skipped.push(account.id);
      }
    } catch (e) {
      deps.log?.(`push: could not register account ${account.id}: ${e instanceof Error ? e.message : String(e)}`);
      result.failed.push(account.id);
    }
  }
  return result;
}
