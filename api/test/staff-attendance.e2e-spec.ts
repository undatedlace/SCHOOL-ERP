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

describe('staff attendance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Agent;
  let office: Agent;
  let accountant: Agent;
  let teacher: Agent;
  let teacherStaffId: string;
  let otherStaffId: string;
  let leaverId: string;
  const today = todayInIndia();

  async function newStaff(extra: Record<string, unknown> = {}) {
    const email = `${unique('t')}@test.local`;
    const res = await admin
      .post('/api/staff')
      .send({
        firstName: 'Asha',
        surname: unique('Rao'),
        gender: 'FEMALE',
        designation: 'Teacher',
        email,
        joinedOn: addDays(today, -60),
        ...extra,
      })
      .expect(201);
    return { id: res.body.id as string, email, body: res.body };
  }

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await adminAgent(app);
    office = (await createSettledUser(app, admin, 'OFFICE_STAFF')).agent;
    accountant = (await createSettledUser(app, admin, 'ACCOUNTANT')).agent;

    const email = `${unique('t')}@test.local`;
    const created = (
      await admin
        .post('/api/staff')
        .send({
          firstName: 'Meera',
          surname: unique('Iyer'),
          gender: 'FEMALE',
          designation: 'Teacher',
          email,
          joinedOn: addDays(today, -60),
          account: { roleCodes: ['TEACHER'] },
        })
        .expect(201)
    ).body;
    teacherStaffId = created.id;
    teacher = await loginAndSettle(
      app,
      email,
      created.temporaryPassword,
      'Teacher-Pass-123',
    );
    otherStaffId = (await newStaff()).id;
    leaverId = (await newStaff({ joinedOn: addDays(today, -60) })).id;
  });
  afterAll(() => app.close());

  const rosterOf = async (who: Agent, date = today) =>
    (await who.get(`/api/staff-attendance?date=${date}`).expect(200)).body as {
      canMark: boolean;
      marked: boolean;
      staff: { staffId: string; status: string | null; note: string | null }[];
    };
  const row = (r: Awaited<ReturnType<typeof rosterOf>>, id: string) =>
    r.staff.find((s) => s.staffId === id);

  describe('marking', () => {
    it('the admin marks staff, and anyone can be on leave with a note', async () => {
      const res = await admin
        .put('/api/staff-attendance')
        .send({
          date: today,
          entries: [
            { staffId: teacherStaffId, status: 'PRESENT' },
            { staffId: otherStaffId, status: 'ON_LEAVE', note: 'Medical' },
          ],
        })
        .expect(200);
      expect(res.body.canMark).toBe(true);
      expect(row(res.body, teacherStaffId)?.status).toBe('PRESENT');
      expect(row(res.body, otherStaffId)).toMatchObject({
        status: 'ON_LEAVE',
        note: 'Medical',
      });
    });

    it('changes a mark when sent again, on any past day, however old', async () => {
      const old = addDays(today, -40);
      await admin
        .put('/api/staff-attendance')
        .send({
          date: old,
          entries: [{ staffId: otherStaffId, status: 'ABSENT' }],
        })
        .expect(200);
      await admin
        .put('/api/staff-attendance')
        .send({
          date: old,
          entries: [{ staffId: otherStaffId, status: 'LATE' }],
        })
        .expect(200);
      expect(row(await rosterOf(admin, old), otherStaffId)?.status).toBe(
        'LATE',
      );
      expect(
        await prisma.staffAttendanceRecord.count({
          where: {
            staffId: otherStaffId,
            date: new Date(`${old}T00:00:00.000Z`),
          },
        }),
      ).toBe(1);
    });

    it('removes a mark, audits it, and the person shows as unmarked again', async () => {
      const day = addDays(today, -2);
      await admin
        .put('/api/staff-attendance')
        .send({
          date: day,
          entries: [{ staffId: otherStaffId, status: 'ABSENT' }],
        })
        .expect(200);
      const after = await admin
        .delete(`/api/staff-attendance/${otherStaffId}?date=${day}`)
        .expect(200);
      expect(row(after.body, otherStaffId)?.status).toBeNull();
      await admin
        .delete(`/api/staff-attendance/${otherStaffId}?date=${day}`)
        .expect(404);
      await admin.delete(`/api/staff-attendance/${otherStaffId}`).expect(400);
      const log = await prisma.auditLog.findFirst({
        where: {
          entityId: otherStaffId,
          action: 'staff_attendance.mark_removed',
        },
      });
      expect(log).not.toBeNull();
    });

    it('refuses the future, duplicates, unknown people and bad statuses', async () => {
      const put = (body: unknown) =>
        admin.put('/api/staff-attendance').send(body as object);
      await put({
        date: addDays(today, 1),
        entries: [{ staffId: teacherStaffId, status: 'PRESENT' }],
      }).expect(400);
      await put({
        date: today,
        entries: [
          { staffId: teacherStaffId, status: 'PRESENT' },
          { staffId: teacherStaffId, status: 'ABSENT' },
        ],
      }).expect(400);
      await put({
        date: today,
        entries: [{ staffId: randomUUID(), status: 'PRESENT' }],
      }).expect(400);
      await put({
        date: today,
        entries: [{ staffId: teacherStaffId, status: 'HOLIDAY' }],
      }).expect(400);
      await put({ date: '2026-02-30', entries: [] }).expect(400);
    });

    it('does not list or accept someone before they joined or after they left', async () => {
      const future = await newStaff({ joinedOn: addDays(today, -1) });
      const twoDaysAgo = addDays(today, -2);
      expect(row(await rosterOf(admin, twoDaysAgo), future.id)).toBeUndefined();
      await admin
        .put('/api/staff-attendance')
        .send({
          date: twoDaysAgo,
          entries: [{ staffId: future.id, status: 'PRESENT' }],
        })
        .expect(400);
      expect(row(await rosterOf(admin, today), future.id)).toBeDefined();
    });
  });

  describe('who may do what', () => {
    it('only the admin may mark or remove', async () => {
      const body = {
        date: today,
        entries: [{ staffId: otherStaffId, status: 'PRESENT' }],
      };
      for (const who of [office, accountant, teacher]) {
        await who.put('/api/staff-attendance').send(body).expect(403);
        await who
          .delete(`/api/staff-attendance/${otherStaffId}?date=${today}`)
          .expect(403);
      }
    });

    it('the admin and office see everyone, and others do not see the list', async () => {
      expect((await rosterOf(office)).canMark).toBe(false);
      expect((await rosterOf(office)).staff.length).toBeGreaterThan(2);
      await accountant.get('/api/staff-attendance').expect(403);
      await teacher.get('/api/staff-attendance').expect(403);
      await teacher.get('/api/staff-attendance/report').expect(403);
      await office.get('/api/staff-attendance/report').expect(200);
    });

    it('a teacher sees only their own attendance', async () => {
      const res = await teacher
        .get(`/api/staff-attendance/me?from=${addDays(today, -5)}&to=${today}`)
        .expect(200);
      expect(res.body.people.length).toBe(1);
      expect(res.body.people[0].staffId).toBe(teacherStaffId);
      expect(
        res.body.records.map((r: { status: string }) => r.status),
      ).toContain('PRESENT');
      // Leave notes on others' records never appear.
      expect(JSON.stringify(res.body)).not.toContain('Medical');
    });

    it('someone with no staff record gets nothing from /me', async () => {
      await accountant.get('/api/staff-attendance/me').expect(403);
      // The admin account has the permission but no staff profile.
      await admin.get('/api/staff-attendance/me').expect(404);
    });
  });

  describe('the grid', () => {
    it('gives each person their status on each day and their totals', async () => {
      const res = await admin
        .get(
          `/api/staff-attendance/report?from=${addDays(today, -45)}&to=${today}`,
        )
        .expect(200);
      const p = res.body.people.find(
        (x: { staffId: string }) => x.staffId === otherStaffId,
      );
      expect(p.days[addDays(today, -40)]).toBe('LATE');
      expect(p.days[today]).toBe('ON_LEAVE');
      expect(p).toMatchObject({ late: 1, onLeave: 1 });
      expect(res.body.markedDates).toEqual([...res.body.markedDates].sort());
      expect(res.body.daysMarked).toBe(res.body.markedDates.length);
    });

    it('refuses a bad or very long range', async () => {
      await admin
        .get('/api/staff-attendance/report?from=2026-02-30')
        .expect(400);
      await admin
        .get(
          `/api/staff-attendance/report?from=${addDays(today, -500)}&to=${today}`,
        )
        .expect(400);
    });
  });

  it('leavers stay in the grid for the days they worked', async () => {
    await admin
      .put('/api/staff-attendance')
      .send({
        date: addDays(today, -3),
        entries: [{ staffId: leaverId, status: 'PRESENT' }],
      })
      .expect(200);
    await admin
      .patch(`/api/staff/${leaverId}`)
      .send({ status: 'LEFT', leftOn: addDays(today, -1) })
      .expect(200);
    const res = await admin
      .get(
        `/api/staff-attendance/report?from=${addDays(today, -5)}&to=${today}`,
      )
      .expect(200);
    expect(
      res.body.people.some((p: { staffId: string }) => p.staffId === leaverId),
    ).toBe(true);
    expect(row(await rosterOf(admin, today), leaverId)).toBeUndefined();
  });
});
