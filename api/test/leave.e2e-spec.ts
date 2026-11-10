import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/database/prisma.service.js';
import { addDays } from '../src/modules/attendance/attendance-rules.js';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
  loginAndSettle,
  unique,
} from './helpers.js';

/** The first Monday on or after a date, so test days never fall on a Sunday. */
const monday = (iso: string) => {
  let d = iso;
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 1) d = addDays(d, 1);
  return d;
};

describe('staff leave (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let superAdmin: Agent;
  let schoolAdmin: Agent;
  let office: Agent;
  let accountant: Agent;
  let teacher: Agent;
  let otherTeacher: Agent;
  let teacherStaffId: string;
  let otherStaffId: string;
  let teacherTypeId: string;
  let casual: string;
  let sick: string;
  let unpaid: string;
  let year: string; // far in the future
  let pastYear: string; // far in the past
  let nextYear: string;
  // Years well above and well below every year already in the shared test database, found at start-up,
  // so no other suite's years can overlap them (other suites create years just above the highest one).
  let Y1 = 0;
  let P1 = 0;
  let Y = '';
  let P = '';
  const day = (n: number) => addDays(Y, n);

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
      agent: await loginAndSettle(
        app,
        email,
        created.temporaryPassword,
        'Teacher-Pass-123',
      ),
    };
  }

  const apply = (who: Agent, body: Record<string, unknown>) =>
    who.post('/api/leave/requests').send({
      leaveTypeId: casual,
      startsOn: Y,
      reason: 'Family function',
      ...body,
    });
  const balance = async (who: Agent, qs = '') =>
    (
      await who
        .get(`/api/leave/balance?academicYearId=${year}${qs}`)
        .expect(200)
    ).body as {
      balances: {
        leaveType: { id: string };
        entitled: number;
        taken: number;
        upcoming: number;
        pending: number;
        remaining: number | null;
      }[];
    };
  const of = (b: Awaited<ReturnType<typeof balance>>, typeId: string) =>
    b.balances.find((x) => x.leaveType.id === typeId)!;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    superAdmin = await adminAgent(app);
    schoolAdmin = (await createSettledUser(app, superAdmin, 'SCHOOL_ADMIN'))
      .agent;
    office = (await createSettledUser(app, superAdmin, 'OFFICE_STAFF')).agent;
    accountant = (await createSettledUser(app, superAdmin, 'ACCOUNTANT')).agent;

    const mkYear = async (name: string, startDate: string, endDate: string) =>
      (
        await superAdmin
          .post('/api/academic-years')
          .send({ name, startDate, endDate })
          .expect(201)
      ).body.id as string;
    const existing = (await superAdmin.get('/api/academic-years').expect(200))
      .body as { startDate: string }[];
    const starts = existing.map((y) => Number(y.startDate.slice(0, 4)));
    Y1 = Math.max(2300, ...starts) + 10;
    P1 = Math.max(1000, Math.min(1900, ...starts) - 10);
    Y = monday(`${Y1}-06-01`);
    P = monday(`${P1}-06-01`);
    year = await mkYear(unique('AYa'), `${Y1}-04-01`, `${Y1 + 1}-03-31`);
    nextYear = await mkYear(
      unique('AYb'),
      `${Y1 + 1}-04-01`,
      `${Y1 + 2}-03-31`,
    );
    pastYear = await mkYear(unique('AYp'), `${P1}-04-01`, `${P1 + 1}-03-31`);

    const types = (await superAdmin.get('/api/staff-types').expect(200))
      .body as { id: string; name: string }[];
    teacherTypeId = types.find((t) => t.name === 'Teacher')!.id;

    const t = await staffWithLogin({ staffTypeId: teacherTypeId });
    teacher = t.agent;
    teacherStaffId = t.id;
    const o = await staffWithLogin({ staffTypeId: teacherTypeId });
    otherTeacher = o.agent;
    otherStaffId = o.id;

    const mk = async (name: string, unlimited = false) =>
      (
        await schoolAdmin
          .post('/api/leave/types')
          .send({ name, unlimited })
          .expect(201)
      ).body.id as string;
    casual = await mk(unique('Casual'));
    sick = await mk(unique('Sick'));
    unpaid = await mk(unique('Unpaid'), true);
    // The allowance for 2080-81: casual 6 days for everyone, 8 for teachers; sick 10 days for everyone.
    await schoolAdmin
      .put('/api/leave/entitlements')
      .send({
        academicYearId: year,
        items: [
          { leaveTypeId: casual, days: 6 },
          { leaveTypeId: casual, staffTypeId: teacherTypeId, days: 8 },
          { leaveTypeId: sick, days: 10 },
        ],
      })
      .expect(200);
  });
  afterAll(() => app.close());

  describe('the kinds of leave', () => {
    it('are listed to staff, set up by administrators only, and never deleted', async () => {
      const names = (
        (await teacher.get('/api/leave/types').expect(200)).body as {
          id: string;
        }[]
      ).map((t) => t.id);
      expect(names).toEqual(expect.arrayContaining([casual, sick, unpaid]));
      for (const who of [teacher, office, accountant]) {
        await who
          .post('/api/leave/types')
          .send({ name: unique('X') })
          .expect(who === teacher ? 403 : 403);
      }
      await accountant.get('/api/leave/types').expect(403);
      const name = unique('Maternity');
      const t = (
        await superAdmin.post('/api/leave/types').send({ name }).expect(201)
      ).body;
      await schoolAdmin.post('/api/leave/types').send({ name }).expect(409);
      await schoolAdmin
        .patch(`/api/leave/types/${t.id}`)
        .send({ active: false, unlimited: true })
        .expect(200);
      expect(
        (
          (await teacher.get('/api/leave/types').expect(200)).body as {
            id: string;
          }[]
        ).some((x) => x.id === t.id),
      ).toBe(false);
      expect(
        (
          (await superAdmin.get('/api/leave/types?all=true').expect(200))
            .body as { id: string }[]
        ).some((x) => x.id === t.id),
      ).toBe(true);
      // Staff cannot see switched-off kinds even by asking.
      expect(
        (
          (await teacher.get('/api/leave/types?all=true').expect(200)).body as {
            id: string;
          }[]
        ).some((x) => x.id === t.id),
      ).toBe(false);
      await schoolAdmin
        .patch(`/api/leave/types/${randomUUID()}`)
        .send({ active: true })
        .expect(404);
    });
  });

  describe('the yearly allowance', () => {
    it('is set by an administrator, with a staff type allowed its own number', async () => {
      const res = (
        await schoolAdmin
          .get(`/api/leave/entitlements?academicYearId=${year}`)
          .expect(200)
      ).body;
      expect(res.items).toHaveLength(3);
      expect(
        res.items.find(
          (i: { staffTypeId: string | null; leaveTypeId: string }) =>
            i.leaveTypeId === casual && i.staffTypeId === teacherTypeId,
        ).days,
      ).toBe(8);
      for (const who of [teacher, office, accountant]) {
        await who
          .get(`/api/leave/entitlements?academicYearId=${year}`)
          .expect(403);
        await who
          .put('/api/leave/entitlements')
          .send({ academicYearId: year, items: [] })
          .expect(403);
      }
    });

    it('checks the numbers and the lists it is given', async () => {
      const put = (items: unknown[], academicYearId = year) =>
        schoolAdmin
          .put('/api/leave/entitlements')
          .send({ academicYearId, items });
      await put([{ leaveTypeId: casual, days: 0.3 }]).expect(400);
      await put([{ leaveTypeId: casual, days: -1 }]).expect(400);
      await put([{ leaveTypeId: randomUUID(), days: 3 }]).expect(400);
      await put([
        { leaveTypeId: casual, staffTypeId: randomUUID(), days: 3 },
      ]).expect(400);
      await put([
        { leaveTypeId: casual, days: 3 },
        { leaveTypeId: casual, days: 4 },
      ]).expect(400);
      await put([], randomUUID()).expect(400);
      // Nothing was changed by the refused ones.
      expect(
        (
          await schoolAdmin
            .get(`/api/leave/entitlements?academicYearId=${year}`)
            .expect(200)
        ).body.items,
      ).toHaveLength(3);
    });

    it('can start next year from this year, once, and never overwrites', async () => {
      const copied = await schoolAdmin
        .post('/api/leave/entitlements/copy')
        .send({ fromAcademicYearId: year, toAcademicYearId: nextYear })
        .expect(200);
      expect(copied.body.items).toHaveLength(3);
      await schoolAdmin
        .post('/api/leave/entitlements/copy')
        .send({ fromAcademicYearId: year, toAcademicYearId: nextYear })
        .expect(409);
      await schoolAdmin
        .post('/api/leave/entitlements/copy')
        .send({ fromAcademicYearId: year, toAcademicYearId: year })
        .expect(400);
    });
  });

  describe('asking for leave', () => {
    it('a teacher asks, it waits, and the balance shows it as pending', async () => {
      const before = of(await balance(teacher), casual);
      expect(before).toMatchObject({
        entitled: 8,
        taken: 0,
        upcoming: 0,
        pending: 0,
        remaining: 8,
      });
      const res = await apply(teacher, { startsOn: Y, endsOn: day(1) }).expect(
        201,
      );
      expect(res.body).toMatchObject({
        status: 'PENDING',
        days: 2,
        mine: true,
      });
      expect(of(await balance(teacher), casual)).toMatchObject({
        pending: 2,
        remaining: 6,
      });
      // Everyone else of the same type has their own balance.
      expect(of(await balance(otherTeacher), casual).pending).toBe(0);
    });

    it('counts working days only (Sundays are free) and half days', async () => {
      const t = await staffWithLogin({ staffTypeId: teacherTypeId });
      // Monday to the next Monday: 7 working days with the Sunday left out.
      const res = await apply(t.agent, {
        startsOn: day(7),
        endsOn: day(14),
        leaveTypeId: sick,
      }).expect(201);
      expect(res.body.days).toBe(7);
      await apply(t.agent, {
        startsOn: day(21),
        halfDay: true,
        leaveTypeId: unpaid,
      })
        .expect(201)
        .then((r) => expect(r.body.days).toBe(0.5));
      await apply(t.agent, { startsOn: day(27), leaveTypeId: unpaid }).expect(
        400,
      ); // a Sunday
      await apply(t.agent, {
        startsOn: day(35),
        endsOn: day(36),
        halfDay: true,
        leaveTypeId: unpaid,
      }).expect(400);
    });

    it('is refused when it is more than is left, or there is no allowance, but unlimited kinds are free', async () => {
      const t = await staffWithLogin({ staffTypeId: teacherTypeId });
      const big = await apply(t.agent, {
        startsOn: day(42),
        endsOn: day(54),
        leaveTypeId: sick,
      }).expect(400);
      expect(big.body.message).toMatch(/Only 10 day\(s\)/);
      // A kind with no allowance this year.
      const none = (
        await schoolAdmin
          .post('/api/leave/types')
          .send({ name: unique('Study') })
          .expect(201)
      ).body.id;
      const noAllowance = await apply(t.agent, {
        startsOn: day(42),
        leaveTypeId: none,
      }).expect(400);
      expect(noAllowance.body.message).toMatch(/no .* allowance/i);
      await apply(t.agent, {
        startsOn: day(42),
        endsOn: day(60),
        leaveTypeId: unpaid,
      }).expect(201);
    });

    it('cannot overlap leave already asked for or approved', async () => {
      const t = await staffWithLogin({ staffTypeId: teacherTypeId });
      await apply(t.agent, { startsOn: day(70), endsOn: day(72) }).expect(201);
      await apply(t.agent, {
        startsOn: day(72),
        endsOn: day(73),
        leaveTypeId: sick,
      }).expect(409);
      await apply(t.agent, { startsOn: day(73), leaveTypeId: sick }).expect(
        201,
      );
    });

    it('is checked: real dates, a real kind, inside one academic year, not in the past, and a staff record', async () => {
      await apply(teacher, { startsOn: `${Y1}-02-30` }).expect(400);
      await apply(teacher, { leaveTypeId: randomUUID() }).expect(400);
      await apply(teacher, {
        startsOn: `${Y1 + 1}-03-30`,
        endsOn: `${Y1 + 1}-04-02`,
      }).expect(400); // crosses the year end
      await apply(teacher, { startsOn: P }).expect(400); // the past
      await apply(teacher, { reason: 'x' }).expect(400);
      await apply(teacher, { startsOn: day(7), endsOn: day(3) }).expect(400);
      await accountant
        .post('/api/leave/requests')
        .send({ leaveTypeId: casual, startsOn: Y, reason: 'Because' })
        .expect(403);
      // Someone with the permission but no staff record.
      await superAdmin
        .post('/api/leave/requests')
        .send({ leaveTypeId: casual, startsOn: Y, reason: 'Because' })
        .expect(404);
    });

    it('an administrator can record leave for a person; it is approved at once, and only they may', async () => {
      const res = await apply(schoolAdmin, {
        staffId: otherStaffId,
        startsOn: day(80),
        endsOn: day(81),
      }).expect(201);
      expect(res.body).toMatchObject({ status: 'APPROVED', mine: false });
      expect(of(await balance(otherTeacher), casual).upcoming).toBe(2);
      await apply(teacher, { staffId: otherStaffId, startsOn: day(90) }).expect(
        403,
      );
    });
  });

  describe('deciding', () => {
    let pending: string;
    beforeAll(async () => {
      pending = (
        await apply(otherTeacher, {
          startsOn: day(100),
          endsOn: day(101),
          leaveTypeId: sick,
        }).expect(201)
      ).body.id;
    });

    it('only an administrator may, and approving moves the days to "upcoming"', async () => {
      for (const who of [teacher, otherTeacher, office, accountant]) {
        await who
          .post(`/api/leave/requests/${pending}/decision`)
          .send({ decision: 'APPROVED' })
          .expect(403);
      }
      const before = of(await balance(otherTeacher), sick);
      expect(before.pending).toBe(2);
      const res = await schoolAdmin
        .post(`/api/leave/requests/${pending}/decision`)
        .send({ decision: 'APPROVED', note: 'Fine' })
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'APPROVED',
        decisionNote: 'Fine',
      });
      expect(of(await balance(otherTeacher), sick)).toMatchObject({
        pending: 0,
        upcoming: 2,
      });
      await superAdmin
        .post(`/api/leave/requests/${pending}/decision`)
        .send({ decision: 'REJECTED', note: 'No' })
        .expect(409);
    });

    it('a refusal needs a reason and gives the days back', async () => {
      const r = (
        await apply(otherTeacher, {
          startsOn: day(110),
          endsOn: day(111),
          leaveTypeId: sick,
        }).expect(201)
      ).body.id;
      await schoolAdmin
        .post(`/api/leave/requests/${r}/decision`)
        .send({ decision: 'REJECTED' })
        .expect(400);
      const rejected = await superAdmin
        .post(`/api/leave/requests/${r}/decision`)
        .send({ decision: 'REJECTED', note: 'Exams that week' })
        .expect(200);
      expect(rejected.body).toMatchObject({
        status: 'REJECTED',
        decisionNote: 'Exams that week',
      });
      expect(of(await balance(otherTeacher), sick).pending).toBe(0);
      await schoolAdmin
        .post(`/api/leave/requests/${randomUUID()}/decision`)
        .send({ decision: 'APPROVED' })
        .expect(404);
      await schoolAdmin
        .post(`/api/leave/requests/${r}/decision`)
        .send({ decision: 'MAYBE' })
        .expect(400);
    });
  });

  describe('who sees which requests', () => {
    it('staff see their own only; administrators see everyone and can filter', async () => {
      const mine = (
        await teacher.get('/api/leave/requests?pageSize=100').expect(200)
      ).body.items as { staff: { id: string }; mine: boolean }[];
      expect(mine.length).toBeGreaterThan(0);
      expect(mine.every((r) => r.staff.id === teacherStaffId && r.mine)).toBe(
        true,
      );
      // Asking for someone else's changes nothing.
      const sneaky = (
        await teacher
          .get(`/api/leave/requests?staffId=${otherStaffId}&pageSize=100`)
          .expect(200)
      ).body.items as { staff: { id: string } }[];
      expect(sneaky.every((r) => r.staff.id === teacherStaffId)).toBe(true);
      const all = (
        await schoolAdmin.get('/api/leave/requests?pageSize=100').expect(200)
      ).body.items as { staff: { id: string } }[];
      expect(new Set(all.map((r) => r.staff.id)).size).toBeGreaterThan(1);
      const one = (
        await schoolAdmin
          .get(
            `/api/leave/requests?staffId=${otherStaffId}&status=APPROVED&pageSize=100`,
          )
          .expect(200)
      ).body.items as { staff: { id: string }; status: string }[];
      expect(one.length).toBeGreaterThan(0);
      expect(
        one.every(
          (r) => r.staff.id === otherStaffId && r.status === 'APPROVED',
        ),
      ).toBe(true);
      await accountant.get('/api/leave/requests').expect(403);
    });

    it("someone else's balance is for administrators only", async () => {
      await teacher
        .get(
          `/api/leave/balance?academicYearId=${year}&staffId=${otherStaffId}`,
        )
        .expect(404);
      const b = await schoolAdmin
        .get(
          `/api/leave/balance?academicYearId=${year}&staffId=${otherStaffId}`,
        )
        .expect(200);
      expect(b.body.staff.id).toBe(otherStaffId);
    });
  });

  describe('withdrawing', () => {
    it('the person withdraws waiting or future leave, which gives the days back; others cannot', async () => {
      const r = (
        await apply(teacher, { startsOn: day(120), endsOn: day(121) }).expect(
          201,
        )
      ).body.id;
      await otherTeacher
        .post(`/api/leave/requests/${r}/cancel`)
        .send({})
        .expect(404);
      await office.post(`/api/leave/requests/${r}/cancel`).send({}).expect(403);
      const before = of(await balance(teacher), casual).remaining!;
      const res = await teacher
        .post(`/api/leave/requests/${r}/cancel`)
        .send({ note: 'Plans changed' })
        .expect(200);
      expect(res.body.status).toBe('CANCELLED');
      expect(of(await balance(teacher), casual).remaining).toBe(before + 2);
      await teacher
        .post(`/api/leave/requests/${r}/cancel`)
        .send({})
        .expect(409);

      // Approved and still in the future: the person may still withdraw it.
      const a = (
        await apply(schoolAdmin, {
          staffId: teacherStaffId,
          startsOn: day(130),
        }).expect(201)
      ).body.id;
      await teacher
        .post(`/api/leave/requests/${a}/cancel`)
        .send({})
        .expect(200);
    });

    it('leave that has already started can only be withdrawn by an administrator', async () => {
      await schoolAdmin
        .put('/api/leave/entitlements')
        .send({
          academicYearId: pastYear,
          items: [{ leaveTypeId: casual, days: 10 }],
        })
        .expect(200);
      const r = (
        await schoolAdmin
          .post('/api/leave/requests')
          .send({
            leaveTypeId: casual,
            staffId: teacherStaffId,
            startsOn: P,
            reason: 'Backdated',
          })
          .expect(201)
      ).body;
      expect(r.status).toBe('APPROVED');
      const err = await teacher
        .post(`/api/leave/requests/${r.id}/cancel`)
        .send({})
        .expect(400);
      expect(err.body.message).toMatch(/administrator/);
      await schoolAdmin
        .post(`/api/leave/requests/${r.id}/cancel`)
        .send({ note: 'Entered by mistake' })
        .expect(200);
    });
  });

  describe('the staff calendar', () => {
    it("shows an administrator everyone's leave (waiting ones marked), and a member of staff only their own", async () => {
      const t = await staffWithLogin({ staffTypeId: teacherTypeId });
      const w = (
        await apply(t.agent, { startsOn: day(150), endsOn: day(151) }).expect(
          201,
        )
      ).body;
      const range = `from=${day(145)}&to=${day(160)}`;
      const admin = (
        await schoolAdmin.get(`/api/leave/calendar?${range}`).expect(200)
      ).body as { id: string; title: string; status: string }[];
      expect(admin.find((e) => e.id === w.id)).toMatchObject({
        status: 'PENDING',
      });
      expect(admin.find((e) => e.id === w.id)!.title).toMatch(/\(waiting\)/);
      const own = (
        await t.agent.get(`/api/leave/calendar?${range}`).expect(200)
      ).body as { id: string }[];
      expect(own.map((e) => e.id)).toContain(w.id);
      const others = (
        await otherTeacher.get(`/api/leave/calendar?${range}`).expect(200)
      ).body as { id: string }[];
      expect(others.map((e) => e.id)).not.toContain(w.id);
      await schoolAdmin
        .get(`/api/leave/calendar?from=${Y1}-01-01&to=${Y1 + 10}-01-01`)
        .expect(400);
      await schoolAdmin
        .get(`/api/leave/calendar?from=${day(5)}&to=${day(1)}`)
        .expect(400);
      await accountant.get(`/api/leave/calendar?${range}`).expect(403);
    });
  });

  describe('attendance shows approved leave as "on leave"', () => {
    const DAY = () => addDays(P, 1); // a Tuesday in the past year
    it('derives it for the day, lets a mark by hand win, and drops it when the leave is withdrawn', async () => {
      const s = (
        await superAdmin
          .post('/api/staff')
          .send({
            firstName: 'Meera',
            surname: unique('Iyer'),
            gender: 'FEMALE',
            designation: 'Teacher',
            joinedOn: `${P1 - 1}-06-01`,
          })
          .expect(201)
      ).body.id as string;
      const leave = (
        await schoolAdmin
          .post('/api/leave/requests')
          .send({
            leaveTypeId: casual,
            staffId: s,
            startsOn: P,
            endsOn: addDays(P, 2),
            reason: 'Wedding',
          })
          .expect(201)
      ).body;
      const row = async () =>
        (
          (
            await schoolAdmin
              .get(`/api/staff-attendance?date=${DAY()}`)
              .expect(200)
          ).body.staff as {
            staffId: string;
            status: string | null;
            fromLeave: string | null;
          }[]
        ).find((x) => x.staffId === s)!;
      expect(await row()).toMatchObject({ status: 'ON_LEAVE' });
      expect((await row()).fromLeave).toBeTruthy();

      // The grid and the person's own view fill the days in without recording anything.
      const report = (
        await schoolAdmin
          .get(`/api/staff-attendance/report?from=${P}&to=${addDays(P, 5)}`)
          .expect(200)
      ).body;
      const p = report.people.find((x: { staffId: string }) => x.staffId === s);
      expect(Object.keys(p.days).sort()).toEqual([
        P,
        addDays(P, 1),
        addDays(P, 2),
      ]);
      expect(p.onLeave).toBe(3);
      expect(report.markedDates).not.toContain(addDays(P, 1));
      expect(
        await prisma.staffAttendanceRecord.count({ where: { staffId: s } }),
      ).toBe(0);

      // An administrator marking the day by hand overrides it.
      await superAdmin
        .put('/api/staff-attendance')
        .send({ date: DAY(), entries: [{ staffId: s, status: 'PRESENT' }] })
        .expect(200);
      expect(await row()).toMatchObject({ status: 'PRESENT', fromLeave: null });
      await superAdmin
        .delete(`/api/staff-attendance/${s}?date=${DAY()}`)
        .expect(200);
      expect(await row()).toMatchObject({ status: 'ON_LEAVE' });

      await schoolAdmin
        .post(`/api/leave/requests/${leave.id}/cancel`)
        .send({ note: 'Not needed' })
        .expect(200);
      expect(await row()).toMatchObject({ status: null });
    });
  });

  it('records leave actions in the audit log', async () => {
    const log = await prisma.auditLog.findFirst({
      where: { action: 'leave.approved' },
    });
    expect(log).not.toBeNull();
    expect(
      await prisma.auditLog.findFirst({
        where: { action: 'leave.entitlements_saved' },
      }),
    ).not.toBeNull();
  });
});
