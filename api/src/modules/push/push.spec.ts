import { ConfigService } from '@nestjs/config';
import {
  ExpoPushSender,
  EXPO_PUSH_URL,
  EXPO_TOKEN,
  OffPushSender,
  createPushSender,
  type PushSender,
} from './push-sender.js';
import {
  PUSH_BODY,
  buildPushMessage,
  pushTitleFor,
  retryDelayMinutes,
} from './push-text.js';
import { PushService, decideOutcome, nextAttempt } from './push.service.js';

describe('push text', () => {
  it('chooses a generic title by type', () => {
    const cases: [string, string][] = [
      ['message.received', 'New message'],
      ['homework.assigned', 'Homework update'],
      ['homework.due_tomorrow', 'Homework update'],
      ['leave.requested', 'Leave update'],
      ['student_leave.approved', 'Leave update'],
      ['assessment.published', 'New results'],
      ['result.published', 'New results'],
      ['results.anything', 'New results'],
      ['fee.reminder', 'Fees update'],
      ['fees.something', 'Fees update'],
      ['notice.created', 'New notice'],
      ['timetable.covered', 'Timetable update'],
      ['something.else', 'School update'],
      ['', 'School update'],
    ];
    for (const [type, title] of cases) expect(pushTitleFor(type)).toBe(title);
  });

  it('builds a message from id, type and link only', () => {
    const n = {
      id: 'n-1',
      type: 'result.published',
      link: '/portal/results',
      // Things that must never get through, even if a caller passes the whole row.
      title: 'Asha scored 92 in Maths',
      body: 'Fees pending: Rs 12,500',
    };
    const m = buildPushMessage('ExponentPushToken[abc]', n);
    expect(m).toEqual({
      to: 'ExponentPushToken[abc]',
      title: 'New results',
      body: PUSH_BODY,
      sound: 'default',
      data: { notificationId: 'n-1', link: '/portal/results' },
    });
    const wire = JSON.stringify(m);
    expect(wire).not.toContain('Asha');
    expect(wire).not.toContain('92');
    expect(wire).not.toContain('12,500');
  });

  it('retries after 1, 5 and 30 minutes, then gives up', () => {
    expect([1, 2, 3].map(retryDelayMinutes)).toEqual([1, 5, 30]);
    expect(retryDelayMinutes(4)).toBeNull();
    const now = new Date('2026-11-14T10:00:00Z');
    expect(nextAttempt(1, now)).toEqual({
      status: 'PENDING',
      pushAt: new Date('2026-11-14T10:01:00Z'),
    });
    expect(nextAttempt(3, now)).toEqual({
      status: 'PENDING',
      pushAt: new Date('2026-11-14T10:30:00Z'),
    });
    expect(nextAttempt(4, now)).toEqual({ status: 'FAILED' });
  });
});

describe('push results', () => {
  const ok = { ok: true } as const;
  const dnr = { ok: false, error: 'DeviceNotRegistered' } as const;
  const bad = { ok: false, error: 'MessageRateExceeded' } as const;

  it('is sent when at least one device took it', () => {
    expect(decideOutcome([dnr, ok])).toBe('SENT');
    expect(decideOutcome([bad, ok])).toBe('SENT');
  });
  it('is dropped when every device is gone, retried on other errors', () => {
    expect(decideOutcome([dnr, dnr])).toBe('NONE');
    expect(decideOutcome([])).toBe('NONE');
    expect(decideOutcome([dnr, bad])).toBe('RETRY');
    expect(decideOutcome([bad])).toBe('RETRY');
  });
});

describe('sender choice', () => {
  it('is off unless asked, and by name otherwise', () => {
    expect(createPushSender(undefined).name).toBe('off');
    expect(createPushSender('').name).toBe('off');
    expect(createPushSender('nonsense').name).toBe('off');
    expect(createPushSender('log').name).toBe('log');
    expect(createPushSender('EXPO').name).toBe('expo');
  });
  it('recognises Expo tokens', () => {
    expect(EXPO_TOKEN.test('ExponentPushToken[abc-123_x]')).toBe(true);
    expect(EXPO_TOKEN.test('ExpoPushToken[abc]')).toBe(true);
    expect(EXPO_TOKEN.test('fcm:abc')).toBe(false);
    expect(EXPO_TOKEN.test('ExponentPushToken[]')).toBe(false);
  });
});

