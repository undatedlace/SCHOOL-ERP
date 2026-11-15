import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service.js';
import {
  PUSH_SENDER,
  type PushResult,
  type PushSender,
} from './push-sender.js';
import { buildPushMessage, retryDelayMinutes } from './push-text.js';

/** How many due notifications one round takes, and how many rounds one run may take. */
export const PUSH_BATCH = 200;
const MAX_ROUNDS = 25;
/** A push still waiting after this long is stale ("New message" a day later helps nobody): it is dropped. */
export const PUSH_MAX_AGE_MS = 24 * 3_600_000;
/** While a batch is being sent its rows are leased, so a crash retries them later and nobody else takes them. */
const LEASE_MS = 5 * 60_000;
const TICK_MS = 60_000;
/** The key of the advisory lock that makes two runs take turns. */
export const PUSH_LOCK_KEY = 'push:send-due';

export type Outcome = 'SENT' | 'NONE' | 'RETRY';

/**
 * What happened to one notification, from the results for its devices: sent if at least one device took it;
 * if every device answered "DeviceNotRegistered" nobody can receive it any more (NONE); otherwise try again.
 */
export function decideOutcome(results: PushResult[]): Outcome {
  if (results.some((r) => r.ok)) return 'SENT';
  // (also true for no devices at all)
  if (results.every((r) => !r.ok && r.error === 'DeviceNotRegistered')) {
    return 'NONE';
  }
  return 'RETRY';
}

/** After a failed try: when to try again, or give up. `failures` includes the one that just happened. */
export function nextAttempt(
  failures: number,
  now: Date,
): { status: 'PENDING'; pushAt: Date } | { status: 'FAILED' } {
  const minutes = retryDelayMinutes(failures);
  return minutes === null
    ? { status: 'FAILED' }
    : { status: 'PENDING', pushAt: new Date(now.getTime() + minutes * 60_000) };
}

export interface SendSummary {
  /** Notifications handed to the push service successfully. */
  sent: number;
  /** Notifications that will be tried again. */
  retried: number;
  failed: number;
  /** Notifications nobody could receive any more (all devices gone, or already read). */
  dropped: number;
  /** True when another run held the lock, so this one did nothing. */
  busy: boolean;
}

