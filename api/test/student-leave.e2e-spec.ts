import { INestApplication } from '@nestjs/common';
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

/** The first Monday on or after a date. */
const monday = (iso: string) => {
  let d = iso;
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 1) d = addDays(d, 1);
  return d;
};

interface LeaveView {
  id: string;
  student: {
    id: string;
    name: string;
    className: string | null;
    divisionName: string | null;
  };
  fromDate: string;
  toDate: string;
  halfDay: boolean;
  days: number;
  reason: string;
  status: string;
  requestedBy: { name: string | null };
  decidedBy: { name: string | null } | null;
  decidedAt: string | null;
  decisionNote: string | null;
  canWithdraw: boolean;
  canDecide: boolean;
}

describe('student leave (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Agent;
  let schoolAdmin: Agent;
  let office: Agent;
  let accountant: Agent;
  let teacherA: Agent; // class teacher of A
  let teacherSub: Agent; // subject teacher of A, not class teacher
  let teacherB: Agent; // class teacher of B
  let classId: string;
  let divA: string;
  let divB: string;
  let divC: string; // no class teacher

  interface Kid {
    id: string;
    firstName: string;
    admissionNo: string;
    guardianId: string;
    mobile: string;
  }
  let kid1: Kid; // A, has a student login and a parent login
  let kid2: Kid; // A, sibling of kid1 (same parent)
  let kid3: Kid; // B, own parent
  let kid4: Kid; // C, student login, no class teacher
  let student1: Agent;
  let student4: Agent;
  let parent1: Agent; // parent of kid1 and kid2
  let parent3: Agent;

  const today = todayInIndia();
  // Week k starts on the Monday `weeks` weeks after the first Monday at least 3 days away.
  const week = (k: number) => addDays(monday(addDays(today, 3)), 7 * k);

  const staffNotes = async (who: Agent, type: string, contains: string) => {
    const box = (await who.get('/api/notifications?pageSize=100').expect(200))
      .body as {
      items: {
        type: string;
        title: string;
        body: string | null;
        link: string | null;
      }[];
    };
    return box.items.filter(
      (n) => n.type === type && `${n.title} ${n.body ?? ''}`.includes(contains),
    );
  };

  async function admit(
    divisionId: string,
    firstName: string,
    guardianMobile = mobile(),
  ): Promise<Kid> {
    const created = (
      await office
        .post('/api/admissions/applications')
        .send({
          answers: {
            classApplied: classId,
            surname: unique('Khan'),
            firstName,
            gender: 'MALE',
            dateOfBirth: '2018-06-15',
            undertakingReceived: true,
          },
        })
        .expect(201)
    ).body;
    await office
      .post(`/api/admissions/applications/${created.id}/decision`)
      .send({ decision: 'GRANTED' })
      .expect(200);
    const res = await office
      .post(`/api/admissions/applications/${created.id}/admit`)
      .send({
        divisionId,
        guardians: [
          {
            fullName: 'Imran Shaikh',
            relationship: 'FATHER',
            mobile: guardianMobile,
          },
        ],
      })
      .expect(201);
    await prisma.enrollment.updateMany({
      where: { studentId: res.body.studentId },
      data: { startedOn: new Date('2000-01-01T00:00:00Z') },
    });
    const detail = (
      await office.get(`/api/students/${res.body.studentId}`).expect(200)
    ).body;
    return {
      id: res.body.studentId,
      firstName,
      admissionNo: detail.admissionNo,
      guardianId: detail.guardians[0].id,
      mobile: guardianMobile,
    };
  }

  interface Fresh {
    kid: Kid;
    student: Agent;
    parent: Agent;
  }
  /** A new student with their own student login and parent login, so a test never meets another's requests. */
  async function fresh(divisionId: string): Promise<Fresh> {
    const kid = await admit(divisionId, unique('Fresh'));
    const s = await office.post(`/api/students/${kid.id}/account`).expect(201);
    const g = await office
      .post(`/api/guardians/${kid.guardianId}/account`)
      .expect(201);
    return {
      kid,
      student: await loginAndSettle(
        app,
        kid.admissionNo,
        s.body.temporaryPassword,
        'Student-Pass-123',
      ),
      parent: await loginAndSettle(
        app,
        kid.mobile,
        g.body.temporaryPassword,
        'Parent-Pass-123',
      ),
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

  const ask = (who: Agent, body: Record<string, unknown>) =>
    who.post('/api/student-leave').send({ reason: 'Family function', ...body });
  const decide = (who: Agent, id: string, body: Record<string, unknown>) =>
    who.post(`/api/student-leave/${id}/decision`).send(body);
  const list = async (who: Agent, qs = '') =>
    (await who.get(`/api/student-leave?pageSize=100${qs}`).expect(200))
      .body as {
      items: LeaveView[];
      total: number;
      counts: Record<string, number>;
    };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await adminAgent(app);
    schoolAdmin = (await createSettledUser(app, admin, 'SCHOOL_ADMIN')).agent;
    office = (await createSettledUser(app, admin, 'OFFICE_STAFF')).agent;
    accountant = (await createSettledUser(app, admin, 'ACCOUNTANT')).agent;

    // Other suites move the "current" year about; make one that includes today current.
    const years = (await admin.get('/api/academic-years').expect(200)).body as {
      id: string;
      isCurrent: boolean;
      startDate: string;
      endDate: string;
    }[];
    const covering = years.find(
      (y) =>
        y.startDate.slice(0, 10) <= today && y.endDate.slice(0, 10) >= today,
    );
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
    divC = await div('C');
    const subject = (
      await admin
        .post('/api/subjects')
        .send({ name: unique('Maths') })
        .expect(201)
    ).body.id;

    const a = await teacherWithLogin();
    const sub = await teacherWithLogin();
    const b = await teacherWithLogin();
    teacherA = a.agent;
    teacherSub = sub.agent;
    teacherB = b.agent;
    await admin
      .post('/api/teaching-assignments')
      .send({ staffId: a.staffId, divisionId: divA })
      .expect(201);
    await admin
      .post('/api/teaching-assignments')
      .send({ staffId: sub.staffId, divisionId: divA, subjectId: subject })
      .expect(201);
    await admin
      .post('/api/teaching-assignments')
      .send({ staffId: b.staffId, divisionId: divB })
      .expect(201);

    const sharedMobile = mobile();
    kid1 = await admit(divA, unique('Zaid'), sharedMobile);
    kid2 = await admit(divA, unique('Zara'), sharedMobile);
    kid3 = await admit(divB, unique('Zoya'));
    kid4 = await admit(divC, unique('Zain'));

    const studentLogin = async (k: Kid) => {
      const res = await office
        .post(`/api/students/${k.id}/account`)
        .expect(201);
      return loginAndSettle(
        app,
        k.admissionNo,
        res.body.temporaryPassword,
        'Student-Pass-123',
      );
    };
    student1 = await studentLogin(kid1);
    student4 = await studentLogin(kid4);
    const parentLogin = async (k: Kid) => {
      const res = await office
        .post(`/api/guardians/${k.guardianId}/account`)
        .expect(201);
      return loginAndSettle(
        app,
        k.mobile,
        res.body.temporaryPassword,
        'Parent-Pass-123',
      );
    };
    parent1 = await parentLogin(kid1);
    parent3 = await parentLogin(kid3);
  });
  afterAll(() => app.close());

  describe('asking', () => {
    it('lets a student ask for themself and shows the counted days', async () => {
      const m = week(0);
      const res = await ask(student1, {
        fromDate: m,
        toDate: addDays(m, 2),
        reason: 'Fever',
      }).expect(201);
      const v = res.body as LeaveView;
      expect(v).toMatchObject({
        student: {
          id: kid1.id,
          name: expect.stringContaining(kid1.firstName),
          divisionName: 'A',
        },
        fromDate: m,
        toDate: addDays(m, 2),
        halfDay: false,
        days: 3,
        reason: 'Fever',
        status: 'PENDING',
        decidedBy: null,
        decidedAt: null,
        canWithdraw: true,
        canDecide: false,
      });
      expect(v.requestedBy.name).toBeTruthy();
    });

    it('refuses a student asking for another student, and a stranger family', async () => {
      await ask(student1, { studentId: kid2.id, fromDate: week(1) }).expect(
        404,
      );
      await ask(student1, { studentId: kid4.id, fromDate: week(1) }).expect(
        404,
      );
      await ask(parent3, { studentId: kid1.id, fromDate: week(1) }).expect(404);
    });

    it('needs a studentId when the parent has two children, and accepts either', async () => {
      await ask(parent1, { fromDate: week(1) }).expect(400);
      const res = await ask(parent1, {
        studentId: kid2.id,
        fromDate: week(1),
      }).expect(201);
      expect((res.body as LeaveView).student.id).toBe(kid2.id);
      // The student login with a single child needs no studentId; a parent with one child neither.
      await ask(parent3, { fromDate: week(1) }).expect(201);
    });

    it('refuses staff roles: only family logins ask', async () => {
      for (const who of [teacherA, office, accountant]) {
        await ask(who, { studentId: kid1.id, fromDate: week(1) }).expect(403);
      }
      // The admins hold every permission but are nobody's family, so the student is not found.
      for (const who of [schoolAdmin, admin]) {
        await ask(who, { studentId: kid1.id, fromDate: week(1) }).expect(404);
      }
    });

    it('refuses an overlap with a waiting or approved request, but not with a withdrawn one', async () => {
      const m = week(2);
      const first = (
        await ask(student1, { fromDate: m, toDate: addDays(m, 2) }).expect(201)
      ).body as LeaveView;
      // The same days, and days that share only the last day.
      await ask(student1, { fromDate: m, toDate: addDays(m, 2) }).expect(409);
      await ask(student1, {
        fromDate: addDays(m, 2),
        toDate: addDays(m, 3),
      }).expect(409);
      // The previous days are free.
      await ask(student1, {
        fromDate: addDays(m, -2),
        toDate: addDays(m, -2),
      }).expect(201);
      await student1
        .post(`/api/student-leave/${first.id}/withdraw`)
        .expect(200);
      await ask(student1, { fromDate: m, toDate: addDays(m, 2) }).expect(201);
    });

    it('refuses the past, too far ahead, backwards ranges, multi-day half days and bad reasons', async () => {
      const m = week(3);
      await ask(student1, { fromDate: addDays(today, -1) }).expect(400);
      await ask(student1, { fromDate: addDays(today, 61) }).expect(400);
      await ask(student1, { fromDate: addDays(m, 2), toDate: m }).expect(400);
      await ask(student1, {
        fromDate: m,
        toDate: addDays(m, 1),
        halfDay: true,
      }).expect(400);
      await ask(student1, { fromDate: m, reason: '' }).expect(400);
      await ask(student1, { fromDate: m, reason: '   ' }).expect(400);
      await ask(student1, { fromDate: m, reason: 'x'.repeat(501) }).expect(400);
      await ask(student1, { fromDate: '2026-02-30' }).expect(400);
    });

    it('counts a half day as 0.5', async () => {
      const res = await ask(student4, {
        fromDate: week(4),
        halfDay: true,
      }).expect(201);
      expect(res.body).toMatchObject({ halfDay: true, days: 0.5 });
    });

    it('does not count Sundays or holidays, and refuses a request that counts nothing', async () => {
      const m = week(5);
      const sunday = addDays(m, 6);
      // A Sunday alone counts nothing.
      await ask(student4, { fromDate: sunday }).expect(400);
      // A holiday for everyone on the Tuesday.
      await admin
        .post('/api/calendar')
        .send({
          title: unique('Founders day'),
          category: 'HOLIDAY',
          startsOn: addDays(m, 1),
          audience: 'ALL',
        })
        .expect(201);
      const preview = (
        await student4
          .get(`/api/student-leave/preview?fromDate=${m}&toDate=${sunday}`)
          .expect(200)
      ).body;
      // Monday to Sunday: Tuesday is a holiday and Sunday is skipped, leaving 5 days.
      expect(preview).toMatchObject({
        studentId: kid4.id,
        days: 5,
        problem: null,
        skipped: [
          { date: addDays(m, 1), reason: 'HOLIDAY' },
          { date: sunday, reason: 'SUNDAY' },
        ],
      });
      expect(preview.countedDates).toHaveLength(5);
      const created = await ask(student4, {
        fromDate: m,
        toDate: sunday,
      }).expect(201);
      expect(created.body.days).toBe(5);
      // Only the holiday: nothing to report.
      await ask(student4, { fromDate: addDays(m, 1) }).expect(400);
      // The preview says so as a sentence rather than an error.
      const empty = (
        await student4
          .get(`/api/student-leave/preview?fromDate=${addDays(m, 1)}`)
          .expect(200)
      ).body;
      expect(empty).toMatchObject({ days: 0, countedDates: [] });
      expect(empty.problem).toMatch(/Sundays or school holidays/);
    });

    it('a holiday for one division closes only that division, and a staff-only holiday closes nobody', async () => {
      const m = week(6);
      const wed = addDays(m, 2);
      await admin
        .post('/api/calendar')
        .send({
          title: unique('Division trip'),
          category: 'HOLIDAY',
          startsOn: wed,
          audience: 'DIVISIONS',
          divisionIds: [divB],
        })
        .expect(201);
      await admin
        .post('/api/calendar')
        .send({
          title: unique('Staff day'),
          category: 'HOLIDAY',
          startsOn: addDays(m, 3),
          audience: 'STAFF',
        })
        .expect(201);
      // Division B (kid3): Monday to Thursday is 4 days, Wednesday off: 3.
      const forB = await ask(parent3, {
        fromDate: m,
        toDate: addDays(m, 3),
      }).expect(201);
      expect(forB.body.days).toBe(3);
      // Division A (kid1): nothing is closed, so 4 days.
      const forA = await ask(student1, {
        fromDate: m,
        toDate: addDays(m, 3),
      }).expect(201);
      expect(forA.body.days).toBe(4);
    });

    it('previews an overlap as a problem', async () => {
      const m = week(3);
      await ask(student4, { fromDate: m }).expect(201);
      const p = (
        await student4
          .get(`/api/student-leave/preview?fromDate=${m}`)
          .expect(200)
      ).body;
      expect(p.problem).toMatch(/already a request/);
    });

    it('records the request in the audit log', async () => {
      const count = await prisma.auditLog.count({
        where: { action: 'student_leave.requested' },
      });
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('deciding', () => {
    let fa: Fresh;
    let fc: Fresh;
    beforeEach(async () => {
      fa = await fresh(divA);
      fc = await fresh(divC);
    });

    it('lets the class teacher approve, and not another teacher of the division', async () => {
      const m = week(1);
      const r = (await ask(fa.student, { fromDate: m }).expect(201))
        .body as LeaveView;

      // The subject teacher and the other class's teacher cannot even see it.
      for (const who of [teacherSub, teacherB]) {
        await who.get(`/api/student-leave/${r.id}`).expect(404);
        await decide(who, r.id, { approve: true }).expect(404);
        expect((await list(who)).items.map((i) => i.id)).not.toContain(r.id);
      }
      // Office staff can look but not decide; the family and the accountant cannot decide.
      await office.get(`/api/student-leave/${r.id}`).expect(200);
      await decide(office, r.id, { approve: true }).expect(403);
      await decide(fa.student, r.id, { approve: true }).expect(403);
      await decide(accountant, r.id, { approve: true }).expect(403);

      const seen = (
        await teacherA.get(`/api/student-leave/${r.id}`).expect(200)
      ).body as LeaveView;
      expect(seen.canDecide).toBe(true);
      const res = await decide(teacherA, r.id, {
        approve: true,
        note: 'Get well soon',
      }).expect(200);
      expect(res.body).toMatchObject({
        status: 'APPROVED',
        decisionNote: 'Get well soon',
        canDecide: false,
      });
      expect(res.body.decidedBy.name).toBeTruthy();
      expect(res.body.decidedAt).toBeTruthy();
      // Deciding twice is refused.
      await decide(teacherA, r.id, { approve: false, note: 'No' }).expect(409);
    });

    it('lets an administrator decide for a student who has no class teacher', async () => {
      const m = week(1);
      const r = (await ask(fc.student, { fromDate: m }).expect(201))
        .body as LeaveView;
      for (const who of [teacherA, teacherB])
        await decide(who, r.id, { approve: true }).expect(404);
      const res = await decide(schoolAdmin, r.id, { approve: true }).expect(
        200,
      );
      expect(res.body.status).toBe('APPROVED');
      // The Super Admin can decide a request in a class that has a teacher too.
      const r2 = (
        await ask(fa.student, { fromDate: addDays(m, 1) }).expect(201)
      ).body as LeaveView;
      await decide(admin, r2.id, { approve: false, note: 'Exam day' }).expect(
        200,
      );
    });

    it('needs a note to refuse', async () => {
      const r = (await ask(fa.student, { fromDate: week(1) }).expect(201))
        .body as LeaveView;
      await decide(teacherA, r.id, { approve: false }).expect(400);
      await decide(teacherA, r.id, { approve: false, note: '   ' }).expect(400);
      const res = await decide(teacherA, r.id, {
        approve: false,
        note: 'Test that day',
      }).expect(200);
      expect(res.body).toMatchObject({
        status: 'REFUSED',
        decisionNote: 'Test that day',
      });
    });

    it('audits the decision', async () => {
      expect(
        await prisma.auditLog.count({
          where: { action: 'student_leave.decided' },
        }),
      ).toBeGreaterThan(0);
    });
  });

  describe('withdrawing', () => {
    let fa: Fresh;
    beforeEach(async () => {
      fa = await fresh(divA);
    });

    it('lets the family withdraw a waiting request, once', async () => {
      const r = (
        await ask(fa.parent, {
          studentId: fa.kid.id,
          fromDate: week(1),
        }).expect(201)
      ).body as LeaveView;
      // Another family, a teacher and the office cannot.
      await parent3.post(`/api/student-leave/${r.id}/withdraw`).expect(404);
      await teacherA.post(`/api/student-leave/${r.id}/withdraw`).expect(403);
      await office.post(`/api/student-leave/${r.id}/withdraw`).expect(403);
      // Either family login of the child may.
      const res = await fa.student
        .post(`/api/student-leave/${r.id}/withdraw`)
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'WITHDRAWN',
        canWithdraw: false,
      });
      await fa.student.post(`/api/student-leave/${r.id}/withdraw`).expect(409);
      // A withdrawn request cannot be decided.
      await decide(teacherA, r.id, { approve: true }).expect(409);
    });

    it('lets the family withdraw approved leave that has not started, not leave that has', async () => {
      const r = (await ask(fa.student, { fromDate: week(1) }).expect(201))
        .body as LeaveView;
      await decide(teacherA, r.id, { approve: true }).expect(200);
      const res = await fa.student
        .post(`/api/student-leave/${r.id}/withdraw`)
        .expect(200);
      expect(res.body.status).toBe('WITHDRAWN');

      const started = (await ask(fa.student, { fromDate: week(1) }).expect(201))
        .body as LeaveView;
      await decide(teacherA, started.id, { approve: true }).expect(200);
      // Pretend the leave began yesterday.
      await prisma.studentLeaveRequest.update({
        where: { id: started.id },
        data: { fromDate: new Date(`${addDays(today, -1)}T00:00:00Z`) },
      });
      const now = (
        await fa.student.get(`/api/student-leave/${started.id}`).expect(200)
      ).body as LeaveView;
      expect(now.canWithdraw).toBe(false);
      await fa.student
        .post(`/api/student-leave/${started.id}/withdraw`)
        .expect(409);
    });

    it('cannot withdraw a refused request', async () => {
      const r = (await ask(fa.student, { fromDate: week(1) }).expect(201))
        .body as LeaveView;
      await decide(teacherA, r.id, { approve: false, note: 'No' }).expect(200);
      await fa.student.post(`/api/student-leave/${r.id}/withdraw`).expect(409);
    });

    it('audits the withdrawal', async () => {
      expect(
        await prisma.auditLog.count({
          where: { action: 'student_leave.withdrawn' },
        }),
      ).toBeGreaterThan(0);
    });
  });

  describe('reading', () => {
    it('shows each person only their own scope', async () => {
      const mine = await list(parent1);
      expect(mine.items.length).toBeGreaterThan(0);
      expect(
        mine.items.every((i) => [kid1.id, kid2.id].includes(i.student.id)),
      ).toBe(true);
      expect(
        (await list(parent3)).items.every((i) => i.student.id === kid3.id),
      ).toBe(true);
      expect(
        (await list(student1)).items.every((i) => i.student.id === kid1.id),
      ).toBe(true);

      const a = await list(teacherA);
      expect(a.items.length).toBeGreaterThan(0);
      expect(a.items.every((i) => i.student.divisionName === 'A')).toBe(true);
      expect(
        (await list(teacherB)).items.every(
          (i) => i.student.divisionName === 'B',
        ),
      ).toBe(true);
      expect((await list(teacherSub)).total).toBe(0);

      const all = await list(office);
      const ids = new Set(all.items.map((i) => i.student.id));
      expect(
        [kid1.id, kid2.id, kid3.id, kid4.id].every((k) => ids.has(k)),
      ).toBe(true);
      expect((await list(schoolAdmin)).total).toBe(all.total);
      // The accountant has no access at all.
      await accountant.get('/api/student-leave').expect(403);
    });

    it('filters and counts by status', async () => {
      const everything = await list(office);
      expect(Object.keys(everything.counts).sort()).toEqual([
        'APPROVED',
        'PENDING',
        'REFUSED',
        'WITHDRAWN',
      ]);
      const pending = await list(office, '&status=PENDING');
      expect(pending.items.every((i) => i.status === 'PENDING')).toBe(true);
      expect(pending.total).toBe(everything.counts.PENDING);
      // Counts ignore the status filter.
      expect(pending.counts).toEqual(everything.counts);
      const byDivision = await list(office, `&divisionId=${divB}`);
      expect(byDivision.items.length).toBeGreaterThan(0);
      expect(byDivision.items.every((i) => i.student.id === kid3.id)).toBe(
        true,
      );
      const byStudent = await list(office, `&studentId=${kid4.id}`);
      expect(byStudent.items.every((i) => i.student.id === kid4.id)).toBe(true);
      const m = week(0);
      const byDates = await list(
        office,
        `&studentId=${kid1.id}&from=${m}&to=${m}`,
      );
      expect(byDates.items.map((i) => i.fromDate)).toContain(m);
      await office.get('/api/student-leave?status=SOON').expect(400);
    });

    it('treats a request seen by nobody as not found', async () => {
      const r = (await list(parent3)).items[0];
      await student1.get(`/api/student-leave/${r.id}`).expect(404);
      await teacherA.get(`/api/student-leave/${r.id}`).expect(404);
      await office
        .get(`/api/student-leave/00000000-0000-4000-8000-000000000000`)
        .expect(404);
    });
  });

  describe('notifications', () => {
    let fa: Fresh;
    let fc: Fresh;
    beforeEach(async () => {
      fa = await fresh(divA);
      fc = await fresh(divC);
    });

    it('tells the class teacher of a new request', async () => {
      const r = (await ask(fa.student, { fromDate: week(1) }).expect(201))
        .body as LeaveView;
      const notes = await staffNotes(
        teacherA,
        'student_leave.requested',
        fa.kid.firstName,
      );
      expect(notes.length).toBeGreaterThan(0);
      expect(notes[0].title).toBe(`Leave request for ${fa.kid.firstName}`);
      expect(notes[0].link).toBe('/app/student-leave');
      // Not the subject teacher, and not the other class's teacher.
      expect(
        await staffNotes(
          teacherSub,
          'student_leave.requested',
          fa.kid.firstName,
        ),
      ).toHaveLength(0);
      expect(
        await staffNotes(teacherB, 'student_leave.requested', fa.kid.firstName),
      ).toHaveLength(0);

      // The decision reaches the student's own login and the parent.
      await decide(teacherA, r.id, { approve: true }).expect(200);
      for (const who of [fa.student, fa.parent]) {
        const got = await staffNotes(
          who,
          'student_leave.approved',
          fa.kid.firstName,
        );
        expect(got.length).toBeGreaterThan(0);
        expect(got[0].title).toBe('Leave approved');
      }
      expect(
        await staffNotes(parent3, 'student_leave.approved', fa.kid.firstName),
      ).toHaveLength(0);

      // Withdrawing approved leave tells the class teacher.
      await fa.student.post(`/api/student-leave/${r.id}/withdraw`).expect(200);
      expect(
        (
          await staffNotes(
            teacherA,
            'student_leave.withdrawn',
            fa.kid.firstName,
          )
        ).length,
      ).toBeGreaterThan(0);
    });

    it('tells the administrators when the class has no class teacher, and says a refusal generically', async () => {
      const r = (await ask(fc.student, { fromDate: week(1) }).expect(201))
        .body as LeaveView;
      for (const who of [admin, schoolAdmin]) {
        expect(
          (await staffNotes(who, 'student_leave.requested', fc.kid.firstName))
            .length,
        ).toBeGreaterThan(0);
      }
      // The class teacher of another class is not told.
      expect(
        await staffNotes(teacherA, 'student_leave.requested', fc.kid.firstName),
      ).toHaveLength(0);
      await decide(admin, r.id, { approve: false, note: 'Exam' }).expect(200);
      const got = await staffNotes(
        fc.student,
        'student_leave.refused',
        fc.kid.firstName,
      );
      expect(got[0].title).toBe('Leave not approved');
      expect(got[0].link).toBe('/portal/absence');
    });
  });

  describe('attendance roster', () => {
    // A recent Monday that is already over, so a teacher may still mark it.
    const past = (() => {
      let d = addDays(today, -1);
      while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 1) d = addDays(d, -1);
      return d;
    })();
    let kid5: Kid;

    beforeAll(async () => {
      kid5 = await admit(divA, unique('Zubin'));
      const school = await prisma.student.findFirstOrThrow({
        where: { id: kid1.id },
        select: { schoolId: true },
      });
      const year = await prisma.academicYear.findFirstOrThrow({
        where: { schoolId: school.schoolId, isCurrent: true },
        select: { id: true },
      });
      const user = await prisma.user.findFirstOrThrow({
        where: { schoolId: school.schoolId },
        select: { id: true },
      });
      const base = {
        schoolId: school.schoolId,
        academicYearId: year.id,
        requestedByUserId: user.id,
      };
      const row = (studentId: string, over: Record<string, unknown> = {}) =>
        prisma.studentLeaveRequest.create({
          data: {
            ...base,
            studentId,
            fromDate: new Date(`${past}T00:00:00Z`),
            toDate: new Date(`${past}T00:00:00Z`),
            reason: 'Wedding',
            days: 1,
            status: 'APPROVED',
            ...over,
          },
        });
      // kid1: approved, unmarked. kid2: approved, but the teacher marks them present. kid5: only waiting.
      await row(kid1.id, { halfDay: true, days: 0.5 });
      await row(kid2.id);
      await row(kid5.id, { status: 'PENDING' });
    });

    it('suggests leave for approved, unmarked students, and writes nothing', async () => {
      const res = await teacherA
        .get(`/api/attendance/divisions/${divA}?date=${past}`)
        .expect(200);
      const by = (id: string) =>
        res.body.students.find(
          (s: { studentId: string }) => s.studentId === id,
        );
      expect(by(kid1.id)).toMatchObject({
        status: null,
        suggestedStatus: 'ON_LEAVE',
        approvedLeave: { requestId: expect.any(String), halfDay: true },
      });
      expect(by(kid2.id)).toMatchObject({
        suggestedStatus: 'ON_LEAVE',
        approvedLeave: { halfDay: false },
      });
      // A request that is only waiting, and a student with no leave, suggest nothing.
      expect(by(kid5.id)).toMatchObject({
        status: null,
        suggestedStatus: null,
        approvedLeave: null,
      });
      expect(res.body.marked).toBe(false);
      expect(
        await prisma.attendanceRecord.count({
          where: { studentId: kid1.id, date: new Date(`${past}T00:00:00Z`) },
        }),
      ).toBe(0);
    });

    it("lets an existing mark win, and the teacher's save be the record", async () => {
      await teacherA
        .put(`/api/attendance/divisions/${divA}`)
        .send({
          date: past,
          entries: [{ studentId: kid2.id, status: 'PRESENT' }],
        })
        .expect(200);
      const res = await teacherA
        .get(`/api/attendance/divisions/${divA}?date=${past}`)
        .expect(200);
      const by = (id: string) =>
        res.body.students.find(
          (s: { studentId: string }) => s.studentId === id,
        );
      // The mark wins: no suggestion, though the approved leave is still shown.
      expect(by(kid2.id)).toMatchObject({
        status: 'PRESENT',
        suggestedStatus: null,
        approvedLeave: { requestId: expect.any(String) },
      });
      expect(by(kid1.id).suggestedStatus).toBe('ON_LEAVE');
      // Saving the suggestion is what makes it a record.
      await teacherA
        .put(`/api/attendance/divisions/${divA}`)
        .send({
          date: past,
          entries: [{ studentId: kid1.id, status: 'ON_LEAVE' }],
        })
        .expect(200);
      const after = await teacherA
        .get(`/api/attendance/divisions/${divA}?date=${past}`)
        .expect(200);
      expect(
        after.body.students.find(
          (s: { studentId: string }) => s.studentId === kid1.id,
        ),
      ).toMatchObject({ status: 'ON_LEAVE', suggestedStatus: null });
    });

    it('does not suggest leave on days the leave does not cover', async () => {
      const res = await teacherA
        .get(`/api/attendance/divisions/${divA}?date=${addDays(past, -7)}`)
        .expect(200);
      expect(
        res.body.students.every(
          (s: { suggestedStatus: unknown }) => s.suggestedStatus === null,
        ),
      ).toBe(true);
    });
  });
});
