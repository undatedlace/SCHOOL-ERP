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

describe('attendance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Agent;
  let office: Agent;
  let classId: string;
  let divA: string;
  let divB: string;
  let teacherA: Agent; // class teacher of A
  let teacherB: Agent; // subject teacher of B only
  let stranger: Agent; // a teacher with no classes
  let parent: Agent;
  let s1: string;
  let s2: string;
  let s3: string;
  const today = todayInIndia();

  async function enrol(divisionId: string, surname: string) {
    const created = (
      await office
        .post('/api/admissions/applications')
        .send({
          answers: {
            classApplied: classId,
            surname,
            firstName: 'Ayaan',
            gender: 'MALE',
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
    const m = mobile();
    const res = await office
      .post(`/api/admissions/applications/${created.id}/admit`)
      .send({
        divisionId,
        guardians: [
          { fullName: 'Imran Shaikh', relationship: 'FATHER', mobile: m },
        ],
      })
      .expect(201);
    // Let the pupil have been in the class long before today, so older days can be marked.
    await prisma.enrollment.updateMany({
      where: { studentId: res.body.studentId },
      data: { startedOn: new Date('2000-01-01T00:00:00Z') },
    });
    const detail = (
      await office.get(`/api/students/${res.body.studentId}`).expect(200)
    ).body;
    return {
      id: res.body.studentId as string,
      guardianId: detail.guardians[0].id as string,
      mobile: m,
    };
  }

  async function teacherWithLogin() {
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
    const agent = await loginAndSettle(
      app,
      email,
      created.temporaryPassword,
      'Teacher-Pass-123',
    );
    return { staffId: created.id as string, agent };
  }

  const put = (
    who: Agent,
    divisionId: string,
    date: string,
    entries: { studentId: string; status: string; note?: string }[],
  ) =>
    who.put(`/api/attendance/divisions/${divisionId}`).send({ date, entries });

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await adminAgent(app);
    office = (await createSettledUser(app, admin, 'OFFICE_STAFF')).agent;

    const years = (await admin.get('/api/academic-years').expect(200)).body as {
      id: string;
      isCurrent: boolean;
      startDate: string;
      endDate: string;
    }[];
    const covers = (y: { startDate: string; endDate: string }) =>
      y.startDate.slice(0, 10) <= today && y.endDate.slice(0, 10) >= today;
    // Other suites move the "current" year about; make one that includes today current.
    const covering = years.find(covers);
    if (covering) {
      if (!covering.isCurrent) {
        await admin
          .post(`/api/academic-years/${covering.id}/set-current`)
          .expect(200);
      }
    } else {
      const [y, m] = today.split('-').map(Number);
      const start = m >= 4 ? y : y - 1;
      await admin
        .post('/api/academic-years')
        .send({
          name: unique('AY'),
          startDate: `${start}-04-01`,
          endDate: `${start + 1}-03-31`,
          isCurrent: true,
        })
        .expect(201);
    }
    classId = (
      await admin
        .post('/api/classes')
        .send({ name: unique('Std') })
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
    const subject = (
      await admin
        .post('/api/subjects')
        .send({ name: unique('Maths') })
        .expect(201)
    ).body.id;

    const a = await teacherWithLogin();
    const b = await teacherWithLogin();
    teacherA = a.agent;
    teacherB = b.agent;
    stranger = (await teacherWithLogin()).agent;
    await admin
      .post('/api/teaching-assignments')
      .send({ staffId: a.staffId, divisionId: divA })
      .expect(201);
    await admin
      .post('/api/teaching-assignments')
      .send({ staffId: b.staffId, divisionId: divB, subjectId: subject })
      .expect(201);

    const one = await enrol(divA, unique('Khan'));
    const two = await enrol(divA, unique('Khan'));
    const three = await enrol(divB, unique('Khan'));
    s1 = one.id;
    s2 = two.id;
    s3 = three.id;
    const login = await office
      .post(`/api/guardians/${one.guardianId}/account`)
      .expect(201);
    parent = await loginAndSettle(
      app,
      one.mobile,
      login.body.temporaryPassword,
      'Parent-Pass-123',
    );
  });
  afterAll(() => app.close());

  describe('taking attendance', () => {
    it('shows a class teacher their division with everyone unmarked', async () => {
      const res = await teacherA
        .get(`/api/attendance/divisions/${divA}`)
        .expect(200);
      expect(res.body).toMatchObject({
        date: today,
        marked: false,
        canMark: true,
        division: { id: divA },
      });
      expect(
        res.body.students.map((s: { studentId: string }) => s.studentId).sort(),
      ).toEqual([s1, s2].sort());
      expect(
        res.body.students.every((s: { status: unknown }) => s.status === null),
      ).toBe(true);
    });

    it('saves the day and reads it back, with who marked it', async () => {
      const res = await put(teacherA, divA, today, [
        { studentId: s1, status: 'PRESENT' },
        { studentId: s2, status: 'ABSENT', note: 'Fever' },
      ]).expect(200);
      expect(res.body.marked).toBe(true);
      expect(res.body.markedBy).toBeTruthy();
      expect(res.body.counts).toMatchObject({ present: 1, absent: 1 });
      const absent = res.body.students.find(
        (s: { studentId: string }) => s.studentId === s2,
      );
      expect(absent).toMatchObject({ status: 'ABSENT', note: 'Fever' });
    });

    it('lets the same day be corrected: one record per student per day', async () => {
      await put(teacherA, divA, today, [
        { studentId: s2, status: 'LATE' },
      ]).expect(200);
      const res = await teacherA
        .get(`/api/attendance/divisions/${divA}?date=${today}`)
        .expect(200);
      expect(
        res.body.students.find(
          (s: { studentId: string }) => s.studentId === s2,
        ),
      ).toMatchObject({ status: 'LATE', note: null });
      expect(
        await prisma.attendanceRecord.count({
          where: { studentId: s2, date: new Date(`${today}T00:00:00Z`) },
        }),
      ).toBe(1);
    });

    it('refuses the future, impossible dates, strangers, duplicates and bad statuses', async () => {
      await put(teacherA, divA, addDays(today, 1), [
        { studentId: s1, status: 'PRESENT' },
      ]).expect(400);
      await put(teacherA, divA, '2026-02-30', [
        { studentId: s1, status: 'PRESENT' },
      ]).expect(400);
      // s3 belongs to division B.
      const wrong = await put(teacherA, divA, today, [
        { studentId: s3, status: 'PRESENT' },
      ]).expect(400);
      expect(wrong.body.message).toMatch(/not in this division/);
      await put(teacherA, divA, today, [
        { studentId: s1, status: 'PRESENT' },
        { studentId: s1, status: 'ABSENT' },
      ]).expect(400);
      await put(teacherA, divA, today, [
        { studentId: s1, status: 'HOLIDAY' },
      ]).expect(400);
      await put(teacherA, divA, today, []).expect(400);
      await put(teacherA, divA, '1999-01-01', [
        { studentId: s1, status: 'PRESENT' },
      ]).expect(400); // outside every academic year
    });

    it('keeps teachers to the last seven days; the admin can go further back', async () => {
      const week = addDays(today, -7);
      const older = addDays(today, -8);
      await put(teacherA, divA, week, [
        { studentId: s1, status: 'PRESENT' },
      ]).expect(200);
      const refused = await put(teacherA, divA, older, [
        { studentId: s1, status: 'PRESENT' },
      ]).expect(403);
      expect(refused.body.message).toMatch(/school admin/);
      const view = await teacherA
        .get(`/api/attendance/divisions/${divA}?date=${older}`)
        .expect(200);
      expect(view.body.canMark).toBe(false);
      await put(admin, divA, older, [
        { studentId: s1, status: 'ABSENT' },
      ]).expect(200);
    });
  });

  describe('who may do what', () => {
    it('a teacher works only on divisions they teach, and others look like they do not exist', async () => {
      await teacherA.get(`/api/attendance/divisions/${divB}`).expect(404);
      await put(teacherA, divB, today, [
        { studentId: s3, status: 'PRESENT' },
      ]).expect(404);
      await stranger.get(`/api/attendance/divisions/${divA}`).expect(404);
      await put(stranger, divA, today, [
        { studentId: s1, status: 'PRESENT' },
      ]).expect(404);
      await teacherA
        .get(`/api/attendance/divisions/${randomUUID()}`)
        .expect(404);
    });

    it('a subject teacher may take attendance for the division they teach', async () => {
      await put(teacherB, divB, today, [
        { studentId: s3, status: 'PRESENT' },
      ]).expect(200);
    });

    it('lists only the divisions a person can work on', async () => {
      const mineA = (
        await teacherA.get('/api/attendance/divisions').expect(200)
      ).body;
      expect(mineA.map((d: { id: string }) => d.id)).toEqual([divA]);
      expect(mineA[0].canMark).toBe(true);
      expect(
        (await stranger.get('/api/attendance/divisions').expect(200)).body,
      ).toEqual([]);
      expect(
        (await parent.get('/api/attendance/divisions').expect(200)).body,
      ).toEqual([]);
      const all = (await office.get('/api/attendance/divisions').expect(200))
        .body;
      const ids = all.map((d: { id: string }) => d.id);
      expect(ids).toEqual(expect.arrayContaining([divA, divB]));
      expect(all.every((d: { canMark: boolean }) => d.canMark === false)).toBe(
        true,
      );
    });

    it('office staff can read every division but not change anything; the admin can do both', async () => {
      await office.get(`/api/attendance/divisions/${divA}`).expect(200);
      await put(office, divA, today, [
        { studentId: s1, status: 'PRESENT' },
      ]).expect(403);
      await put(admin, divA, today, [
        { studentId: s1, status: 'PRESENT' },
      ]).expect(200);
      await put(admin, divB, today, [
        { studentId: s3, status: 'PRESENT' },
      ]).expect(200);
    });

    it('parents cannot see a division roster or mark anything, and need to be signed in', async () => {
      await parent.get(`/api/attendance/divisions/${divA}`).expect(404);
      await put(parent, divA, today, [
        { studentId: s1, status: 'PRESENT' },
      ]).expect(403);
    });
  });

  describe('a student’s history', () => {
    it('shows days and totals; present and late count as attended', async () => {
      // s1 so far: PRESENT today, PRESENT 7 days ago, ABSENT 8 days ago.
      const res = await admin
        .get(
          `/api/attendance/students/${s1}?from=${addDays(today, -10)}&to=${today}`,
        )
        .expect(200);
      expect(res.body.records.map((r: { date: string }) => r.date)).toEqual([
        today,
        addDays(today, -7),
        addDays(today, -8),
      ]);
      expect(res.body.summary).toMatchObject({
        present: 2,
        absent: 1,
        markedDays: 3,
        percent: 66.7,
      });
    });

    it('leaves approved leave out of the percentage', async () => {
      const day = addDays(today, -1);
      await put(admin, divA, day, [
        { studentId: s1, status: 'ON_LEAVE' },
        { studentId: s2, status: 'PRESENT' },
      ]).expect(200);
      const res = await admin
        .get(`/api/attendance/students/${s1}?from=${day}&to=${today}`)
        .expect(200);
      expect(res.body.summary).toMatchObject({
        onLeave: 1,
        present: 1,
        countedDays: 1,
        markedDays: 2,
        percent: 100,
      });
    });

    it('a parent sees their own child only', async () => {
      const mine = await parent
        .get(`/api/attendance/students/${s1}`)
        .expect(200);
      expect(mine.body.records.length).toBeGreaterThan(0);
      await parent.get(`/api/attendance/students/${s2}`).expect(404);
      await parent.get(`/api/attendance/students/${randomUUID()}`).expect(404);
    });

    it('a teacher sees students of their own divisions only', async () => {
      await teacherA.get(`/api/attendance/students/${s1}`).expect(200);
      await teacherA.get(`/api/attendance/students/${s3}`).expect(404);
    });

    it('checks the range', async () => {
      await admin
        .get(
          `/api/attendance/students/${s1}?from=${today}&to=${addDays(today, -3)}`,
        )
        .expect(400);
      await admin
        .get(`/api/attendance/students/${s1}?from=nonsense`)
        .expect(400);
      await admin
        .get(
          `/api/attendance/students/${s1}?from=${addDays(today, -400)}&to=${today}`,
        )
        .expect(400);
    });
  });

  describe('reports', () => {
    it('totals each student of a division over a range', async () => {
      const res = await teacherA
        .get(
          `/api/attendance/divisions/${divA}/report?from=${addDays(today, -10)}&to=${today}`,
        )
        .expect(200);
      const row = (id: string) =>
        res.body.students.find(
          (s: { studentId: string }) => s.studentId === id,
        );
      expect(res.body.daysMarked).toBeGreaterThanOrEqual(3);
      expect(row(s1)).toMatchObject({ present: 2, absent: 1, onLeave: 1 });
      expect(row(s2)).toMatchObject({ late: 1, present: 1 });
      await teacherA
        .get(`/api/attendance/divisions/${divB}/report`)
        .expect(404);
    });

    it('says which divisions have been marked today', async () => {
      const res = await admin.get('/api/attendance/overview').expect(200);
      const a = res.body.divisions.find((d: { id: string }) => d.id === divA);
      expect(a).toMatchObject({ enrolled: 2, marked: 2, done: true });
      const mine = await stranger.get('/api/attendance/overview').expect(200);
      expect(mine.body.divisions).toEqual([]);
    });

    it('an unmarked division shows as not done', async () => {
      const day = addDays(today, -3);
      const res = await admin
        .get(`/api/attendance/overview?date=${day}`)
        .expect(200);
      const b = res.body.divisions.find((d: { id: string }) => d.id === divB);
      expect(b).toMatchObject({ enrolled: 1, marked: 0, done: false });
    });
  });

  describe('students who leave', () => {
    it('drop out of the roster from the day they leave', async () => {
      const gone = await enrol(divA, unique('Leaver'));
      const before = await teacherA
        .get(`/api/attendance/divisions/${divA}`)
        .expect(200);
      expect(
        before.body.students.some(
          (s: { studentId: string }) => s.studentId === gone.id,
        ),
      ).toBe(true);
      await office
        .patch(`/api/students/${gone.id}`)
        .send({ status: 'LEFT', leftOn: addDays(today, -2) })
        .expect(200);
      const after = await teacherA
        .get(`/api/attendance/divisions/${divA}`)
        .expect(200);
      expect(
        after.body.students.some(
          (s: { studentId: string }) => s.studentId === gone.id,
        ),
      ).toBe(false);
      // They are still on the roster for a day before they left, so history stays whole.
      const earlier = await teacherA
        .get(`/api/attendance/divisions/${divA}?date=${addDays(today, -3)}`)
        .expect(200);
      expect(
        earlier.body.students.some(
          (s: { studentId: string }) => s.studentId === gone.id,
        ),
      ).toBe(true);
    });
  });
});
