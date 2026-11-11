import { INestApplication } from '@nestjs/common';
import { addDays } from '../src/modules/attendance/attendance-rules.js';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
  loginAndSettle,
  unique,
} from './helpers.js';

/** The first Monday on or after a date. */
const monday = (iso: string) => {
  let d = iso;
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 1) d = addDays(d, 1);
  return d;
};

describe('leave: holidays and carrying days forward (e2e)', () => {
  let app: INestApplication;
  let superAdmin: Agent;
  let schoolAdmin: Agent;
  let teacher: Agent;
  let staffId: string;
  let typeId: string;
  const years: string[] = [];
  let Y1 = 0;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    superAdmin = await adminAgent(app);
    schoolAdmin = (await createSettledUser(app, superAdmin, 'SCHOOL_ADMIN'))
      .agent;
    const existing = (await superAdmin.get('/api/academic-years').expect(200))
      .body as { startDate: string }[];
    // Far above every year in the shared database, at a random spot so parallel suites do not clash.
    Y1 =
      Math.max(2300, ...existing.map((y) => +y.startDate.slice(0, 4))) +
      10 +
      Math.floor(Math.random() * 300) * 4;
    for (let i = 0; i < 3; i++) {
      years.push(
        (
          await superAdmin
            .post('/api/academic-years')
            .send({
              name: unique('AYc'),
              startDate: `${Y1 + i}-04-01`,
              endDate: `${Y1 + i + 1}-03-31`,
            })
            .expect(201)
        ).body.id,
      );
    }
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
        })
        .expect(201)
    ).body;
    staffId = created.id;
    teacher = await loginAndSettle(
      app,
      email,
      created.temporaryPassword,
      'Teacher-Pass-123',
    );
    typeId = (
      await schoolAdmin
        .post('/api/leave/types')
        .send({ name: unique('Earned'), carryForwardDays: 3 })
        .expect(201)
    ).body.id;
    for (const y of years) {
      await schoolAdmin
        .put('/api/leave/entitlements')
        .send({
          academicYearId: y,
          items: [{ leaveTypeId: typeId, days: 10 }],
        })
        .expect(200);
    }
  });
  afterAll(() => app.close());

  const balanceIn = async (yearId: string) =>
    (
      (
        await teacher
          .get(`/api/leave/balance?academicYearId=${yearId}`)
          .expect(200)
      ).body as {
        balances: {
          leaveType: { id: string };
          entitled: number;
          carriedOver: number;
          remaining: number | null;
        }[];
      }
    ).balances.find((b) => b.leaveType.id === typeId)!;

  describe('public holidays', () => {
    it('are not counted as leave days', async () => {
      const mon = monday(`${Y1}-06-01`);
      const holiday = addDays(mon, 1); // the Tuesday
      await superAdmin
        .post('/api/calendar')
        .send({
          title: unique('Founders day'),
          category: 'HOLIDAY',
          startsOn: holiday,
          audience: 'ALL',
        })
        .expect(201);
      // Monday to Wednesday is three working days, one of them a holiday: two days.
      const res = await teacher
        .post('/api/leave/requests')
        .send({
          leaveTypeId: typeId,
          startsOn: mon,
          endsOn: addDays(mon, 2),
          reason: 'Trip',
        })
        .expect(201);
      expect(res.body.days).toBe(2);
      // Only the holiday: nothing to take leave for.
      await teacher
        .post('/api/leave/requests')
        .send({
          leaveTypeId: typeId,
          startsOn: holiday,
          reason: 'Rest',
        })
        .expect(400);
    });

    it('a holiday for one class does not excuse staff', async () => {
      const mon = monday(`${Y1}-07-01`);
      const cls = (
        await superAdmin
          .post('/api/classes')
          .send({ name: unique('Std') })
          .expect(201)
      ).body.id;
      await superAdmin
        .post('/api/calendar')
        .send({
          title: unique('Class trip'),
          category: 'HOLIDAY',
          startsOn: mon,
          audience: 'CLASSES',
          classIds: [cls],
        })
        .expect(201);
      const res = await teacher
        .post('/api/leave/requests')
        .send({ leaveTypeId: typeId, startsOn: mon, reason: 'Visit' })
        .expect(201);
      expect(res.body.days).toBe(1);
    });
  });

  describe('carrying unused days forward', () => {
    it("shows the kind's cap and refuses odd amounts", async () => {
      const types = (await teacher.get('/api/leave/types').expect(200))
        .body as {
        id: string;
        carryForwardDays: number;
      }[];
      expect(types.find((t) => t.id === typeId)!.carryForwardDays).toBe(3);
      await schoolAdmin
        .post('/api/leave/types')
        .send({ name: unique('Bad'), carryForwardDays: 1.3 })
        .expect(400);
      await teacher
        .post('/api/leave/types')
        .send({ name: unique('X'), carryForwardDays: 2 })
        .expect(403);
    });

    it('carries unused days into the next year, up to the cap, and they can be used', async () => {
      // Year 1 gave 10 days; nothing used there, so 3 (the cap) arrive in year 2.
      const y1 = await balanceIn(years[0]);
      expect(y1.carriedOver).toBe(0);
      const y2 = await balanceIn(years[1]);
      expect(y2).toMatchObject({ entitled: 10, carriedOver: 3 });
      expect(y2.remaining).toBe(13);

      // 13 days can be asked for in year 2 (10 + 3 carried), but not 14.
      const start = monday(`${Y1 + 1}-06-01`);
      await teacher
        .post('/api/leave/requests')
        .send({
          leaveTypeId: typeId,
          startsOn: start,
          endsOn: addDays(start, 15),
          reason: 'Long trip',
        })
        .expect(400);
      const ok = await teacher
        .post('/api/leave/requests')
        .send({
          leaveTypeId: typeId,
          startsOn: start,
          endsOn: addDays(start, 13),
          reason: 'Trip',
        })
        .expect(201);
      expect(ok.body.days).toBe(12);
      expect((await balanceIn(years[1])).remaining).toBe(1);
    });

    it('carries what is left of the year before, not more than the cap', async () => {
      // Year 2: 10 + 3 carried, 12 used -> 1 left to carry into year 3.
      expect((await balanceIn(years[2])).carriedOver).toBe(1);
    });

    it('a kind with no cap carries nothing, and changing the cap applies at once', async () => {
      await schoolAdmin
        .patch(`/api/leave/types/${typeId}`)
        .send({ carryForwardDays: 0 })
        .expect(200);
      expect((await balanceIn(years[1])).carriedOver).toBe(0);
      await schoolAdmin
        .patch(`/api/leave/types/${typeId}`)
        .send({ carryForwardDays: 3 })
        .expect(200);
      expect((await balanceIn(years[1])).carriedOver).toBe(3);
    });
  });

  it('keeps staffId used', () => {
    expect(staffId).toBeTruthy();
  });
});