describe('Expo sender', () => {
  const msg = (to: string) =>
    buildPushMessage(to, { id: 'n', type: 'x', link: null });

  it('posts batches of at most 100 with the access token, and maps tickets', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFake = ((url: string, init: RequestInit) => {
      calls.push({ url, init });
      const sent = JSON.parse(init.body as string) as unknown[];
      const data = sent.map((_, i) =>
        calls.length === 1 && i === 0
          ? {
              status: 'error',
              message: 'gone',
              details: { error: 'DeviceNotRegistered' },
            }
          : { status: 'ok', id: 'x' },
      );
      return Promise.resolve(
        new Response(JSON.stringify({ data }), { status: 200 }),
      );
    }) as unknown as typeof fetch;
    const sender = new ExpoPushSender('secret', fetchFake);
    const messages = Array.from({ length: 150 }, (_, i) =>
      msg(`ExponentPushToken[t${i}]`),
    );
    const results = await sender.send(messages);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe(EXPO_PUSH_URL);
    expect(JSON.parse(calls[0]!.init.body as string)).toHaveLength(100);
    expect(JSON.parse(calls[1]!.init.body as string)).toHaveLength(50);
    expect(
      (calls[0]!.init.headers as Record<string, string>).Authorization,
    ).toBe('Bearer secret');
    expect(results).toHaveLength(150);
    expect(results[0]).toEqual({ ok: false, error: 'DeviceNotRegistered' });
    expect(results[1]).toEqual({ ok: true });
  });

  it('sends no Authorization header without a token, and does not post bad tokens', async () => {
    let seen: Record<string, string> | undefined;
    const fetchFake = ((_: string, init: RequestInit) => {
      seen = init.headers as Record<string, string>;
      return Promise.resolve(
        new Response(JSON.stringify({ data: [{ status: 'ok' }] }), {
          status: 200,
        }),
      );
    }) as unknown as typeof fetch;
    const sender = new ExpoPushSender(undefined, fetchFake);
    const r = await sender.send([msg('not-a-token'), msg('ExpoPushToken[a]')]);
    expect(seen?.Authorization).toBeUndefined();
    expect(r).toEqual([
      { ok: false, error: 'DeviceNotRegistered' },
      { ok: true },
    ]);
  });

  it('throws when the service answers with an error status', async () => {
    const fetchFake = (() =>
      Promise.resolve(
        new Response('no', { status: 503 }),
      )) as unknown as typeof fetch;
    await expect(
      new ExpoPushSender(undefined, fetchFake).send([
        msg('ExponentPushToken[a]'),
      ]),
    ).rejects.toThrow('503');
  });
});

describe('the lock', () => {
  const config = { get: () => undefined } as unknown as ConfigService;
  const sendMock = vi.fn(() => Promise.resolve([]));
  const fake = (name: string): PushSender => ({ name, send: sendMock });

  it('does nothing and sends nothing when another run holds the lock', async () => {
    const tx = {
      $queryRaw: vi.fn(() => Promise.resolve([{ locked: false }])),
      notification: {
        updateMany: vi.fn(),
        findMany: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
      device: { findMany: vi.fn() },
    };
    const sender = fake('fake');
    const svc = new PushService(prisma as never, sender, config);
    const r = await svc.sendDue();
    expect(r.busy).toBe(true);
    expect(tx.notification.findMany).not.toHaveBeenCalled();
    expect(prisma.device.findMany).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('touches nothing when push is off', async () => {
    const prisma = { $transaction: vi.fn() };
    const svc = new PushService(prisma as never, new OffPushSender(), config);
    expect(svc.enabled).toBe(false);
    await svc.sendDue();
    svc.kick();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('never throws out of kick, even when the database fails', async () => {
    const prisma = {
      $transaction: vi.fn(() => Promise.reject(new Error('db down'))),
    };
    const svc = new PushService(prisma as never, fake('fake'), config);
    expect(() => svc.kick()).not.toThrow();
    await svc.idle();
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
