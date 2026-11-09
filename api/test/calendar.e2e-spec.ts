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

describe('calendar (e2e)', () => {
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

  const day = (n: number) => addDays(today, n);
  const event = (who: Agent, over: Record<string, unknown> = {}) =>
    who.post('/api/calendar').send({
      title: unique('Event'),
      startsOn: day(10),
      audience: 'ALL',
      ...over,
    });
  const range = async (who: Agent, from = day(0), to = day(60)) =>
    (await who.get(`/api/calendar?from=${from}&to=${to}`).expect(200)).body as {
      id: string;
      title: string;
      announced: boolean;
      canChange: boolean;
      startsOn: string;
      endsOn: string;
    }[];
  const sees = async (who: Agent, id: string) =>
    (await range(who)).some((e) => e.id === id);

  describe('who sees what', () => {
    it('an event for everyone reaches every role', async () => {
      const id = (await event(office).expect(201)).body.id;
      for (const who of [
        admin,
        office,
        accountant,
        staffRole,
        teacherNone,
        parent1,
        parent2,
        student1,
      ]) {
        expect(await sees(who, id)).toBe(true);
      }
    });

    it('a staff event is not shown to parents or students', async () => {
      const id = (await event(office, { audience: 'STAFF' }).expect(201)).body
        .id;
      for (const who of [admin, accountant, staffRole, teacherNone]) {
        expect(await sees(who, id)).toBe(true);
      }
      for (const who of [parent1, parent2, student1]) {
        expect(await sees(who, id)).toBe(false);
      }
    });

    it('a class event reaches only that class (parents, students, its teacher)', async () => {
      const id = (
        await event(office, { audience: 'CLASSES', classIds: [classA] }).expect(
          201,
        )
      ).body.id;
      expect(await sees(parent1, id)).toBe(true);
      expect(await sees(student1, id)).toBe(true);
      expect(await sees(teacherA, id)).toBe(true);
      expect(await sees(parent2, id)).toBe(false);
      expect(await sees(teacherNone, id)).toBe(false);
      expect(await sees(staffRole, id)).toBe(false);
    });

    it('a division event reaches only that division', async () => {
      const id = (
        await event(office, {
          audience: 'DIVISIONS',
          divisionIds: [divB1],
        }).expect(201)
      ).body.id;
      expect(await sees(parent2, id)).toBe(true);
      expect(await sees(parent1, id)).toBe(false);
      expect(await sees(admin, id)).toBe(true);
    });
  });

  describe('the range', () => {
    it('returns events that overlap the days asked for, and no others', async () => {
      const id = (
        await event(office, { startsOn: day(20), endsOn: day(23) }).expect(201)
      ).body.id;
      expect(
        (await range(parent1, day(22), day(30))).some((e) => e.id === id),
      ).toBe(true);
      expect(
        (await range(parent1, day(23), day(23))).some((e) => e.id === id),
      ).toBe(true);
      expect(
        (await range(parent1, day(24), day(30))).some((e) => e.id === id),
      ).toBe(false);
      expect(
        (await range(parent1, day(10), day(19))).some((e) => e.id === id),
      ).toBe(false);
    });

    it('refuses a bad or very long range', async () => {
      await parent1
        .get('/api/calendar?from=2026-02-30&to=2026-03-01')
        .expect(400);
      await parent1
        .get(`/api/calendar?from=${day(5)}&to=${day(1)}`)
        .expect(400);
      await parent1
        .get(`/api/calendar?from=${day(0)}&to=${day(500)}`)
        .expect(400);
      await parent1.get('/api/calendar').expect(400);
    });
  });

  describe('writing', () => {
    it('only admin and office may add, change or remove events', async () => {
      for (const who of [
        accountant,
        staffRole,
        teacherNone,
        parent1,
        student1,
      ]) {
        await event(who).expect(403);
      }
      const id = (await event(office).expect(201)).body.id;
      for (const who of [accountant, teacherNone, parent1]) {
        await who.patch(`/api/calendar/${id}`).send({ title: 'x' }).expect(403);
        await who.delete(`/api/calendar/${id}`).expect(403);
      }
      const e = (await range(parent1)).find((x) => x.id === id);
      expect(e?.canChange).toBe(false);
      expect((await range(office)).find((x) => x.id === id)?.canChange).toBe(
        true,
      );
    });

    it('checks dates, times and audiences', async () => {
      await event(office, { endsOn: day(5) }).expect(400);
      await event(office, { startsOn: '2026-02-30' }).expect(400);
      await event(office, { startTime: '25:00' }).expect(400);
      await event(office, { startTime: '11:00', endTime: '09:00' }).expect(400);
      await event(office, { endTime: '09:00' }).expect(400);
      await event(office, { audience: 'CLASSES' }).expect(400);
      await event(office, { audience: 'ALL', classIds: [classA] }).expect(400);
      await event(office, {
        audience: 'DIVISIONS',
        divisionIds: [randomUUID()],
      }).expect(400);
    });

    it('changes an event, and moving a one-day event keeps it one day', async () => {
      const id = (await event(office, { startsOn: day(12) }).expect(201)).body
        .id;
      const res = await office
        .patch(`/api/calendar/${id}`)
        .send({
          title: 'Annual Day',
          startsOn: day(15),
          startTime: '10:00',
          category: 'EVENT',
        })
        .expect(200);
      expect(res.body).toMatchObject({
        title: 'Annual Day',
        startsOn: day(15),
        endsOn: day(15),
        startTime: '10:00',
      });
    });

    it('changing the audience starts the targets afresh', async () => {
      const id = (
        await event(office, { audience: 'CLASSES', classIds: [classA] }).expect(
          201,
        )
      ).body.id;
      await office
        .patch(`/api/calendar/${id}`)
        .send({ audience: 'ALL' })
        .expect(200);
      expect(await sees(parent2, id)).toBe(true);
      await office
        .patch(`/api/calendar/${id}`)
        .send({ audience: 'CLASSES', classIds: [classB] })
        .expect(200);
      expect(await sees(parent2, id)).toBe(true);
      expect(await sees(parent1, id)).toBe(false);
    });

    it('removing an event hides it, keeps the row and is audited', async () => {
      const id = (await event(office).expect(201)).body.id;
      await office.delete(`/api/calendar/${id}`).expect(204);
      expect(await sees(parent1, id)).toBe(false);
      expect(await sees(office, id)).toBe(false);
      await office.delete(`/api/calendar/${id}`).expect(404);
      const row = await prisma.calendarEvent.findUnique({ where: { id } });
      expect(row?.archivedAt).not.toBeNull();
      const log = await prisma.auditLog.findFirst({
        where: { entityId: id, action: 'calendar.event_archived' },
      });
      expect(log).not.toBeNull();
    });

    it('an event shown as plain text is stored as written', async () => {
      const id = (
        await event(office, {
          description: '<script>alert(1)</script>',
        }).expect(201)
      ).body.id;
      const e = (await range(parent1)).find((x) => x.id === id) as unknown as {
        description: string;
      };
      expect(e.description).toBe('<script>alert(1)</script>');
    });
  });

  describe('telling people (announce)', () => {
    it('posts a notice to the same audience, which parents can then see', async () => {
      const res = await event(office, {
        title: unique('Annual Day'),
        audience: 'CLASSES',
        classIds: [classA],
        startsOn: day(30),
        startTime: '10:00',
        description: 'Parents are welcome.',
        announce: true,
      }).expect(201);
      expect(res.body.announced).toBe(true);
      const row = await prisma.calendarEvent.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      const notice = await prisma.notice.findUniqueOrThrow({
        where: { id: row.noticeId! },
      });
      expect(notice.title).toContain(res.body.title);
      expect(notice.body).toContain('Parents are welcome.');
      expect(notice.audience).toBe('CLASSES');
      expect((await parent1.get(`/api/notices/${notice.id}`)).status).toBe(200);
      expect((await parent2.get(`/api/notices/${notice.id}`)).status).toBe(404);
    });

    it('is off unless asked, and not allowed for an event already over', async () => {
      const quiet = (await event(office).expect(201)).body;
      expect(quiet.announced).toBe(false);
      await event(office, { startsOn: day(-5), announce: true }).expect(400);
      await event(office, { startsOn: day(-5) }).expect(201);
    });
  });
});
