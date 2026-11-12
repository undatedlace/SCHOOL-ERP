import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service.js';
import {
  ADMIN_EMAIL,
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
  createUser,
  unique,
} from './helpers.js';

describe('users, roles and tenancy (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Agent;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await adminAgent(app);
  });
  afterAll(() => app.close());

  it('lists the seeded roles with their permissions', async () => {
    const res = await admin.get('/api/rbac/roles').expect(200);
    const codes = res.body.map((r: { code: string }) => r.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'SUPER_ADMIN',
        'SCHOOL_ADMIN',
        'OFFICE_STAFF',
        'ACCOUNTANT',
        'TEACHER',
        'STAFF',
        'PARENT',
        'STUDENT',
      ]),
    );
    const superRole = res.body.find(
      (r: { code: string }) => r.code === 'SUPER_ADMIN',
    );
    expect(superRole.permissions).toContain('fees.payment.reverse');
    expect(superRole.permissions).toContain('admins.manage');
    // The School Admin runs the school but keeps out of the trustees' powers.
    const schoolAdmin = res.body.find(
      (r: { code: string }) => r.code === 'SCHOOL_ADMIN',
    );
    expect(schoolAdmin.permissions).toContain('users.manage');
    expect(schoolAdmin.permissions).toContain('forms.manage');
    expect(schoolAdmin.permissions).toContain('fees.payment.create');
    for (const p of [
      'admins.manage',
      'settings.manage',
      'audit.read',
      'fees.payment.reverse',
      'fees.concession.manage',
    ]) {
      expect(schoolAdmin.permissions).not.toContain(p);
    }
    const accountant = res.body.find(
      (r: { code: string }) => r.code === 'ACCOUNTANT',
    );
    expect(accountant.permissions).not.toContain('fees.payment.reverse');
  });

  describe('permissions', () => {
    it('a teacher can read academic setup but not change it, and cannot manage users or read the audit log', async () => {
      const teacher = await createSettledUser(app, admin, 'TEACHER');
      await teacher.agent.get('/api/classes').expect(200);
      await teacher.agent
        .post('/api/classes')
        .send({ name: unique('Class') })
        .expect(403);
      await teacher.agent.get('/api/users').expect(403);
      await teacher.agent.get('/api/audit-logs').expect(403);
      await teacher.agent.get('/api/rbac/roles').expect(403);
    });

    it('a parent cannot see academic setup', async () => {
      const parent = await createSettledUser(app, admin, 'PARENT');
      await parent.agent.get('/api/classes').expect(403);
      await parent.agent.get('/api/auth/me').expect(200);
    });

    it('role changes take effect immediately, without logging in again', async () => {
      const user = await createSettledUser(app, admin, 'TEACHER');
      await user.agent.get('/api/users').expect(403);

      await admin
        .patch(`/api/users/${user.id}`)
        .send({ roleCodes: ['SCHOOL_ADMIN'] })
        .expect(200);
      await user.agent.get('/api/users').expect(200);

      await admin
        .patch(`/api/users/${user.id}`)
        .send({ roleCodes: ['TEACHER'] })
        .expect(200);
      await user.agent.get('/api/users').expect(403);
    });

    it('a user with several roles gets the union of their permissions', async () => {
      const user = await createSettledUser(app, admin, 'TEACHER');
      await admin
        .patch(`/api/users/${user.id}`)
        .send({ roleCodes: ['TEACHER', 'ACCOUNTANT'] })
        .expect(200);
      const me = await user.agent.get('/api/auth/me').expect(200);
      expect(me.body.roles.sort()).toEqual(['ACCOUNTANT', 'TEACHER']);
      expect(me.body.permissions).toEqual(
        expect.arrayContaining(['attendance.mark', 'fees.payment.create']),
      );
    });
  });

  describe('creating and listing users', () => {
    it('generates a temporary password when none is given', async () => {
      const user = await createUser(admin, 'OFFICE_STAFF', 'Front Office');
      expect(user.tempPassword).toHaveLength(12);
      const fetched = await admin.get(`/api/users/${user.id}`).expect(200);
      expect(fetched.body.mustChangePassword).toBe(true);
      expect(fetched.body).not.toHaveProperty('passwordHash');
      expect(fetched.body.roles).toEqual([
        { code: 'OFFICE_STAFF', name: 'Office Staff' },
      ]);
    });

    it('accepts a mobile number as the only login identifier', async () => {
      const mobile = `9${Math.floor(100000000 + Math.random() * 899999999)}`;
      const res = await admin
        .post('/api/users')
        .send({ fullName: 'Mobile Parent', mobile, roleCodes: ['PARENT'] })
        .expect(201);
      // A separate client: logging in on the admin's agent would replace the admin's cookie.
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ identifier: mobile, password: res.body.temporaryPassword })
        .expect(200);
    });

    it('validates input', async () => {
      await admin
        .post('/api/users')
        .send({ fullName: 'No Contact', roleCodes: ['STAFF'] })
        .expect(400);
      await admin
        .post('/api/users')
        .send({
          fullName: 'Bad Role',
          email: `${unique('x')}@test.local`,
          roleCodes: ['WIZARD'],
        })
        .expect(400);
      await admin
        .post('/api/users')
        .send({
          fullName: 'Bad Email',
          email: 'not-an-email',
          roleCodes: ['STAFF'],
        })
        .expect(400);
      await admin
        .post('/api/users')
        .send({
          fullName: 'Short Pw',
          email: `${unique('x')}@test.local`,
          roleCodes: ['STAFF'],
          password: 'short',
        })
        .expect(400);
      await admin
        .post('/api/users')
        .send({
          fullName: 'No Roles',
          email: `${unique('x')}@test.local`,
          roleCodes: [],
        })
        .expect(400);
      await admin
        .post('/api/users')
        .send({
          fullName: 'Extra',
          email: `${unique('x')}@test.local`,
          roleCodes: ['STAFF'],
          isAdmin: true,
        })
        .expect(400);
    });

    it('rejects a duplicate email and treats email case-insensitively', async () => {
      const user = await createUser(admin, 'STAFF');
      await admin
        .post('/api/users')
        .send({
          fullName: 'Dup',
          email: user.email.toUpperCase(),
          roleCodes: ['STAFF'],
        })
        .expect(409);
    });

    it('searches, filters and paginates', async () => {
      const tag = unique('zq').replace(/-/g, '');
      for (let i = 0; i < 3; i++)
        await createUser(admin, 'TEACHER', `${tag} Person ${i}`);
      await createUser(admin, 'STAFF', `${tag} Other`);

      const page1 = await admin
        .get(`/api/users?search=${tag}&pageSize=2&page=1`)
        .expect(200);
      expect(page1.body.total).toBe(4);
      expect(page1.body.items).toHaveLength(2);
      const page2 = await admin
        .get(`/api/users?search=${tag}&pageSize=2&page=2`)
        .expect(200);
      expect(page2.body.items).toHaveLength(2);

      const teachers = await admin
        .get(`/api/users?search=${tag}&role=TEACHER`)
        .expect(200);
      expect(teachers.body.total).toBe(3);

      await admin.get('/api/users?pageSize=1000').expect(400);
      await admin.get('/api/users?page=0').expect(400);
    });

    it('rejects a malformed id', () =>
      admin.get('/api/users/not-a-uuid').expect(400));
  });

  describe('protecting the admin account', () => {
    it('an admin cannot disable their own account', async () => {
      const me = await prisma.user.findFirstOrThrow({
        where: { email: ADMIN_EMAIL },
      });
      await admin
        .patch(`/api/users/${me.id}`)
        .send({ status: 'DISABLED' })
        .expect(400);
    });

    it('the school always keeps one active Super Admin', async () => {
      const me = await prisma.user.findFirstOrThrow({
        where: { email: ADMIN_EMAIL },
      });
      // Make this admin the only active one.
      await prisma.user.updateMany({
        where: {
          id: { not: me.id },
          roles: { some: { role: { code: 'SUPER_ADMIN' } } },
        },
        data: { status: 'DISABLED' },
      });

      const res = await admin
        .patch(`/api/users/${me.id}`)
        .send({ roleCodes: ['TEACHER'] })
        .expect(400);
      expect(res.body.message).toMatch(/at least one active Super Admin/);

      // With a second active admin the same change is allowed (then restored).
      const second = await createUser(admin, 'SUPER_ADMIN');
      await admin
        .patch(`/api/users/${me.id}`)
        .send({ roleCodes: ['TEACHER'] })
        .expect(200);
      // Restore the admin role so later tests still have an admin.
      await prisma.userRole.create({
        data: {
          userId: me.id,
          roleId: (
            await prisma.role.findUniqueOrThrow({
              where: { code: 'SUPER_ADMIN' },
            })
          ).id,
        },
      });
      expect(second.id).toBeDefined();
    });
  });

  describe('school isolation (multi-school readiness)', () => {
    it("never exposes or modifies another school's data", async () => {
      const otherSchool = await prisma.school.create({
        data: {
          name: unique('Other School'),
          code: unique('other').toLowerCase(),
        },
      });
      const foreignUser = await prisma.user.create({
        data: {
          schoolId: otherSchool.id,
          fullName: 'Foreign Teacher',
          email: `${unique('f')}@other.local`,
          passwordHash: 'x',
        },
      });
      const foreignClass = await prisma.schoolClass.create({
        data: { schoolId: otherSchool.id, name: 'Class 1', sortOrder: 1 },
      });
      const foreignYear = await prisma.academicYear.create({
        data: {
          schoolId: otherSchool.id,
          name: '2026-27',
          startDate: new Date('2026-04-01'),
          endDate: new Date('2027-03-31'),
        },
      });

      await admin.get(`/api/users/${foreignUser.id}`).expect(404);
      await admin
        .patch(`/api/users/${foreignUser.id}`)
        .send({ fullName: 'Hacked' })
        .expect(404);
      await admin
        .post(`/api/auth/users/${foreignUser.id}/reset-password`)
        .expect(404);
      const list = await admin.get('/api/users?pageSize=100').expect(200);
      expect(list.body.items.map((u: { id: string }) => u.id)).not.toContain(
        foreignUser.id,
      );

      await admin
        .patch(`/api/classes/${foreignClass.id}`)
        .send({ name: 'Hacked' })
        .expect(404);
      await admin.delete(`/api/classes/${foreignClass.id}`).expect(404);
      await admin
        .post(`/api/classes/${foreignClass.id}/divisions`)
        .send({ name: 'A' })
        .expect(404);
      await admin
        .post(`/api/academic-years/${foreignYear.id}/set-current`)
        .expect(404);
      await admin
        .patch(`/api/academic-years/${foreignYear.id}`)
        .send({ name: 'Hacked' })
        .expect(404);
      const classes = await admin.get('/api/classes').expect(200);
      expect(classes.body.map((c: { id: string }) => c.id)).not.toContain(
        foreignClass.id,
      );

      expect(
        (
          await prisma.schoolClass.findUniqueOrThrow({
            where: { id: foreignClass.id },
          })
        ).name,
      ).toBe('Class 1');
    });

    it('returns 404 for ids that do not exist', async () => {
      await admin.get(`/api/users/${randomUUID()}`).expect(404);
      await admin
        .patch(`/api/classes/${randomUUID()}`)
        .send({ name: 'x' })
        .expect(404);
    });
  });
});
