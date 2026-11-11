import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { addDays } from '../src/modules/attendance/attendance-rules.js';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
  loginAndSettle,
  newAgent,
  unique,
} from './helpers.js';

const monday = (iso: string) => {
  let d = iso;
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 1) d = addDays(d, 1);
  return d;
};
const mobile = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;

describe('notifications (e2e)', () => {
  let app: INestApplication;
  let superAdmin: Agent;
  let schoolAdmin: Agent;
  let office: Agent;
  let accountant: Agent;

  const inbox = async (who: Agent, qs = '') =>
    (await who.get(`/api/notifications?pageSize=100${qs}`).expect(200))
      .body as {
      items: {
        id: string;
        type: string;
        title: string;
        body: string | null;
        link: string | null;
        read: boolean;
      }[];
      total: number;
      unread: number;
    };
  const unread = async (who: Agent) =>
    (await who.get('/api/notifications/unread-count').expect(200)).body
      .unread as number;
  const ofType = (
    box: Awaited<ReturnType<typeof inbox>>,
    type: string,
    contains = '',
  ) =>
    box.items.filter(
      (n) => n.type === type && `${n.title} ${n.body ?? ''}`.includes(contains),
    );

  async function staffWithLogin(over: Record<string, unknown> = {}) {
    const email = `${unique('t')}@test.local`;
    const created = (
      await superAdmin
        .post('/api/staff')
        .send({
          firstName: 'Asha',
          surname: unique('Rao'),
          gender: 'FEMALE',
          designation: 'Teacher',
          email,
          account: { roleCodes: ['TEACHER'] },
          ...over,
        })
        .expect(201)
    ).body;
    return {
      id: created.id as string,
      name: `${created.firstName} ${created.surname}`,
      agent: await loginAndSettle(
        app,
        email,
        created.temporaryPassword,
        'Teacher-Pass-123',
      ),
    };
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    superAdmin = await adminAgent(app);
    schoolAdmin = (await createSettledUser(app, superAdmin, 'SCHOOL_ADMIN'))
      .agent;
    office = (await createSettledUser(app, superAdmin, 'OFFICE_STAFF')).agent;
    accountant = (await createSettledUser(app, superAdmin, 'ACCOUNTANT')).agent;
  });
  afterAll(() => app.close());

  describe('the inbox', () => {
    it('needs a signed-in person and starts empty', async () => {
      const t = await staffWithLogin();
      const box = await inbox(t.agent);
      expect(box).toMatchObject({ items: [], total: 0, unread: 0 });
      await newAgent(app).get('/api/notifications').expect(401);
    });
  });

  describe('leave messages', () => {
    let year: string;
    let casual: string;
    let Y: string;
    let teacher: Awaited<ReturnType<typeof staffWithLogin>>;
    let other: Awaited<ReturnType<typeof staffWithLogin>>;

    beforeAll(async () => {
      const existing = (await superAdmin.get('/api/academic-years').expect(200))
        .body as { startDate: string }[];
      const Y1 =
        Math.max(
          2300,
          ...existing.map((y) => Number(y.startDate.slice(0, 4))),
        ) + 10;
      Y = monday(`${Y1}-06-01`);
      year = (
        await superAdmin
          .post('/api/academic-years')
          .send({
            name: unique('AYn'),
            startDate: `${Y1}-04-01`,
            endDate: `${Y1 + 1}-03-31`,
          })
          .expect(201)
      ).body.id;
      casual = (
        await schoolAdmin
          .post('/api/leave/types')
          .send({ name: unique('Casual') })
          .expect(201)
      ).body.id;
      await schoolAdmin
        .put('/api/leave/entitlements')
        .send({
          academicYearId: year,
          items: [{ leaveTypeId: casual, days: 10 }],
        })
        .expect(200);
      teacher = await staffWithLogin();
      other = await staffWithLogin();
    });

    it('a request tells the administrators, not the person who asked or other staff', async () => {
      const before = await unread(schoolAdmin);
      const r = (
        await teacher.agent
          .post('/api/leave/requests')
          .send({
            leaveTypeId: casual,
            startsOn: Y,
            endsOn: addDays(Y, 1),
            reason: 'Family function',
          })
          .expect(201)
      ).body;
      expect(await unread(schoolAdmin)).toBe(before + 1);
      const mine = ofType(
        await inbox(schoolAdmin),
        'leave.requested',
        teacher.name,
      );
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ link: '/app/leave', read: false });
      expect(mine[0].body).toContain('Family function');
      expect(
        ofType(await inbox(superAdmin), 'leave.requested', teacher.name),
      ).toHaveLength(1);
      // Not the person, not other staff, not the office or accountant (they do not decide leave).
      expect(
        ofType(await inbox(teacher.agent), 'leave.requested'),
      ).toHaveLength(0);
      expect(ofType(await inbox(other.agent), 'leave.requested')).toHaveLength(
        0,
      );
      expect(ofType(await inbox(office), 'leave.requested')).toHaveLength(0);
      expect(ofType(await inbox(accountant), 'leave.requested')).toHaveLength(
        0,
      );

      // The decision tells the person.
      await schoolAdmin
        .post(`/api/leave/requests/${r.id}/decision`)
        .send({ decision: 'APPROVED', note: 'Enjoy' })
        .expect(200);
      const approved = ofType(await inbox(teacher.agent), 'leave.approved');
      expect(approved).toHaveLength(1);
      expect(approved[0]).toMatchObject({
        title: 'Your leave was approved',
        link: '/app/my-leave',
      });
      expect(approved[0].body).toContain('Enjoy');

      // The person withdrawing approved leave tells the administrators again.
      await teacher.agent
        .post(`/api/leave/requests/${r.id}/cancel`)
        .send({})
        .expect(200);
      expect(
        ofType(await inbox(schoolAdmin), 'leave.cancelled', teacher.name),
      ).toHaveLength(1);
    });

    it('a refusal, a recording by an administrator and a withdrawal by the school all tell the person', async () => {
      const r = (
        await other.agent
          .post('/api/leave/requests')
          .send({
            leaveTypeId: casual,
            startsOn: addDays(Y, 7),
            reason: 'Appointment',
          })
          .expect(201)
      ).body;
      await schoolAdmin
        .post(`/api/leave/requests/${r.id}/decision`)
        .send({ decision: 'REJECTED', note: 'Exams that week' })
        .expect(200);
      const refused = ofType(await inbox(other.agent), 'leave.rejected');
      expect(refused[0].title).toBe('Your leave was refused');
      expect(refused[0].body).toContain('Exams that week');

      const rec = (
        await schoolAdmin
          .post('/api/leave/requests')
          .send({
            leaveTypeId: casual,
            staffId: other.id,
            startsOn: addDays(Y, 14),
            reason: 'Training',
          })
          .expect(201)
      ).body;
      expect(ofType(await inbox(other.agent), 'leave.recorded')).toHaveLength(
        1,
      );
      // The administrator who recorded it is not told about their own action.
      expect(ofType(await inbox(schoolAdmin), 'leave.recorded')).toHaveLength(
        0,
      );

      await superAdmin
        .post(`/api/leave/requests/${rec.id}/cancel`)
        .send({ note: 'Training cancelled' })
        .expect(200);
      const withdrawn = ofType(await inbox(other.agent), 'leave.cancelled');
      expect(withdrawn[0].body).toContain('Training cancelled');
    });
  });

  describe('reading, and only your own', () => {
    it("marks one or all as read, counts what is unread, and never shows or changes anyone else's", async () => {
      const a = await staffWithLogin();
      const b = await staffWithLogin();
      // Give each a couple of messages through a real feature: a recorded leave needs setup, so use the
      // database directly for a self-contained check of the inbox rules.
      const { PrismaService } =
        await import('../src/database/prisma.service.js');
      const prisma = app.get(PrismaService);
      const school = await prisma.school.findFirstOrThrow({
        orderBy: { createdAt: 'asc' },
      });
      const users = await prisma.user.findMany({
        where: { staff: { id: { in: [a.id, b.id] } } },
        select: { id: true, staff: { select: { id: true } } },
      });
      const ua = users.find((u) => u.staff?.id === a.id)!.id;
      const ub = users.find((u) => u.staff?.id === b.id)!.id;
      await prisma.notification.createMany({
        data: [
          { schoolId: school.id, userId: ua, type: 't', title: 'one' },
          { schoolId: school.id, userId: ua, type: 't', title: 'two' },
          { schoolId: school.id, userId: ua, type: 't', title: 'three' },
          { schoolId: school.id, userId: ub, type: 't', title: 'for b' },
        ],
      });
      let box = await inbox(a.agent);
      expect(box.total).toBe(3);
      expect(box.unread).toBe(3);
      expect(box.items.map((n) => n.title)).not.toContain('for b');

      const [first] = box.items;
      expect(
        (await a.agent.post(`/api/notifications/${first.id}/read`).expect(200))
          .body.unread,
      ).toBe(2);
      // Reading again changes nothing.
      expect(
        (await a.agent.post(`/api/notifications/${first.id}/read`).expect(200))
          .body.unread,
      ).toBe(2);
      expect((await inbox(a.agent, '&unread=true')).items).toHaveLength(2);

      // Someone else's message looks like it does not exist, and is left unread.
      const bMsg = (await inbox(b.agent)).items[0];
      await a.agent.post(`/api/notifications/${bMsg.id}/read`).expect(404);
      expect((await inbox(b.agent)).unread).toBe(1);
      await a.agent.post(`/api/notifications/${randomUUID()}/read`).expect(404);
      await a.agent.post('/api/notifications/not-an-id/read').expect(400);

      expect(
        (await a.agent.post('/api/notifications/read-all').expect(200)).body
          .unread,
      ).toBe(0);
      box = await inbox(a.agent);
      expect(box.unread).toBe(0);
      expect(box.items.every((n) => n.read)).toBe(true);
      expect((await inbox(b.agent)).unread).toBe(1);
    });

    it('is newest first and pages', async () => {
      const a = await staffWithLogin();
      const { PrismaService } =
        await import('../src/database/prisma.service.js');
      const prisma = app.get(PrismaService);
      const school = await prisma.school.findFirstOrThrow({
        orderBy: { createdAt: 'asc' },
      });
      const u = await prisma.user.findFirstOrThrow({
        where: { staff: { id: a.id } },
      });
      for (let i = 1; i <= 5; i++) {
        await prisma.notification.create({
          data: {
            schoolId: school.id,
            userId: u.id,
            type: 't',
            title: `n${i}`,
            createdAt: new Date(Date.now() + i * 1000),
          },
        });
      }
      const page = (
        await a.agent.get('/api/notifications?page=1&pageSize=2').expect(200)
      ).body;
      expect(page.items.map((n: { title: string }) => n.title)).toEqual([
        'n5',
        'n4',
      ]);
      expect(page.total).toBe(5);
      const second = (
        await a.agent.get('/api/notifications?page=3&pageSize=2').expect(200)
      ).body;
      expect(second.items.map((n: { title: string }) => n.title)).toEqual([
        'n1',
      ]);
      await a.agent.get('/api/notifications?pageSize=500').expect(400);
    });
  });

  describe('fee reminders to the class teacher', () => {
    let classId: string;
    let divId: string;
    let teacher: Awaited<ReturnType<typeof staffWithLogin>>;
    let kid: { id: string; fullName: string };

    async function admit(
      division: string,
      cls: string,
      surname = unique('Fee'),
    ) {
      const a = (
        await office
          .post('/api/admissions/applications')
          .send({
            answers: {
              classApplied: cls,
              surname,
              firstName: 'Noor',
              gender: 'FEMALE',
              dateOfBirth: '2021-06-15',
              undertakingReceived: true,
            },
          })
          .expect(201)
      ).body;
      await office
        .post(`/api/admissions/applications/${a.id}/decision`)
        .send({ decision: 'GRANTED' })
        .expect(200);
      const res = await office
        .post(`/api/admissions/applications/${a.id}/admit`)
        .send({
          divisionId: division,
          guardians: [
            {
              fullName: 'Imran Shaikh',
              relationship: 'FATHER',
              mobile: mobile(),
            },
          ],
        })
        .expect(201);
      return { id: res.body.studentId as string, fullName: `Noor ${surname}` };
    }

    beforeAll(async () => {
      const years = (await superAdmin.get('/api/academic-years').expect(200))
        .body as { id: string; isCurrent: boolean }[];
      let yearId = years.find((y) => y.isCurrent)?.id;
      if (!yearId) {
        yearId = (
          await superAdmin
            .post('/api/academic-years')
            .send({
              name: unique('AY'),
              startDate: '2026-04-01',
              endDate: '2027-03-31',
              isCurrent: true,
            })
            .expect(201)
        ).body.id;
      }
      classId = (
        await superAdmin
          .post('/api/classes')
          .send({ name: unique('Std') })
          .expect(201)
      ).body.id;
      divId = (
        await superAdmin
          .post(`/api/classes/${classId}/divisions`)
          .send({ name: 'A' })
          .expect(201)
      ).body.id;
      const head = (
        await accountant
          .post('/api/fee-heads')
          .send({ name: unique('Tuition') })
          .expect(201)
      ).body.id;
      await accountant
        .put('/api/fee-structures')
        .send({
          academicYearId: yearId,
          classId,
          items: [{ feeHeadId: head, amount: '5000' }],
          instalments: [
            { label: 'Term 1', dueDate: '2099-01-01', percent: 100 },
          ],
        })
        .expect(200);
      kid = await admit(divId, classId);
      await accountant
        .post('/api/fee-invoices/generate')
        .send({ studentIds: [kid.id] })
        .expect(200);
      teacher = await staffWithLogin();
    });

    it('needs a class teacher, and says which class has none', async () => {
      const res = await accountant
        .post(`/api/students/${kid.id}/remind-teacher`)
        .send({})
        .expect(400);
      expect(res.body.message).toMatch(/No class teacher is set for/);
    });

    it('tells the class teacher the student and the amount, and records it', async () => {
      await superAdmin
        .post('/api/teaching-assignments')
        .send({ staffId: teacher.id, divisionId: divId })
        .expect(201);
      const before = await unread(teacher.agent);
      const res = await accountant
        .post(`/api/students/${kid.id}/remind-teacher`)
        .send({ note: 'Please speak to the father' })
        .expect(200);
      expect(res.body.notified).toBe(teacher.name);
      expect(await unread(teacher.agent)).toBe(before + 1);
      const n = ofType(
        await inbox(teacher.agent),
        'fee.reminder',
        kid.fullName,
      )[0];
      expect(n.title).toContain(kid.fullName);
      expect(n.body).toContain('5000.00');
      expect(n.body).toContain('Please speak to the father');
      expect(n.link).toBe(`/app/students/${kid.id}`);
      // A School Admin may too.
      await schoolAdmin
        .post(`/api/students/${kid.id}/remind-teacher`)
        .send({})
        .expect(200);
    });

    it('is refused when nothing is pending or the student is unknown, and to people who may not send it', async () => {
      const noBill = await admit(divId, classId);
      const res = await accountant
        .post(`/api/students/${noBill.id}/remind-teacher`)
        .send({})
        .expect(400);
      expect(res.body.message).toMatch(/nothing pending/);
      await accountant
        .post(`/api/students/${randomUUID()}/remind-teacher`)
        .send({})
        .expect(404);
      for (const who of [office, teacher.agent]) {
        await who
          .post(`/api/students/${kid.id}/remind-teacher`)
          .send({})
          .expect(403);
      }
      await accountant
        .post(`/api/students/${kid.id}/remind-teacher`)
        .send({ note: 'x'.repeat(300) })
        .expect(400);
    });
  });
});
