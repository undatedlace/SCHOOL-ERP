import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import {
  PUSH_SENDER,
  type PushResult,
  type PushSender,
} from '../src/modules/push/push-sender.js';
import type { PushMessage } from '../src/modules/push/push-text.js';
import { PushService } from '../src/modules/push/push.service.js';
import { Agent, adminAgent, createSettledUser, unique } from './helpers.js';

/** A sender that records everything and answers as told. Nothing leaves the machine. */
class FakeSender implements PushSender {
  readonly name = 'fake';
  sent: PushMessage[] = [];
  answer: (m: PushMessage) => PushResult = () => ({ ok: true });
  send(messages: PushMessage[]) {
    this.sent.push(...messages);
    return Promise.resolve(messages.map((m) => this.answer(m)));
  }
}

const token = () => `ExponentPushToken[${unique('t')}]`;

describe('push (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notifications: NotificationsService;
  let push: PushService;
  let admin: Agent;
  const fake = new FakeSender();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PUSH_SENDER)
      .useValue(fake)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    notifications = app.get(NotificationsService);
    push = app.get(PushService);
    admin = await adminAgent(app);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    // Leftovers from an earlier test must not be sent during this one.
    await push.idle();
    await prisma.notification.updateMany({
      where: { pushStatus: 'PENDING' },
      data: { pushStatus: 'NONE' },
    });
    fake.sent = [];
    fake.answer = () => ({ ok: true });
  });

  async function person(withDevice = true) {
    const u = await createSettledUser(app, admin, 'STAFF');
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: u.id },
      select: { schoolId: true },
    });
    let pushToken: string | null = null;
    let deviceId: string | null = null;
    if (withDevice) {
      pushToken = token();
      const res = await u.agent
        .post('/api/devices')
        .send({ platform: 'ANDROID', pushToken })
        .expect(200);
      deviceId = res.body.id as string;
    }
    return { ...u, schoolId: row.schoolId, pushToken, deviceId };
  }

  const tell = (
    p: { schoolId: string; id: string },
    over: Partial<Parameters<NotificationsService['notify']>[2]> = {},
  ) =>
    notifications.notify(p.schoolId, [p.id], {
      type: 'result.published',
      title: 'Asha scored 92 in Maths',
      body: 'Fees pending Rs 12,500',
      link: '/portal/results',
      ...over,
    });
  const row = (userId: string) =>
    prisma.notification.findFirstOrThrow({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  /** Waits for the push started by `notify`, then runs anything still due. */
  const flush = async (now?: Date) => {
    await push.idle();
    return push.sendDue(now);
  };

  it('marks a person with a device PENDING and sends it', async () => {
    const p = await person();
    await tell(p);
    // Marked in the same write as the message itself.
    await flush();
    const n = await row(p.id);
    expect(n.pushStatus).toBe('SENT');
    expect(n.pushedAt).not.toBeNull();
    expect(fake.sent.filter((m) => m.to === p.pushToken)).toHaveLength(1);
  });

  it('marks a person without a device NONE and sends nothing', async () => {
    const p = await person(false);
    await tell(p);
    await flush();
    const n = await row(p.id);
    expect(n.pushStatus).toBe('NONE');
    expect(n.pushAt).toBeNull();
    expect(fake.sent).toHaveLength(0);
  });

  it('writes only the type-based title, a generic body and the id and link', async () => {
    const p = await person();
    await tell(p);
    await flush();
    const n = await row(p.id);
    const m = fake.sent.find((x) => x.to === p.pushToken)!;
    expect(m).toEqual({
      to: p.pushToken,
      title: 'New results',
      body: 'Open the app to read it.',
      sound: 'default',
      data: { notificationId: n.id, link: '/portal/results' },
    });
    // Only the human-readable text is checked here: the ids in `data` are random and may contain
    // any digits (a "92" inside a UUID once failed this test). The exact match above covers the rest.
    const readable = `${m.title} ${m.body}`;
    for (const secret of ['Asha', 'Maths', '92', 'Fees pending', '12,500']) {
      expect(readable).not.toContain(secret);
    }
  });

  it('holds back a push whose time has not come, and sends it when due', async () => {
    const p = await person();
    const later = new Date(Date.now() + 3 * 3_600_000);
    await tell(p, { pushAt: later });
    await flush();
    let n = await row(p.id);
    expect(n.pushStatus).toBe('PENDING');
    expect(n.pushAt?.getTime()).toBe(later.getTime());
    expect(fake.sent).toHaveLength(0);
    // The message is in the inbox straight away.
    const inbox = await p.agent.get('/api/notifications').expect(200);
    expect(inbox.body.items).toHaveLength(1);

    await flush(new Date(later.getTime() + 1000));
    n = await row(p.id);
    expect(n.pushStatus).toBe('SENT');
    expect(fake.sent).toHaveLength(1);
  });

  it('deletes a device the push service says is gone', async () => {
    const p = await person();
    fake.answer = () => ({ ok: false, error: 'DeviceNotRegistered' });
    await tell(p);
    await flush();
    expect(await prisma.device.count({ where: { userId: p.id } })).toBe(0);
    const n = await row(p.id);
    expect(n.pushStatus).toBe('NONE');
    expect(n.pushAttempts).toBe(0);
  });

  it('sends to every device, is sent if one takes it, and removes only the dead one', async () => {
    const p = await person();
    const second = token();
    await p.agent
      .post('/api/devices')
      .send({ platform: 'IOS', pushToken: second })
      .expect(200);
    fake.answer = (m) =>
      m.to === p.pushToken
        ? { ok: false, error: 'DeviceNotRegistered' }
        : { ok: true };
    await tell(p);
    await flush();
    expect((await row(p.id)).pushStatus).toBe('SENT');
    const left = await prisma.device.findMany({ where: { userId: p.id } });
    expect(left.map((d) => d.pushToken)).toEqual([second]);
  });

  it('retries a failure after 1, 5 and 30 minutes and then marks it FAILED', async () => {
    const p = await person();
    fake.answer = () => ({ ok: false, error: 'MessageRateExceeded' });
    await tell(p);
    await flush();
    const start = Date.now();
    let n = await row(p.id);
    expect(n.pushStatus).toBe('PENDING');
    expect(n.pushAttempts).toBe(1);
    expect(n.pushAt!.getTime() - start).toBeGreaterThan(55_000);
    expect(n.pushAt!.getTime() - start).toBeLessThan(65_000);

    // Not yet due: nothing is sent.
    const before = fake.sent.length;
    await flush(new Date(start + 30_000));
    expect(fake.sent.length).toBe(before);

    let now = new Date(n.pushAt!.getTime() + 1000);
    await flush(now);
    n = await row(p.id);
    expect(n.pushStatus).toBe('PENDING');
    expect(n.pushAttempts).toBe(2);
    expect(n.pushAt!.getTime() - now.getTime()).toBe(5 * 60_000);

    now = new Date(n.pushAt!.getTime() + 1000);
    await flush(now);
    n = await row(p.id);
    expect(n.pushAttempts).toBe(3);
    expect(n.pushAt!.getTime() - now.getTime()).toBe(30 * 60_000);

    now = new Date(n.pushAt!.getTime() + 1000);
    await flush(now);
    n = await row(p.id);
    expect(n.pushStatus).toBe('FAILED');
    expect(n.pushAttempts).toBe(4);

    // And it is not tried again.
    const count = fake.sent.length;
    await flush(new Date(now.getTime() + 24 * 3_600_000 - 60_000));
    expect(fake.sent.length).toBe(count);
  });

  it('treats an unreachable push service as a failure to retry', async () => {
    const p = await person();
    const original = fake.send.bind(fake);
    fake.send = () => Promise.reject(new Error('network down'));
    try {
      await tell(p);
      await flush();
    } finally {
      fake.send = original;
    }
    const n = await row(p.id);
    expect(n.pushStatus).toBe('PENDING');
    expect(n.pushAttempts).toBe(1);
    expect(await prisma.device.count({ where: { userId: p.id } })).toBe(1);
  });

  it('two runs at the same moment send a message only once', async () => {
    const p = await person();
    const later = new Date(Date.now() + 1000);
    await tell(p, { pushAt: later });
    const due = new Date(later.getTime() + 1000);
    await Promise.all([
      push.sendDue(due),
      push.sendDue(due),
      push.sendDue(due),
    ]);
    expect(fake.sent.filter((m) => m.to === p.pushToken)).toHaveLength(1);
    expect((await row(p.id)).pushStatus).toBe('SENT');
  });

  it('skips a push for something already read in the app', async () => {
    const p = await person();
    const later = new Date(Date.now() + 3_600_000);
    await tell(p, { pushAt: later });
    await p.agent.post('/api/notifications/read-all').expect(200);
    await flush(new Date(later.getTime() + 1000));
    expect((await row(p.id)).pushStatus).toBe('NONE');
    expect(fake.sent).toHaveLength(0);
  });

  it('tells many people with one device lookup and marks only those with devices', async () => {
    const a = await person();
    const b = await person(false);
    const c = await person();
    await notifications.notify(a.schoolId, [a.id, b.id, c.id, a.id], {
      type: 'notice.created',
      title: 'Holiday',
    });
    await flush();
    const rows = await prisma.notification.findMany({
      where: { userId: { in: [a.id, b.id, c.id] } },
    });
    expect(rows).toHaveLength(3);
    expect(
      Object.fromEntries(rows.map((r) => [r.userId, r.pushStatus])),
    ).toEqual({ [a.id]: 'SENT', [b.id]: 'NONE', [c.id]: 'SENT' });
    expect(fake.sent.every((m) => m.title === 'New notice')).toBe(true);
  });

  it('never fails the feature when sending breaks', async () => {
    const p = await person();
    const spy = vi
      .spyOn(prisma, '$transaction')
      .mockRejectedValueOnce(new Error('db hiccup'));
    try {
      await expect(tell(p)).resolves.toBe(1);
      await push.idle();
    } finally {
      spy.mockRestore();
    }
    expect((await row(p.id)).pushStatus).toBe('PENDING');
  });

  describe('devices', () => {
    it('requires an Expo push token for phones, and accepts any for the web', async () => {
      const u = await createSettledUser(app, admin, 'STAFF');
      await u.agent
        .post('/api/devices')
        .send({ platform: 'ANDROID', pushToken: 'plain-fcm-token' })
        .expect(400);
      await u.agent
        .post('/api/devices')
        .send({ platform: 'IOS', pushToken: 'ExponentPushToken[]' })
        .expect(400);
      await u.agent
        .post('/api/devices')
        .send({ platform: 'ANDROID', pushToken: 'ExpoPushToken[abc123]' })
        .expect(200);
      await u.agent
        .post('/api/devices')
        .send({ platform: 'WEB', pushToken: unique('web') })
        .expect(200);
    });

    it('signing out does not remove devices; the app deletes them itself', async () => {
      const made = await createSettledUser(app, admin, 'STAFF');
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Client', 'mobile')
        .send({ identifier: made.email, password: made.password })
        .expect(200);
      const bearer = `Bearer ${login.body.token as string}`;
      const reg = await request(app.getHttpServer())
        .post('/api/devices')
        .set('Authorization', bearer)
        .send({ platform: 'ANDROID', pushToken: token() })
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', bearer)
        .expect(204);
      expect(await prisma.device.count({ where: { userId: made.id } })).toBe(1);
      expect(
        await prisma.device.findUnique({
          where: { id: reg.body.id as string },
        }),
      ).not.toBeNull();
    });
  });
});
