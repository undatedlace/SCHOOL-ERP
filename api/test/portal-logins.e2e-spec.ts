import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service.js';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
  login,
  loginAndSettle,
  newAgent,
  unique,
} from './helpers.js';

const mobile = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;

describe('parent and student logins (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Agent;
  let office: Agent;
  let classId: string;
  let divA: string;
  let divB: string;

  /** Admits a new student (through the real flow) and returns the ids. */
  async function admitStudent(
    division: string,
    guardians: Record<string, unknown>[],
    surname = unique('Khan'),
  ) {
    const created = (
      await office
        .post('/api/admissions/applications')
        .send({
          answers: {
            classApplied: classId,
            surname,
            firstName: 'Zoya',
            gender: 'FEMALE',
            dateOfBirth: '2021-06-15',
            undertakingReceived: true,
          },
        })
        .expect(201)
    ).body;
    await office
      .post(`/api/admissions/applications/${created.id}/decision`)
      .send({ decision: 'GRANTED' })
      .expect(200);
    const student = (
      await office
        .post(`/api/admissions/applications/${created.id}/admit`)
        .send({ divisionId: division, guardians })
        .expect(201)
    ).body;
    const detail = (
      await admin.get(`/api/students/${student.studentId}`).expect(200)
    ).body;
    return {
      id: student.studentId as string,
      admissionNo: detail.admissionNo as string,
      surname,
      guardianIds: detail.guardians.map(
        (g: { id: string }) => g.id,
      ) as string[],
    };
  }
  const father = (m = mobile()) => ({
    fullName: 'Farhan Khan',
    relationship: 'FATHER',
    mobile: m,
    isPrimary: true,
  });

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await adminAgent(app);
    office = (await createSettledUser(app, admin, 'OFFICE_STAFF')).agent;
    const years = (await admin.get('/api/academic-years').expect(200)).body as {
      id: string;
      isCurrent: boolean;
    }[];
    if (!years.some((y) => y.isCurrent)) {
      await admin
        .post('/api/academic-years')
        .send({
          name: unique('AY'),
          startDate: '2026-04-01',
          endDate: '2027-03-31',
          isCurrent: true,
        })
        .expect(201);
    }
    classId = (
      await admin
        .post('/api/classes')
        .send({ name: unique('KG') })
        .expect(201)
    ).body.id;
    const div = async (name: string) =>
      (
        await admin
          .post(`/api/classes/${classId}/divisions`)
          .send({ name })
          .expect(201)
      ).body.id as string;
    divA = await div('A');
    divB = await div('B');
  });
  afterAll(() => app.close());

  describe('parents', () => {
    it('office staff give a parent a login with their mobile number', async () => {
      const m = mobile();
      const s = await admitStudent(divA, [father(m)]);
      const res = await office
        .post(`/api/guardians/${s.guardianIds[0]}/account`)
        .expect(201);
      expect(res.body).toMatchObject({ loginId: m, shared: false });
      expect(res.body.temporaryPassword).toHaveLength(12);

      // Signs in with the temporary password, must change it, then sees only their child.
      const parent = await loginAndSettle(
        app,
        m,
        res.body.temporaryPassword,
        'Parent-Pass-123',
      );
      const mine = (await parent.get('/api/students').expect(200)).body;
      expect(mine.items.map((i: { id: string }) => i.id)).toEqual([s.id]);
      await parent.get(`/api/students/${s.id}`).expect(200);

      const other = await admitStudent(divA, [father()]);
      await parent.get(`/api/students/${other.id}`).expect(404);
    });

    it('gets a long session and cannot use staff screens', async () => {
      const m = mobile();
      const s = await admitStudent(divA, [father(m)]);
      const { body } = await office
        .post(`/api/guardians/${s.guardianIds[0]}/account`)
        .expect(201);
      const parent = await loginAndSettle(
        app,
        m,
        body.temporaryPassword,
        'Parent-Pass-123',
      );
      await parent.get('/api/users').expect(403);
      await parent.get('/api/admissions/applications').expect(403);
      await parent
        .post(`/api/guardians/${s.guardianIds[0]}/account`)
        .expect(403);
      const user = await prisma.session.findFirstOrThrow({
        where: { user: { mobile: m } },
      });
      const days = (user.expiresAt.getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(29);
    });

    it('a father and mother on one phone share one login', async () => {
      const m = mobile();
      const s = await admitStudent(divA, [
        father(m),
        { fullName: 'Mehr Khan', relationship: 'MOTHER', mobile: m },
      ]);
      expect(s.guardianIds).toHaveLength(2);
      const first = await office
        .post(`/api/guardians/${s.guardianIds[0]}/account`)
        .expect(201);
      const second = await office
        .post(`/api/guardians/${s.guardianIds[1]}/account`)
        .expect(201);
      expect(first.body.shared).toBe(false);
      expect(second.body).toMatchObject({ loginId: m, shared: true });
      expect(second.body.temporaryPassword).toBeUndefined();
      expect(await prisma.user.count({ where: { mobile: m } })).toBe(1);
    });

    it('one login sees all the children of a parent', async () => {
      const m = mobile();
      const a = await admitStudent(divA, [father(m)]);
      // Same name and mobile: the school treats this as the same guardian.
      const b = await admitStudent(divB, [father(m)]);
      expect(b.guardianIds[0]).toBe(a.guardianIds[0]);
      const { body } = await office
        .post(`/api/guardians/${a.guardianIds[0]}/account`)
        .expect(201);
      const parent = await loginAndSettle(
        app,
        m,
        body.temporaryPassword,
        'Parent-Pass-123',
      );
      const ids = (
        await parent.get('/api/students').expect(200)
      ).body.items.map((i: { id: string }) => i.id);
      expect(ids.sort()).toEqual([a.id, b.id].sort());
    });

    it('refuses sensible cases', async () => {
      const noPhone = await admitStudent(divA, [
        { fullName: 'No Phone', relationship: 'GUARDIAN' },
      ]);
      const r = await office
        .post(`/api/guardians/${noPhone.guardianIds[0]}/account`)
        .expect(400);
      expect(r.body.message).toMatch(/mobile number/);

      const s = await admitStudent(divA, [father()]);
      await office
        .post(`/api/guardians/${s.guardianIds[0]}/account`)
        .expect(201);
      await office
        .post(`/api/guardians/${s.guardianIds[0]}/account`)
        .expect(409);
      await office
        .post('/api/guardians/00000000-0000-4000-8000-000000000000/account')
        .expect(404);
    });

    it('will not take over a mobile number that belongs to a staff login', async () => {
      const staff = await createSettledUser(app, admin, 'TEACHER');
      const m = mobile();
      await prisma.user.update({
        where: { id: staff.id },
        data: { mobile: m },
      });
      const s = await admitStudent(divA, [father(m)]);
      const r = await office
        .post(`/api/guardians/${s.guardianIds[0]}/account`)
        .expect(409);
      expect(r.body.message).toMatch(/already used/);
    });

    it('resets a parent password, which signs them out', async () => {
      const m = mobile();
      const s = await admitStudent(divA, [father(m)]);
      const { body } = await office
        .post(`/api/guardians/${s.guardianIds[0]}/account`)
        .expect(201);
      const parent = await loginAndSettle(
        app,
        m,
        body.temporaryPassword,
        'Parent-Pass-123',
      );
      const reset = await office
        .post(`/api/guardians/${s.guardianIds[0]}/account/reset-password`)
        .expect(200);
      expect(reset.body.loginId).toBe(m);
      await parent.get('/api/students').expect(401);
      await newAgent(app)
        .post('/api/auth/login')
        .send({ identifier: m, password: 'Parent-Pass-123' })
        .expect(401);
      await login(app, m, reset.body.temporaryPassword);
    });
  });

  describe('students', () => {
    it('a student signs in with the admission number and sees only themself', async () => {
      const s = await admitStudent(divA, [father()]);
      const sibling = await admitStudent(divA, [father()]);
      const res = await office
        .post(`/api/students/${s.id}/account`)
        .expect(201);
      expect(res.body.loginId).toBe(s.admissionNo);

      for (const id of [s.admissionNo, s.admissionNo.toUpperCase()]) {
        await login(app, id, res.body.temporaryPassword);
      }
      const student = await loginAndSettle(
        app,
        s.admissionNo,
        res.body.temporaryPassword,
        'Student-Pass-123',
      );
      const me = (await student.get('/api/auth/me').expect(200)).body;
      expect(me.roles ?? me.roleCodes).toContain('STUDENT');
      const list = (await student.get('/api/students').expect(200)).body;
      expect(list.items.map((i: { id: string }) => i.id)).toEqual([s.id]);
      await student.get(`/api/students/${s.id}`).expect(200);
      await student.get(`/api/students/${sibling.id}`).expect(404);
      await student
        .patch(`/api/students/${s.id}`)
        .send({ firstName: 'X' })
        .expect(403);
    });

    it('can be created once, resets, and shows on the student', async () => {
      const s = await admitStudent(divA, [father()]);
      expect((await admin.get(`/api/students/${s.id}`)).body.hasLogin).toBe(
        false,
      );
      await office
        .post(`/api/students/${s.id}/account/reset-password`)
        .expect(400);
      await office.post(`/api/students/${s.id}/account`).expect(201);
      await office.post(`/api/students/${s.id}/account`).expect(409);
      expect((await admin.get(`/api/students/${s.id}`)).body.hasLogin).toBe(
        true,
      );
      const reset = await office
        .post(`/api/students/${s.id}/account/reset-password`)
        .expect(200);
      await login(app, s.admissionNo, reset.body.temporaryPassword);
    });

    it('loses the login when the student leaves, and gets it back on return', async () => {
      const s = await admitStudent(divA, [father()]);
      const { body } = await office
        .post(`/api/students/${s.id}/account`)
        .expect(201);
      const student = await loginAndSettle(
        app,
        s.admissionNo,
        body.temporaryPassword,
        'Student-Pass-123',
      );
      await office
        .patch(`/api/students/${s.id}`)
        .send({ status: 'LEFT' })
        .expect(200);
      await student.get('/api/students').expect(401);
      await newAgent(app)
        .post('/api/auth/login')
        .send({ identifier: s.admissionNo, password: 'Student-Pass-123' })
        .expect(401);
      await office
        .post(`/api/students/${s.id}/account/reset-password`)
        .expect(200);

      await office
        .patch(`/api/students/${s.id}`)
        .send({ status: 'ACTIVE' })
        .expect(200);
      const again = await office
        .post(`/api/students/${s.id}/account/reset-password`)
        .expect(200);
      await login(app, s.admissionNo, again.body.temporaryPassword);
    });

    it('does not give a login to a student who has left', async () => {
      const s = await admitStudent(divA, [father()]);
      await office
        .patch(`/api/students/${s.id}`)
        .send({ status: 'LEFT' })
        .expect(200);
      await office.post(`/api/students/${s.id}/account`).expect(400);
    });
  });

  it('only people with portal.accounts.manage can issue logins', async () => {
    const s = await admitStudent(divA, [father()]);
    for (const role of ['TEACHER', 'ACCOUNTANT', 'STAFF']) {
      const who = await createSettledUser(app, admin, role);
      await who.agent.post(`/api/students/${s.id}/account`).expect(403);
      await who.agent
        .post(`/api/guardians/${s.guardianIds[0]}/account`)
        .expect(403);
    }
    await admin.post(`/api/students/${s.id}/account`).expect(201);
  });

  it('records the logins in the audit log', async () => {
    for (const action of [
      'guardians.account_created',
      'students.account_created',
    ]) {
      const res = await admin
        .get(`/api/audit-logs?action=${action}`)
        .expect(200);
      expect(res.body.total).toBeGreaterThan(0);
    }
  });

  describe('teacher search stays inside the scope', () => {
    it('a name search does not reveal students the teacher does not teach', async () => {
      const email = `${unique('t')}@test.local`;
      const staff = (
        await admin
          .post('/api/staff')
          .send({
            firstName: 'Asha',
            surname: unique('Rao'),
            gender: 'FEMALE',
            designation: 'Teacher',
            email,
            account: { roleCodes: ['TEACHER'] },
          })
          .expect(201)
      ).body;
      const teacher = await loginAndSettle(
        app,
        email,
        staff.temporaryPassword,
        'Teacher-Pass-123',
      );
      await admin
        .post('/api/teaching-assignments')
        .send({ staffId: staff.id, divisionId: divA })
        .expect(201);

      const mine = await admitStudent(divA, [father()]);
      const notMine = await admitStudent(divB, [father()], unique('Hidden'));

      const all = (await teacher.get('/api/students').expect(200)).body.items;
      expect(all.map((i: { id: string }) => i.id)).toContain(mine.id);
      expect(all.map((i: { id: string }) => i.id)).not.toContain(notMine.id);

      const searched = (
        await teacher.get(`/api/students?search=${notMine.surname}`).expect(200)
      ).body;
      expect(searched.total).toBe(0);
      const searchedMine = (
        await teacher.get(`/api/students?search=${mine.surname}`).expect(200)
      ).body;
      expect(searchedMine.total).toBe(1);
    });
  });
});
