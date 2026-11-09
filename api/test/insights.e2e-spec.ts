import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service.js';
import { todayInIndia } from '../src/modules/attendance/attendance-rules.js';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
  loginAndSettle,
  unique,
} from './helpers.js';

const mobile = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('dashboard insights (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Agent;
  let office: Agent;
  let accountant: Agent;
  let teacher: Agent;
  let otherTeacher: Agent;
  let parent: Agent;
  let schoolId: string;
  let adminUserId: string;
  let futureYear: string;
  let currentYear: string;
  let classId: string;
  let divisionId: string;
  const today = todayInIndia();
  // A year later than every year in the shared test database, so it is always the newest.
  let Y = 2090;

  async function admit(cls: string, division: string, m = mobile()) {
    const created = (
      await office
        .post('/api/admissions/applications')
        .send({
          answers: {
            classApplied: cls,
            surname: unique('Insight'),
            firstName: 'Noor',
            gender: 'FEMALE',
            dateOfBirth: '2021-06-15',
            undertakingReceived: true,
          },
        })
        .expect(201)
    ).body.id;
    await office
      .post(`/api/admissions/applications/${created}/decision`)
      .send({ decision: 'GRANTED' })
      .expect(200);
    const res = await office
      .post(`/api/admissions/applications/${created}/admit`)
      .send({
        divisionId: division,
        guardians: [
          {
            fullName: 'Imran Shaikh',
            relationship: 'FATHER',
            mobile: m,
            isPrimary: true,
          },
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
    schoolId = (
      await prisma.school.findFirstOrThrow({ orderBy: { createdAt: 'asc' } })
    ).id;
    adminUserId = (
      await prisma.user.findFirstOrThrow({
        where: { schoolId, email: 'admin@test.local' },
      })
    ).id;

    // A current academic year that includes today (other suites move "current" about).
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
      currentYear = covering.id;
    } else {
      const [y, m] = today.split('-').map(Number);
      const start = m >= 4 ? y : y - 1;
      currentYear = (
        await admin
          .post('/api/academic-years')
          .send({
            name: unique('AY'),
            startDate: `${start}-04-01`,
            endDate: `${start + 1}-03-31`,
            isCurrent: true,
          })
          .expect(201)
      ).body.id;
    }
    const latest = await prisma.academicYear.aggregate({
      where: { schoolId },
      _max: { startDate: true },
    });
    Y = Math.max(Y, (latest._max.startDate?.getUTCFullYear() ?? 0) + 1);
    // The newest year by far, so it is always among the "last years" and holds only this test's data.
    futureYear = (
      await prisma.academicYear.create({
        data: {
          schoolId,
          name: unique('FUT'),
          startDate: day(`${Y}-04-01`),
          endDate: day(`${Y + 1}-03-31`),
        },
      })
    ).id;

    classId = (
      await admin
        .post('/api/classes')
        .send({ name: unique('Std') })
        .expect(201)
    ).body.id;
    divisionId = (
      await admin
        .post(`/api/classes/${classId}/divisions`)
        .send({ name: 'A' })
        .expect(201)
    ).body.id;

    const t = await teacherLogin();
    teacher = t.agent;
    otherTeacher = (await teacherLogin()).agent;
    await admin
      .post('/api/teaching-assignments')
      .send({ staffId: t.staffId, divisionId })
      .expect(201);
  });
  afterAll(() => app.close());

  describe('admissions', () => {
    let formId: string;
    beforeAll(async () => {
      formId = (
        await prisma.formDefinition.findFirstOrThrow({ where: { schoolId } })
      ).id;
      let n = 0;
      const apps = (status: string, count: number) =>
        Array.from({ length: count }, () => ({
          schoolId,
          academicYearId: futureYear,
          formId,
          seq: ++n,
          formNo: `F${n}`,
          status: status as 'RECEIVED',
          receivedOn: day(`${Y}-05-01`),
          studentName: 'Test Child',
          answers: {},
          createdById: adminUserId,
        }));
      await prisma.application.createMany({
        data: [
          ...apps('RECEIVED', 3),
          ...apps('UNDER_REVIEW', 1),
          ...apps('GRANTED', 2),
          ...apps('REFUSED', 1),
          ...apps('WITHDRAWN', 1),
        ],
      });
      // Two students enrolled that year.
      for (let i = 0; i < 2; i++) {
        const s = await admit(classId, divisionId);
        await prisma.enrollment.updateMany({
          where: { studentId: s.studentId },
          data: { academicYearId: futureYear },
        });
      }
    });

    it('counts applications by outcome, and students enrolled, for each year', async () => {
      const res = (await office.get('/api/insights/admissions').expect(200))
        .body;
      const row = res.years.find((y: { id: string }) => y.id === futureYear);
      expect(row).toMatchObject({
        applications: 8,
        received: 4,
        granted: 2,
        refused: 1,
        withdrawn: 1,
        admitted: 0,
        enrolled: 2,
      });
      // Oldest first, at most five years, the newest year last.
      expect(res.years.length).toBeLessThanOrEqual(5);
      expect(res.years[res.years.length - 1].id).toBe(futureYear);
    });

    it('is for the admin and office, not the accountant or teachers', async () => {
      await admin.get('/api/insights/admissions').expect(200);
      await accountant.get('/api/insights/admissions').expect(403);
      await teacher.get('/api/insights/admissions').expect(403);
    });
  });

  describe('staff', () => {
    it('counts those who joined and left in a year', async () => {
      const make = async (joinedOn: string) =>
        (
          await admin
            .post('/api/staff')
            .send({
              firstName: 'Zoya',
              surname: unique('Joiner'),
              gender: 'FEMALE',
              designation: 'Clerk',
              joinedOn,
            })
            .expect(201)
        ).body.id as string;
      const [a, b] = [
        await make(`${Y}-05-01`),
        await make(`${Y}-06-15`),
        await make(`${Y}-07-01`),
      ];
      await admin
        .patch(`/api/staff/${a}`)
        .send({ status: 'LEFT', leftOn: `${Y}-09-01` })
        .expect(200);
      await admin
        .patch(`/api/staff/${b}`)
        .send({ status: 'LEFT', leftOn: `${Y + 1}-01-10` })
        .expect(200);

      const res = (await admin.get('/api/insights/staff').expect(200)).body;
      const row = res.years.find((y: { id: string }) => y.id === futureYear);
      expect(row.joined).toBe(3);
      expect(row.left).toBe(2);
      // At the end of that year one of them had left, and everyone who joined earlier is counted.
      expect(row.atYearEnd).toBeGreaterThanOrEqual(2);
      expect(res.currentlyWorking).toBeGreaterThan(0);
    });

    it('is for the admin only', async () => {
      await office.get('/api/insights/staff').expect(403);
      await accountant.get('/api/insights/staff').expect(403);
      await teacher.get('/api/insights/staff').expect(403);
    });
  });

  describe('fees', () => {
    let otherClass: string;

    beforeAll(async () => {
      const tuition = (
        await accountant
          .post('/api/fee-heads')
          .send({ name: unique('Tuition') })
          .expect(201)
      ).body.id;
      otherClass = (
        await admin
          .post('/api/classes')
          .send({ name: unique('Fees') })
          .expect(201)
      ).body.id;
      const otherDivision = (
        await admin
          .post(`/api/classes/${otherClass}/divisions`)
          .send({ name: 'A' })
          .expect(201)
      ).body.id;
      await accountant
        .put('/api/fee-structures')
        .send({
          academicYearId: currentYear,
          classId: otherClass,
          items: [{ feeHeadId: tuition, amount: '10000' }],
          instalments: [{ label: 'Full', dueDate: '2099-01-10', percent: 100 }],
        })
        .expect(200);
      const one = await admit(otherClass, otherDivision);
      const two = await admit(otherClass, otherDivision);
      await accountant
        .post('/api/fee-invoices/generate')
        .send({ studentIds: [one.studentId, two.studentId] })
        .expect(200);
      await accountant
        .post(`/api/students/${one.studentId}/payments`)
        .send({ mode: 'CASH', amount: '2500' })
        .expect(201);
      const wrong = (
        await accountant
          .post(`/api/students/${one.studentId}/payments`)
          .send({ mode: 'CASH', amount: '1000' })
          .expect(201)
      ).body;
      await admin
        .post(`/api/payments/${wrong.id}/reverse`)
        .send({ reason: 'entered twice' })
        .expect(200);
    });

    it('shows billed, collected and pending for a class, leaving reversed payments out', async () => {
      const res = (
        await accountant
          .get(`/api/insights/fees?academicYearId=${currentYear}`)
          .expect(200)
      ).body;
      const cls = (await admin.get(`/api/classes`).expect(200)).body.find(
        (c: { id: string }) => c.id === otherClass,
      );
      const row = res.byClass.find(
        (c: { label: string }) => c.label === cls.name,
      );
      expect(row).toMatchObject({
        billed: '20000.00',
        collected: '2500.00',
        pending: '17500.00',
      });
      expect(res.academicYear.id).toBe(currentYear);
    });

    it('shows money received month by month, for every month of the year', async () => {
      const res = (await accountant.get('/api/insights/fees').expect(200)).body;
      expect(res.collectedByMonth).toHaveLength(12);
      const month = today.slice(0, 7);
      const thisMonth = res.collectedByMonth.find(
        (m: { month: string }) => m.month === month,
      );
      expect(Number(thisMonth.total)).toBeGreaterThanOrEqual(2500);
      expect(thisMonth.total).toMatch(/^\d+\.\d{2}$/);
    });

    it('is for the admin and accountant only', async () => {
      await admin.get('/api/insights/fees').expect(200);
      await office.get('/api/insights/fees').expect(403);
      await teacher.get('/api/insights/fees').expect(403);
    });
  });

  describe('attendance', () => {
    beforeAll(async () => {
      const one = await admit(classId, divisionId);
      const two = await admit(classId, divisionId);
      parent = await loginAndSettle(
        app,
        one.mobile,
        (
          await office
            .post(`/api/guardians/${one.guardianId}/account`)
            .expect(201)
        ).body.temporaryPassword,
        'Parent-Pass-123',
      );
      await teacher
        .put(`/api/attendance/divisions/${divisionId}`)
        .send({
          date: today,
          entries: [
            { studentId: one.studentId, status: 'PRESENT' },
            { studentId: two.studentId, status: 'ABSENT' },
          ],
        })
        .expect(200);
    });

    it('shows a teacher the trend and coverage of their own divisions only', async () => {
      const res = (await teacher.get('/api/insights/attendance').expect(200))
        .body;
      expect(res.today).toEqual({ divisions: 1, marked: 1 });
      const last = res.trend[res.trend.length - 1];
      expect(last).toMatchObject({
        date: today,
        present: 1,
        absent: 1,
        percent: 50,
      });
      expect(res.divisions).toHaveLength(1);
      expect(res.divisions[0]).toMatchObject({ percent: 50 });
    });

    it('shows the office every division', async () => {
      const res = (
        await office.get('/api/insights/attendance?days=7').expect(200)
      ).body;
      expect(res.days).toBe(7);
      expect(res.today.divisions).toBeGreaterThanOrEqual(1);
      expect(res.today.marked).toBeGreaterThanOrEqual(1);
      expect(res.divisions.length).toBeGreaterThanOrEqual(1);
      // Lowest first.
      const percents = res.divisions.map((d: { percent: number }) => d.percent);
      expect([...percents].sort((a, b) => a - b)).toEqual(percents);
    });

    it('shows nothing to a teacher with no classes, or to a parent', async () => {
      for (const who of [otherTeacher, parent]) {
        const res = (await who.get('/api/insights/attendance').expect(200))
          .body;
        expect(res).toMatchObject({
          today: { divisions: 0, marked: 0 },
          trend: [],
          divisions: [],
        });
      }
    });

    it('checks the number of days', async () => {
      await teacher.get('/api/insights/attendance?days=3').expect(400);
      await teacher.get('/api/insights/attendance?days=91').expect(400);
      await teacher.get('/api/insights/attendance?days=abc').expect(400);
    });
  });
});