/** The push channel: reads notifications marked PENDING and sends a generic message to the person's devices. */
@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Push');
  private inflight: Promise<unknown> | null = null;
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
    private readonly config: ConfigService,
  ) {}

  /** Off means nothing is marked or sent. */
  get enabled(): boolean {
    return this.sender.name !== 'off';
  }

  onModuleInit() {
    if (
      this.config.get('PUSH_WORKER') === 'on' &&
      this.config.get('NODE_ENV') !== 'test'
    ) {
      this.timer = setInterval(() => this.kick(), TICK_MS);
      this.timer.unref();
      this.logger.log('Push worker is on: checking for due pushes every 60s');
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Which of these people have at least one device (one query). */
  async usersWithDevices(userIds: string[]): Promise<Set<string>> {
    if (!this.enabled || userIds.length === 0) return new Set();
    try {
      const rows = await this.prisma.device.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true },
        distinct: ['userId'],
      });
      return new Set(rows.map((r) => r.userId));
    } catch (e) {
      // The message itself must still be written; it just gets no push.
      this.logger.error(
        `Could not look up devices: ${e instanceof Error ? e.message : String(e)}`,
      );
      return new Set();
    }
  }

  /**
   * Starts sending what is due, without waiting and without ever throwing into the caller.
   * Errors are logged. Safe to call as often as you like (runs take turns through the lock).
   */
  kick(): void {
    if (!this.enabled || this.inflight) return;
    const run = this.sendDue()
      .catch((e: unknown) =>
        this.logger.error(
          `Sending pushes failed: ${e instanceof Error ? e.message : String(e)}`,
        ),
      )
      .finally(() => {
        if (this.inflight === run) this.inflight = null;
      });
    this.inflight = run;
  }

  /** Waits for a run started by `kick` (used by tests, and to finish cleanly). */
  async idle(): Promise<void> {
    while (this.inflight) await this.inflight;
  }

  /** Sends everything PENDING whose time has come. Two runs at once never send the same message twice. */
  async sendDue(now = new Date()): Promise<SendSummary> {
    const total: SendSummary = {
      sent: 0,
      retried: 0,
      failed: 0,
      dropped: 0,
      busy: false,
    };
    if (!this.enabled) return total;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const batch = await this.claim(now);
      if (batch === null) {
        total.busy = round === 0;
        break;
      }
      if (batch.length === 0) break;
      const s = await this.deliver(batch, now);
      total.sent += s.sent;
      total.retried += s.retried;
      total.failed += s.failed;
      total.dropped += s.dropped;
      if (batch.length < PUSH_BATCH) break;
    }
    return total;
  }

  /**
   * Takes the next due notifications under the advisory lock and leases them, so nobody else sends them
   * while this run is talking to the push service. Null when another run holds the lock.
   */
  private claim(now: Date) {
    return this.prisma.$transaction(
      async (tx) => {
        const lock = await tx.$queryRaw<
          { locked: boolean }[]
        >`SELECT pg_try_advisory_xact_lock(hashtext(${PUSH_LOCK_KEY})) AS locked`;
        if (!lock[0]?.locked) return null;
        const due = { pushStatus: 'PENDING' as const, pushAt: { lte: now } };
        // Already read in the app, or waited too long: no push any more.
        await tx.notification.updateMany({
          where: { ...due, readAt: { not: null } },
          data: { pushStatus: 'NONE' },
        });
        await tx.notification.updateMany({
          where: {
            ...due,
            createdAt: { lt: new Date(now.getTime() - PUSH_MAX_AGE_MS) },
          },
          data: { pushStatus: 'FAILED' },
        });
        const rows = await tx.notification.findMany({
          where: due,
          orderBy: [{ pushAt: 'asc' }, { id: 'asc' }],
          take: PUSH_BATCH,
          select: {
            id: true,
            userId: true,
            type: true,
            link: true,
            pushAttempts: true,
          },
        });
        if (rows.length > 0) {
          await tx.notification.updateMany({
            where: { id: { in: rows.map((r) => r.id) } },
            data: { pushAt: new Date(now.getTime() + LEASE_MS) },
          });
        }
        return rows;
      },
      { timeout: 20_000 },
    );
  }

  private async deliver(
    batch: {
      id: string;
      userId: string;
      type: string;
      link: string | null;
      pushAttempts: number;
    }[],
    now: Date,
  ): Promise<Omit<SendSummary, 'busy'>> {
    const summary = { sent: 0, retried: 0, failed: 0, dropped: 0 };
    const devices = await this.prisma.device.findMany({
      where: { userId: { in: [...new Set(batch.map((b) => b.userId))] } },
      select: { id: true, userId: true, pushToken: true },
    });
    const byUser = new Map<string, typeof devices>();
    for (const d of devices) {
      byUser.set(d.userId, [...(byUser.get(d.userId) ?? []), d]);
    }

    // One message per notification and device. Only id, type and link go in (see buildPushMessage).
    const sends = batch.flatMap((n) =>
      (byUser.get(n.userId) ?? []).map((d) => ({
        notificationId: n.id,
        deviceId: d.id,
        message: buildPushMessage(d.pushToken, n),
      })),
    );
    let results: PushResult[];
    try {
      results =
        sends.length === 0
          ? []
          : await this.sender.send(sends.map((s) => s.message));
      if (results.length !== sends.length) {
        throw new Error('Push sender returned the wrong number of results');
      }
    } catch (e) {
      this.logger.warn(
        `Push service unreachable or refused the batch: ${e instanceof Error ? e.message : String(e)}`,
      );
      results = sends.map(() => ({ ok: false, error: 'SendError' }));
    }

    const perNotification = new Map<string, PushResult[]>();
    const gone: string[] = [];
    sends.forEach((s, i) => {
      const r = results[i]!;
      perNotification.set(s.notificationId, [
        ...(perNotification.get(s.notificationId) ?? []),
        r,
      ]);
      if (!r.ok && r.error === 'DeviceNotRegistered') gone.push(s.deviceId);
    });
    if (gone.length > 0) {
      await this.prisma.device.deleteMany({ where: { id: { in: gone } } });
    }

    const sent: string[] = [];
    const none: string[] = [];
    const failedNow: string[] = [];
    const retryAt = new Map<number, { ids: string[]; at: Date }>();
    for (const n of batch) {
      const outcome = decideOutcome(perNotification.get(n.id) ?? []);
      if (outcome === 'SENT') sent.push(n.id);
      else if (outcome === 'NONE') none.push(n.id);
      else {
        const failures = n.pushAttempts + 1;
        const next = nextAttempt(failures, now);
        if (next.status === 'FAILED') failedNow.push(n.id);
        else {
          const g = retryAt.get(failures) ?? { ids: [], at: next.pushAt };
          g.ids.push(n.id);
          retryAt.set(failures, g);
        }
      }
    }

    const ops = [
      sent.length > 0 &&
        this.prisma.notification.updateMany({
          where: { id: { in: sent } },
          data: { pushStatus: 'SENT', pushedAt: now },
        }),
      none.length > 0 &&
        this.prisma.notification.updateMany({
          where: { id: { in: none } },
          data: { pushStatus: 'NONE' },
        }),
      failedNow.length > 0 &&
        this.prisma.notification.updateMany({
          where: { id: { in: failedNow } },
          data: { pushStatus: 'FAILED', pushAttempts: { increment: 1 } },
        }),
      ...[...retryAt.values()].map((g) =>
        this.prisma.notification.updateMany({
          where: { id: { in: g.ids } },
          data: { pushAt: g.at, pushAttempts: { increment: 1 } },
        }),
      ),
    ].filter((o) => o !== false);
    await this.prisma.$transaction(ops);

    summary.sent = sent.length;
    summary.dropped = none.length;
    summary.failed = failedNow.length;
    summary.retried = [...retryAt.values()].reduce(
      (a, g) => a + g.ids.length,
      0,
    );
    return summary;
  }
}
