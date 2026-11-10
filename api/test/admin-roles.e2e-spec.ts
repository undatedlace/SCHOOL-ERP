import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/database/prisma.service.js';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
  createUser,
  newAgent,
  unique,
} from './helpers.js';

describe('super admin and school admin (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let superAdmin: Agent;
  let schoolAdmin: Agent;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    superAdmin = await adminAgent(app);
    schoolAdmin = (await createSettledUser(app, superAdmin, 'SCHOOL_ADMIN'))
      .agent;
  });
  afterAll(() => app.close());

  describe('what a School Admin can still do', () => {
    it('runs the school: users, staff, academic setup, forms and fee setup', async () => {
      await schoolAdmin.get('/api/users').expect(200);
      await schoolAdmin.get('/api/rbac/roles').expect(200);
      await schoolAdmin
        .post('/api/classes')
        .send({ name: unique('Std') })
        .expect(201);
      await schoolAdmin.get('/api/forms').expect(200);
      await schoolAdmin.get('/api/fee-heads').expect(200);
      await schoolAdmin.get('/api/staff').expect(200);
    });

    it('can create ordinary accounts, such as a teacher', async () => {
      const t = await createUser(schoolAdmin, 'TEACHER');
      expect(t.id).toBeDefined();
    });
  });

  describe('what only a Super Admin can do', () => {
    it('settings, audit log, reversals and concessions are refused to a School Admin', async () => {
      await schoolAdmin.get('/api/audit-logs').expect(403);
      await schoolAdmin
        .patch('/api/school')
        .send({ name: unique('S') })
        .expect(403);
      await schoolAdmin
        .post(`/api/payments/${randomUUID()}/reverse`)
        .send({ reason: 'x' })
        .expect(403);
      await schoolAdmin
        .post(`/api/fee-invoices/${randomUUID()}/concessions`)
        .send({ amount: '1.00', reason: 'x' })
        .expect(403);
      await superAdmin.get('/api/audit-logs').expect(200);
    });

    it('a School Admin cannot create an admin account or give an admin role', async () => {
      for (const role of ['SUPER_ADMIN', 'SCHOOL_ADMIN']) {
        await schoolAdmin
          .post('/api/users')
          .send({
            fullName: 'Test Admin',
            email: `${unique('a')}@test.local`,
            roleCodes: [role],
          })
          .expect(403);
      }
      const teacher = await createUser(schoolAdmin, 'TEACHER');
      await schoolAdmin
        .patch(`/api/users/${teacher.id}`)
        .send({ roleCodes: ['SCHOOL_ADMIN'] })
        .expect(403);
    });

    it('a School Admin cannot change, disable or reset another administrator', async () => {
      const other = await createUser(superAdmin, 'SCHOOL_ADMIN');
      await schoolAdmin
        .patch(`/api/users/${other.id}`)
        .send({ roleCodes: ['TEACHER'] })
        .expect(403);
      await schoolAdmin
        .patch(`/api/users/${other.id}`)
        .send({ status: 'DISABLED' })
        .expect(403);
      await schoolAdmin
        .post(`/api/auth/users/${other.id}/reset-password`)
        .expect(403);
      // The Super Admin can.
      await superAdmin
        .post(`/api/auth/users/${other.id}/reset-password`)
        .expect(200);
    });

    it('a School Admin cannot give a staff member an admin login', async () => {
      const email = `${unique('t')}@test.local`;
      const res = await schoolAdmin.post('/api/staff').send({
        firstName: 'Asha',
        surname: unique('Rao'),
        gender: 'FEMALE',
        designation: 'Teacher',
        email,
        account: { roleCodes: ['SCHOOL_ADMIN'] },
      });
      expect(res.status).toBe(403);
      const ok = await schoolAdmin.post('/api/staff').send({
        firstName: 'Asha',
        surname: unique('Rao'),
        gender: 'FEMALE',
        designation: 'Teacher',
        email: `${unique('t')}@test.local`,
        account: { roleCodes: ['TEACHER'] },
      });
      expect(ok.status).toBe(201);
      // A Super Admin may.
      await superAdmin
        .post('/api/staff')
        .send({
          firstName: 'Meera',
          surname: unique('Iyer'),
          gender: 'FEMALE',
          designation: 'Vice Principal',
          email: `${unique('t')}@test.local`,
          account: { roleCodes: ['SCHOOL_ADMIN'] },
        })
        .expect(201);
    });
  });

  describe('temporary passwords expire', () => {
    const login = (identifier: string, password: string) =>
      newAgent(app).post('/api/auth/login').send({ identifier, password });

    it('a new temporary password works for 2 days from creation', async () => {
      const u = await createUser(superAdmin, 'TEACHER');
      const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
      const days =
        (row.tempPasswordExpiresAt!.getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(1.99);
      expect(days).toBeLessThanOrEqual(2);
      await login(u.email, u.tempPassword).expect(200);
    });

    it('is refused after that, with a clear message, and only when the password was right', async () => {
      const u = await createUser(superAdmin, 'TEACHER');
      await prisma.user.update({
        where: { id: u.id },
        data: { tempPasswordExpiresAt: new Date(Date.now() - 1000) },
      });
      const res = await login(u.email, u.tempPassword).expect(401);
      expect(res.body.message).toMatch(/temporary password has expired/i);
      // A wrong password gets the ordinary answer and learns nothing.
      const wrong = await login(u.email, 'not-the-password').expect(401);
      expect(wrong.body.message).toBe('Invalid credentials');
      const log = await prisma.auditLog.findFirst({
        where: { actorUserId: u.id, action: 'auth.temp_password_expired' },
      });
      expect(log).not.toBeNull();
    });

    it('a reset gives a fresh 2 days and signing in works again', async () => {
      const u = await createUser(superAdmin, 'TEACHER');
      await prisma.user.update({
        where: { id: u.id },
        data: { tempPasswordExpiresAt: new Date(Date.now() - 1000) },
      });
      const reset = await superAdmin
        .post(`/api/auth/users/${u.id}/reset-password`)
        .expect(200);
      await login(u.email, reset.body.temporaryPassword).expect(200);
    });

    it('changing the password clears the expiry, so a settled account is never locked', async () => {
      const u = await createSettledUser(
        superAdmin ? app : app,
        superAdmin,
        'TEACHER',
      );
      const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
      expect(row.tempPasswordExpiresAt).toBeNull();
      expect(row.mustChangePassword).toBe(false);
      await login(u.email, u.password).expect(200);
    });
  });
});
