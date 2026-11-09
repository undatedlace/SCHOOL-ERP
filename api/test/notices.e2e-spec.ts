import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/database/prisma.service.js';
import {
  addDays,
  todayInIndia,
} from '../src/modules/attendance/attendance-rules.js';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
  loginAndSettle,
  unique,
} from './helpers.js';

const mobile = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;

describe('notices (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Agent;
  let office: Agent;
  let accountant: Agent;
  let staffRole: Agent;
  let teacherA: Agent; // class teacher of A1
  let teacherNone: Agent;
  let parent1: Agent; // child in A1
  let parent2: Agent; // child in B1
  let student1: Agent; // the child in A1, signed in as themself
  let classA: string;
  let classB: string;
  let divA1: string;
  let divB1: string;
  const today = todayInIndia();

  async function admitInto(classId: string, divisionId: string) {
    const app1 = (
      await office
        .post('/api/admissions/applications')
        .send({
          answers: {
            classApplied: classId,
            surname: unique('Khan'),
            firstName: 'Noor',
            gender: 'FEMALE',
            dateOfBirth: '2021-06-15',
            undertakingReceived: true,
          },
        })
        .expect(201)
    ).body;
    await office
      .post(`/api/admissions/applications/${app1.id}/decision`)
      .send({ decision: 'GRANTED' })
      .expect(200);
    const m = mobile();
    const res = await office
      .post(`/api/admissions/applications/${app1.id}/admit`)
      .send({
        divisionId,
        guardians: [
          { fullName: 'Imran Shaikh', relationship: 'FATHER', mobile: m },
        ],
      })
      .expect(201);
    const detail = (
      await office.get(`/api/students/${res.body.studentId}`).expect(200)
    ).body;
    return {
      studentId: res.body.studentId as string,
      guardianId: detail.guardians[0].id as string,
      mobile: m,
    };
  }

  async function parentLogin(s: { guardianId: string; mobile: string }) {
    const r = await office
      .post(`/api/guardians/${s.guardianId}/account`)
      .expect(201);
    return loginAndSettle(
      app,
      s.mobile,
      r.body.temporaryPassword,
      'Parent-Pass-123',
    );
  }

  async function teacherLogin() {
    const email = `${unique('t')}@test.local`;
    const created = (
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
    return {
      staffId: created.id as string,
      agent: await loginAndSettle(
        app,
        email,
        created.temporaryPassword,
        'Teacher-Pass-123',
      ),
    };
  }

  const notice = (who: Agent, over: Record<string, unknown> = {}) =>
    who.post('/api/notices').send({
      title: 'Holiday',
      body: 'School is closed on Friday.',
      audience: 'ALL',
      ...over,
    });
  const sees = async (who: Agent, id: string) =>
    (await who.get(`/api/notices/${id}`)).status === 200;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await adminAgent(app);
    office = (await createSettledUser(app, admin, 'OFFICE_STAFF')).agent;
    accountant = (await createSettledUser(app, admin, 'ACCOUNTANT')).agent;
    staffRole = (await createSettledUser(app, admin, 'STAFF')).agent;

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
    const cls = async () =>
      (
        await admin
          .post('/api/classes')
          .send({ name: unique('Std') })
          .expect(201)
      ).body.id as string;
    classA = await cls();
    classB = await cls();
    const div = async (classId: string, name: string) =>
      (
        await admin
          .post(`/api/classes/${classId}/divisions`)
          .send({ name })
          .expect(201)
      ).body.id as string;
    divA1 = await div(classA, 'A');
    divB1 = await div(classB, 'A');

    const t = await teacherLogin();
    teacherA = t.agent;
    teacherNone = (await teacherLogin()).agent;
    await admin
      .post('/api/teaching-assignments')
      .send({ staffId: t.staffId, divisionId: divA1 })
      .expect(201);

    const c1 = await admitInto(classA, divA1);
    const c2 = await admitInto(classB, divB1);
    parent1 = await parentLogin(c1);
    parent2 = await parentLogin(c2);
    const sl = await office
      .post(`/api/students/${c1.studentId}/account`)
      .expect(201);
    student1 = await loginAndSettle(
      app,
      sl.body.loginId,
      sl.body.temporaryPassword,
      'Student-Pass-123',
    );
  });
  afterAll(() => app.close());

  describe('who sees what', () => {
    it('a notice to everyone reaches staff, teachers, parents and students', async () => {
      const id = (await notice(office).expect(201)).body.id;
      for (const who of [
        admin,
        office,
        accountant,
        staffRole,
        teacherA,
        teacherNone,
        parent1,
        parent2,
        student1,
      ]) {
        expect(await sees(who, id)).toBe(true);
      }
    });

    it('a staff notice is not shown to parents or students', async () => {
      const id = (await notice(office, { audience: 'STAFF' }).expect(201)).body
        .id;
      for (const who of [admin, accountant, staffRole, teacherA, teacherNone]) {
        expect(await sees(who, id)).toBe(true);
      }
      for (const who of [parent1, parent2, student1]) {
        expect(await sees(who, id)).toBe(false);
      }
    });

    it('a class notice reaches that class’s parents, students and teachers only', async () => {
      const id = (
        await notice(office, {
          audience: 'CLASSES',
          classIds: [classA],
        }).expect(201)
      ).body.id;
      for (const who of [
        parent1,
        student1,
        teacherA,
        office,
        accountant,
        admin,
      ]) {
        expect(await sees(who, id)).toBe(true);
      }
      for (const who of [parent2, teacherNone, staffRole]) {
        expect(await sees(who, id)).toBe(false);
      }
    });

    it('a division notice reaches that division only', async () => {
      const id = (
        await notice(office, {
          audience: 'DIVISIONS',
          divisionIds: [divB1],
        }).expect(201)
      ).body.id;
      expect(await sees(parent2, id)).toBe(true);
      for (const who of [parent1, student1, teacherA, teacherNone, staffRole]) {
        expect(await sees(who, id)).toBe(false);
      }
    });

    it('the list holds only what the person may see', async () => {
      const title = unique('Only-B');
      const id = (
        await notice(office, {
          title,
          audience: 'DIVISIONS',
          divisionIds: [divB1],
        }).expect(201)
      ).body.id;
      const titles = async (who: Agent) =>
        (
          (await who.get('/api/notices?pageSize=100').expect(200)).body
            .items as { title: string }[]
        ).map((n) => n.title);
      expect(await titles(parent2)).toContain(title);
      expect(await titles(parent1)).not.toContain(title);
      expect(id).toBeDefined();
    });

    it('lists newest first and pages', async () => {
      const first = (
        await notice(office, { title: unique('First') }).expect(201)
      ).body;
      const second = (
        await notice(office, { title: unique('Second') }).expect(201)
      ).body;
      const page = (
        await parent1.get('/api/notices?page=1&pageSize=2').expect(200)
      ).body;
      expect(page.items.map((n: { id: string }) => n.id)).toEqual([
        second.id,
        first.id,
      ]);
      expect(page.total).toBeGreaterThanOrEqual(2);
      const next = (
        await parent1.get('/api/notices?page=2&pageSize=2').expect(200)
      ).body;
      expect(next.items.every((n: { id: string }) => n.id !== second.id)).toBe(
        true,
      );
    });

    it('shows text as written and keeps the author', async () => {
      const body = '<script>alert(1)</script>\nLine two';
      const res = (await notice(office, { body }).expect(201)).body;
      expect(res.body).toBe(body);
      expect(res.createdBy.fullName).toBeTruthy();
      expect(res.canChange).toBe(true);
      const seen = (await parent1.get(`/api/notices/${res.id}`).expect(200))
        .body;
      expect(seen.canChange).toBe(false);
    });
  });

  describe('who may write', () => {
    it('parents, students and other staff cannot create notices', async () => {
      await notice(parent1).expect(403);
      await notice(student1).expect(403);
      await notice(staffRole).expect(403);
    });

    it('office and accountant may write to anyone', async () => {
      await notice(accountant, { audience: 'STAFF' }).expect(201);
      await notice(accountant, {
        audience: 'CLASSES',
        classIds: [classB],
      }).expect(201);
    });

    it('a teacher may write only to the divisions they teach', async () => {
      await notice(teacherA, {
        audience: 'DIVISIONS',
        divisionIds: [divA1],
      }).expect(201);
      await notice(teacherA, {
        audience: 'DIVISIONS',
        divisionIds: [divB1],
      }).expect(403);
      await notice(teacherA, {
        audience: 'DIVISIONS',
        divisionIds: [divA1, divB1],
      }).expect(403);
      await notice(teacherA, { audience: 'ALL' }).expect(403);
      await notice(teacherA, { audience: 'STAFF' }).expect(403);
      await notice(teacherA, {
        audience: 'CLASSES',
        classIds: [classA],
      }).expect(403);
      await notice(teacherNone, {
        audience: 'DIVISIONS',
        divisionIds: [divA1],
      }).expect(403);
    });

    it('says who each person may write to', async () => {
      const wide = (await office.get('/api/notices/audiences').expect(200))
        .body;
      expect(wide.canAddressAnyone).toBe(true);
      expect(wide.classes.map((c: { id: string }) => c.id)).toEqual(
        expect.arrayContaining([classA, classB]),
      );
      const mine = (await teacherA.get('/api/notices/audiences').expect(200))
        .body;
      expect(mine).toMatchObject({ canAddressAnyone: false, classes: [] });
      expect(mine.divisions.map((d: { id: string }) => d.id)).toEqual([divA1]);
      await parent1.get('/api/notices/audiences').expect(403);
    });

    it('a teacher’s notice reaches that division’s parents', async () => {
      const id = (
        await notice(teacherA, {
          audience: 'DIVISIONS',
          divisionIds: [divA1],
        }).expect(201)
      ).body.id;
      expect(await sees(parent1, id)).toBe(true);
      expect(await sees(parent2, id)).toBe(false);
      expect(await sees(teacherA, id)).toBe(true);
    });
  });

  describe('checking the notice', () => {
    it('refuses an audience that does not match the classes or divisions sent', async () => {
      await notice(office, { audience: 'ALL', classIds: [classA] }).expect(400);
      await notice(office, { audience: 'STAFF', divisionIds: [divA1] }).expect(
        400,
      );
      await notice(office, { audience: 'CLASSES' }).expect(400);
      await notice(office, { audience: 'CLASSES', classIds: [] }).expect(400);
      await notice(office, {
        audience: 'CLASSES',
        divisionIds: [divA1],
        classIds: [classA],
      }).expect(400);
      await notice(office, {
        audience: 'DIVISIONS',
        classIds: [classA],
      }).expect(400);
      await notice(office, { audience: 'DIVISIONS' }).expect(400);
      await notice(office, {
        audience: 'CLASSES',
        classIds: [randomUUID()],
      }).expect(400);
      await notice(office, {
        audience: 'DIVISIONS',
        divisionIds: [randomUUID()],
      }).expect(400);
      await notice(office, { audience: 'EVERYONE' }).expect(400);
    });

    it('refuses an empty or oversize title or text, and a bad or past last day', async () => {
      await notice(office, { title: '   ' }).expect(400);
      await notice(office, { title: 'x'.repeat(151) }).expect(400);
      await notice(office, { body: '' }).expect(400);
      await notice(office, { body: 'x'.repeat(5001) }).expect(400);
      await notice(office, { expiresOn: addDays(today, -1) }).expect(400);
      await notice(office, { expiresOn: '2026-02-30' }).expect(400);
      await notice(office, { expiresOn: 'soon' }).expect(400);
      await notice(office, { expiresOn: today }).expect(201);
    });
  });

  describe('expiry', () => {
    it('hides a notice after its last day, except from the people who may change it', async () => {
      const id = (
        await notice(office, { expiresOn: addDays(today, 3) }).expect(201)
      ).body.id;
      expect(await sees(parent1, id)).toBe(true);
      await prisma.notice.update({
        where: { id },
        data: { expiresOn: new Date(`${addDays(today, -1)}T00:00:00Z`) },
      });
      expect(await sees(parent1, id)).toBe(false);
      expect(await sees(accountant, id)).toBe(false); // can read all, but not change it
      expect(await sees(office, id)).toBe(true); // the author
      expect(await sees(admin, id)).toBe(true); // the admin
      const active = (await office.get('/api/notices?pageSize=100').expect(200))
        .body.items;
      expect(active.some((n: { id: string }) => n.id === id)).toBe(false);
      const expired = (
        await office.get('/api/notices?status=expired&pageSize=100').expect(200)
      ).body.items;
      expect(expired.find((n: { id: string }) => n.id === id)).toMatchObject({
        expired: true,
      });
    });

    it('lists expired and all only from what the person may change', async () => {
      const mine = (
        await notice(teacherA, {
          audience: 'DIVISIONS',
          divisionIds: [divA1],
        }).expect(201)
      ).body;
      const all = (
        await teacherA.get('/api/notices?status=all&pageSize=100').expect(200)
      ).body.items;
      expect(all.every((n: { canChange: boolean }) => n.canChange)).toBe(true);
      expect(all.some((n: { id: string }) => n.id === mine.id)).toBe(true);
      const parentAll = (
        await parent1.get('/api/notices?status=all').expect(200)
      ).body;
      expect(parentAll.items).toEqual([]); // a parent changes nothing
      await parent1.get('/api/notices?status=weird').expect(400);
    });
  });

  describe('changing and removing', () => {
    it('the author edits their notice, including who it goes to', async () => {
      const id = (
        await notice(office, {
          audience: 'DIVISIONS',
          divisionIds: [divA1],
        }).expect(201)
      ).body.id;
      const res = await office
        .patch(`/api/notices/${id}`)
        .send({ title: 'Changed', divisionIds: [divB1] })
        .expect(200);
      expect(res.body.title).toBe('Changed');
      expect(res.body.divisions.map((d: { id: string }) => d.id)).toEqual([
        divB1,
      ]);
      expect(await sees(parent1, id)).toBe(false);
      expect(await sees(parent2, id)).toBe(true);
    });

    it('moving a notice to another audience replaces its targets', async () => {
      const id = (
        await notice(office, {
          audience: 'CLASSES',
          classIds: [classA],
        }).expect(201)
      ).body.id;
      const res = await office
        .patch(`/api/notices/${id}`)
        .send({ audience: 'ALL', classIds: [] })
        .expect(200);
      expect(res.body.audience).toBe('ALL');
      expect(res.body.classes).toEqual([]);
      expect(await sees(parent2, id)).toBe(true);
    });

    it('someone else cannot change it, but the admin can; one who cannot see it gets "not found"', async () => {
      const id = (
        await notice(office, {
          audience: 'DIVISIONS',
          divisionIds: [divA1],
        }).expect(201)
      ).body.id;
      await accountant
        .patch(`/api/notices/${id}`)
        .send({ title: 'Mine now' })
        .expect(403);
      await accountant.delete(`/api/notices/${id}`).expect(403);
      await parent2.patch(`/api/notices/${id}`).expect(403); // no permission at all
      await teacherNone
        .patch(`/api/notices/${id}`)
        .send({ title: 'x' })
        .expect(404);
      await admin
        .patch(`/api/notices/${id}`)
        .send({ title: 'Admin fix' })
        .expect(200);
    });

    it('a teacher cannot widen their notice beyond their divisions', async () => {
      const id = (
        await notice(teacherA, {
          audience: 'DIVISIONS',
          divisionIds: [divA1],
        }).expect(201)
      ).body.id;
      await teacherA
        .patch(`/api/notices/${id}`)
        .send({ audience: 'ALL' })
        .expect(403);
      await teacherA
        .patch(`/api/notices/${id}`)
        .send({ divisionIds: [divB1] })
        .expect(403);
    });

    it('removing takes it down for everyone but keeps the record', async () => {
      const id = (await notice(office).expect(201)).body.id;
      await office.delete(`/api/notices/${id}`).expect(204);
      for (const who of [office, admin, parent1, teacherA]) {
        expect(await sees(who, id)).toBe(false);
      }
      await office
        .patch(`/api/notices/${id}`)
        .send({ title: 'again' })
        .expect(404);
      await office.delete(`/api/notices/${id}`).expect(404);
      const row = await prisma.notice.findUnique({ where: { id } });
      expect(row?.archivedAt).not.toBeNull();
    });

    it('is written to the audit log', async () => {
      const id = (await notice(office).expect(201)).body.id;
      await office.delete(`/api/notices/${id}`).expect(204);
      const actions = (
        await prisma.auditLog.findMany({ where: { entityId: id } })
      ).map((a) => a.action);
      expect(actions).toEqual(
        expect.arrayContaining(['notice.created', 'notice.archived']),
      );
    });
  });

  describe('a child who leaves or moves', () => {
    it('stops seeing the class notices of a class they are no longer in', async () => {
      const c = await admitInto(classA, divA1);
      const p = await parentLogin(c);
      const id = (
        await notice(office, {
          audience: 'CLASSES',
          classIds: [classA],
        }).expect(201)
      ).body.id;
      expect(await sees(p, id)).toBe(true);
      await prisma.student.update({
        where: { id: c.studentId },
        data: { status: 'LEFT', leftOn: new Date(`${today}T00:00:00Z`) },
      });
      expect(await sees(p, id)).toBe(false);
    });
  });
});
