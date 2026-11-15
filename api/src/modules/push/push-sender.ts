import { Logger } from '@nestjs/common';
import type { PushMessage } from './push-text.js';

/** Nest injection token for the chosen sender. */
export const PUSH_SENDER = Symbol('PUSH_SENDER');

export type PushResult =
  | { ok: true }
  /** `error` is the push service's code, for example "DeviceNotRegistered". */
  | { ok: false; error: string };

export interface PushSender {
  /** "off", "log", "expo", or the name of a fake in tests. Anything but "off" counts as switched on. */
  readonly name: string;
  /** One result per message, in the same order. Throws when the push service itself cannot be reached. */
  send(messages: PushMessage[]): Promise<PushResult[]>;
}

/** Sends nothing. The default, and always so in tests unless a fake is injected. */
export class OffPushSender implements PushSender {
  readonly name = 'off';
  send(messages: PushMessage[]): Promise<PushResult[]> {
    return Promise.resolve(messages.map(() => ({ ok: true as const })));
  }
}

/** For development: writes the last 6 characters of the token and the title, nothing else. */
export class LogPushSender implements PushSender {
  readonly name = 'log';
  private readonly logger = new Logger('Push');
  send(messages: PushMessage[]): Promise<PushResult[]> {
    for (const m of messages) {
      this.logger.log(`push to ...${m.to.slice(-7, -1)} "${m.title}"`);
    }
    return Promise.resolve(messages.map(() => ({ ok: true as const })));
  }
}

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_BATCH = 100;
export const EXPO_TOKEN = /^Expo(?:nent)?PushToken\[[^\]\s]+\]$/;

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/** Expo's push service, with no SDK: one POST for each 100 messages. */
export class ExpoPushSender implements PushSender {
  readonly name = 'expo';
  constructor(
    private readonly accessToken?: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(messages: PushMessage[]): Promise<PushResult[]> {
    const results: PushResult[] = Array.from({ length: messages.length });
    const valid: number[] = [];
    messages.forEach((m, i) => {
      // A token that is not an Expo token can never work; treat it like a device that is gone.
      if (EXPO_TOKEN.test(m.to)) valid.push(i);
      else results[i] = { ok: false, error: 'DeviceNotRegistered' };
    });
    for (let from = 0; from < valid.length; from += EXPO_BATCH) {
      const idx = valid.slice(from, from + EXPO_BATCH);
      const res = await this.fetchImpl(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(this.accessToken
            ? { Authorization: `Bearer ${this.accessToken}` }
            : {}),
        },
        body: JSON.stringify(idx.map((i) => messages[i])),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Expo push service answered ${res.status}`);
      const json = (await res.json()) as { data?: ExpoTicket[] };
      const tickets = json.data;
      if (!Array.isArray(tickets) || tickets.length !== idx.length) {
        throw new Error('Expo push service gave an unexpected answer');
      }
      idx.forEach((i, k) => {
        const t = tickets[k]!;
        results[i] =
          t.status === 'ok'
            ? { ok: true }
            : { ok: false, error: t.details?.error ?? t.message ?? 'Error' };
      });
    }
    return results;
  }
}

export function createPushSender(
  driver: string | undefined,
  expoToken?: string,
): PushSender {
  switch ((driver ?? 'off').trim().toLowerCase()) {
    case 'log':
      return new LogPushSender();
    case 'expo':
      return new ExpoPushSender(expoToken || undefined);
    default:
      return new OffPushSender();
  }
}
