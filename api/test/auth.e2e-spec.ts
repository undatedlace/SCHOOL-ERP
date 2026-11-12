import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { hashToken } from '../src/modules/auth/auth.constants.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
  createUser,
  login,
  loginAndSettle,
  unique,
} from './helpers.js';

describe('auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Agent;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await adminAgent(app);
  });
  afterAll(() => app.close());

  const http = () => request(app.getHttpServer());

  it('health check is public and reaches the database', () =>
    http().get('/api/health').expect(200, { status: 'ok' }));

  it('rejects anonymous requests', async () => {
    await http().get('/api/school').expect(401);
    await http().get('/api/auth/me').expect(401);
    await http().get('/api/users').expect(401);
  });

  it('rejects a wrong password and an unknown user with the same message', async () => {
    const wrong = await http()
      .post('/api/auth/login')
      .send({ identifier: 'admin@test.local', password: 'nope-nope-nope' })
      .expect(401);
    const unknown = await http()
      .post('/api/auth/login')
      .send({ identifier: 'nobody@test.local', password: 'nope-nope-nope' })
      .expect(401);
    expect(wrong.body.message).toBe('Invalid credentials');
    expect(unknown.body.message).toBe('Invalid credentials');
  });

  it('rejects unknown fields and missing fields in the login body', async () => {
    await http()
      .post('/api/auth/login')
      .send({ identifier: 'a@b.c', password: 'x', extra: true })
      .expect(400);
    await http()
      .post('/api/auth/login')
      .send({ identifier: 'a@b.c' })
      .expect(400);
  });

  it('sets an HttpOnly, SameSite=Lax cookie and stores only a hash of the token', async () => {
    const user = await createUser(admin, 'STAFF');
    const res = await http()
      .post('/api/auth/login')
      .send({ identifier: user.email, password: user.tempPassword })
      .expect(200);

    const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toMatch(/^sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const token = cookie.split(';')[0].slice('sid='.length);
    expect(
      await prisma.session.findFirst({
        where: { tokenHash: hashToken(token) },
      }),
    ).not.toBeNull();
    expect(
      await prisma.session.findFirst({ where: { tokenHash: token } }),
    ).toBeNull();
  });

  it('forces a temporary password to be changed before anything else works', async () => {
    const user = await createUser(admin, 'TEACHER');
    const agent = await login(app, user.email, user.tempPassword);

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.mustChangePassword).toBe(true);

    const blocked = await agent.get('/api/school').expect(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    await agent
      .post('/api/auth/change-password')
      .send({
        currentPassword: 'wrong-current',
        newPassword: 'A-Brand-New-Pass-1',
      })
      .expect(400);
    await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: user.tempPassword, newPassword: 'short' })
      .expect(400);
    await agent
      .post('/api/auth/change-password')
      .send({
        currentPassword: user.tempPassword,
        newPassword: user.tempPassword,
      })
      .expect(400);
    await agent
      .post('/api/auth/change-password')
      .send({
        currentPassword: user.tempPassword,
        newPassword: 'A-Brand-New-Pass-1',
      })
      .expect(204);

    await agent.get('/api/school').expect(200);
    expect(
      (await agent.get('/api/auth/me').expect(200)).body.mustChangePassword,
    ).toBe(false);

    await http()
      .post('/api/auth/login')
      .send({ identifier: user.email, password: user.tempPassword })
      .expect(401);
    await http()
      .post('/api/auth/login')
      .send({ identifier: user.email, password: 'A-Brand-New-Pass-1' })
      .expect(200);
  });

  it('changing the password revokes the other sessions of that user', async () => {
    const user = await createSettledUser(app, admin, 'TEACHER');
    const otherDevice = await login(app, user.email, user.password);
    await otherDevice.get('/api/auth/me').expect(200);

    await user.agent
      .post('/api/auth/change-password')
      .send({
        currentPassword: user.password,
        newPassword: 'Yet-Another-Pass-2',
      })
      .expect(204);

    await otherDevice.get('/api/auth/me').expect(401);
    await user.agent.get('/api/auth/me').expect(200);
  });

  it('logout ends the session on the server', async () => {
    const user = await createSettledUser(app, admin, 'STAFF');
    const before = await prisma.session.count({ where: { userId: user.id } });
    expect(before).toBeGreaterThan(0);

    await user.agent.post('/api/auth/logout').expect(204);
    await user.agent.get('/api/auth/me').expect(401);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('an admin password reset forces a change and signs the user out everywhere', async () => {
    const user = await createSettledUser(app, admin, 'TEACHER');

    const reset = await admin
      .post(`/api/auth/users/${user.id}/reset-password`)
      .expect(200);
    expect(reset.body.temporaryPassword).toEqual(expect.any(String));

    await user.agent.get('/api/auth/me').expect(401);
    await http()
      .post('/api/auth/login')
      .send({ identifier: user.email, password: user.password })
      .expect(401);

    const again = await login(app, user.email, reset.body.temporaryPassword);
    expect(
      (await again.get('/api/auth/me').expect(200)).body.mustChangePassword,
    ).toBe(true);
  });

  it('only users with users.manage can reset passwords', async () => {
    const teacher = await createSettledUser(app, admin, 'TEACHER');
    const target = await createUser(admin, 'STAFF');
    await teacher.agent
      .post(`/api/auth/users/${target.id}/reset-password`)
      .expect(403);
  });

  it('a disabled user loses the existing session and cannot log in again', async () => {
    const user = await createSettledUser(app, admin, 'TEACHER');
    await admin
      .patch(`/api/users/${user.id}`)
      .send({ status: 'DISABLED' })
      .expect(200);

    await user.agent.get('/api/auth/me').expect(401);
    await http()
      .post('/api/auth/login')
      .send({ identifier: user.email, password: user.password })
      .expect(401);

    await admin
      .patch(`/api/users/${user.id}`)
      .send({ status: 'ACTIVE' })
      .expect(200);
    await login(app, user.email, user.password);
  });

  it('expired sessions are rejected', async () => {
    const user = await createSettledUser(app, admin, 'STAFF');
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await user.agent.get('/api/auth/me').expect(401);
  });

  it('staff sessions last 12 hours and parent sessions 30 days', async () => {
    const staff = await createSettledUser(app, admin, 'TEACHER');
    const parent = await createSettledUser(app, admin, 'PARENT');
    const hours = async (userId: string) => {
      const s = await prisma.session.findFirstOrThrow({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      return Math.round(
        (s.expiresAt.getTime() - s.createdAt.getTime()) / 3_600_000,
      );
    };
    expect(await hours(staff.id)).toBe(12);
    expect(await hours(parent.id)).toBe(30 * 24);
  });

  it('refuses state-changing requests from other origins (CSRF)', async () => {
    const name = unique('Subject');
    await admin
      .post('/api/subjects')
      .set('Origin', 'http://evil.example')
      .send({ name })
      .expect(403);
    await admin
      .post('/api/subjects')
      .set('Origin', 'http://localhost:4200')
      .send({ name })
      .expect(201);
    // Reads are not state-changing, so they are not origin-checked.
    await admin
      .get('/api/subjects')
      .set('Origin', 'http://evil.example')
      .expect(200);
  });

  it('records logins and failed logins in the audit log', async () => {
    const user = await createUser(admin, 'STAFF');
    await http()
      .post('/api/auth/login')
      .send({ identifier: user.email, password: 'wrong-wrong-wrong' })
      .expect(401);
    await loginAndSettle(
      app,
      user.email,
      user.tempPassword,
      'Audit-Check-Pass-3',
    );

    const failed = await prisma.auditLog.findFirst({
      where: {
        action: 'auth.login_failed',
        metadata: { path: ['identifier'], equals: user.email },
      },
    });
    const ok = await prisma.auditLog.findFirst({
      where: { action: 'auth.login', actorUserId: user.id },
    });
    const changed = await prisma.auditLog.findFirst({
      where: { action: 'auth.password_changed', actorUserId: user.id },
    });
    expect(failed).not.toBeNull();
    expect(ok).not.toBeNull();
    expect(changed).not.toBeNull();
  });
  it('app-info is public and empty unless this is a test copy', async () => {
    const saved = {
      label: process.env.APP_ENV_LABEL,
      url: process.env.FEEDBACK_URL,
    };
    try {
      delete process.env.APP_ENV_LABEL;
      delete process.env.FEEDBACK_URL;
      await http()
        .get('/api/app-info')
        .expect(200)
        .expect((r) => {
          expect(r.body).toMatchObject({
            environmentLabel: null,
            feedbackUrl: null,
          });
          expect(typeof r.body.schoolCodeOffered).toBe('boolean');
        });

      process.env.APP_ENV_LABEL = 'Test environment';
      process.env.FEEDBACK_URL = 'https://forms.gle/abc';
      const set = await http().get('/api/app-info').expect(200);
      expect(set.body).toMatchObject({
        environmentLabel: 'Test environment',
        feedbackUrl: 'https://forms.gle/abc',
      });

      // Anything that is not an https address is never passed on as a link.
      process.env.FEEDBACK_URL = 'javascript:alert(1)';
      const res = await http().get('/api/app-info').expect(200);
      expect(res.body.feedbackUrl).toBeNull();
    } finally {
      for (const [k, v] of [
        ['APP_ENV_LABEL', saved.label],
        ['FEEDBACK_URL', saved.url],
      ] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it('the recovery command issues a temporary password and signs the person out', async () => {
    const user = await createSettledUser(
      app,
      admin,
      'SCHOOL_ADMIN',
      'Locked Out',
    );
    await user.agent.get('/api/auth/me').expect(200);

    const { temporaryPassword } = await app
      .get(AuthService)
      .recoverPassword(`  ${user.email.toUpperCase()} `);

    // Signed out everywhere, and the old password no longer works.
    await user.agent.get('/api/auth/me').expect(401);
    await http()
      .post('/api/auth/login')
      .send({ identifier: user.email, password: user.password })
      .expect(401);

    const back = await login(app, user.email, temporaryPassword);
    const me = await back.get('/api/auth/me').expect(200);
    expect(me.body.mustChangePassword).toBe(true);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.tempPasswordExpiresAt).not.toBeNull();
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'auth.password_reset_cli', entityId: user.id },
    });
    expect(audit).not.toBeNull();
  });

  it('the recovery command refuses an unknown login', async () => {
    await expect(
      app.get(AuthService).recoverPassword('nobody@nowhere.test'),
    ).rejects.toThrow('No login found');
  });
});
