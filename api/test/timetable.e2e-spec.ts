import { INestApplication } from '@nestjs/common';
import {
  addDays,
  todayInIndia,
  toDate,
} from '../src/modules/attendance/attendance-rules.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { mondayOf } from '../src/modules/timetable/timetable-rules.js';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
  loginAndSettle,
  unique,
} from './helpers.js';
import { downloadXlsx, uploadXlsx } from './xlsx-helpers.js';

const mobile = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;

interface Slot {
  id: string;
  kind: string;
  label: string;
  startsAt: string;
  endsAt: string;
  days: number[];
}

describe('timetable (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let superAdmin: Agent;
  let schoolAdmin: Agent;
  let office: Agent;
  let parentA: Agent;
  let parentB: Agent;
  let classA: string;
  let classB: string;
  let divA: string;
  let divA2: string;
  let divB: string;
  let maths: string;
  let english: string;
  let mathsT: { id: string; agent: Agent; userId: string };
  let englishT: { id: string; agent: Agent; userId: string };
  let spareT: { id: string; agent: Agent; userId: string };
  let primary: { id: string; slots: Slot[] };
  let secondary: { id: string; slots: Slot[] };
  /** A Monday inside the current academic year, a week or more ahead. */
  let monday: string;

  async function teacher(name: string) {
    const email = `${unique('tt')}@test.local`;
    const created = (
      await superAdmin
        .post('/api/staff')
        .send({
          firstName: name,
          surname: unique('Tt'),
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
    const staff = await prisma.staff.findUniqueOrThrow({
      where: { id: created.id },
    });
    return { id: created.id as string, agent, userId: staff.userId! };
  }

  async function admitParent(divisionId: string, classId: string) {
    const a = (
      await office
        .post('/api/admissions/applications')
        .send({
          answers: {
            classApplied: classId,
            surname: unique('Tt'),
            firstName: 'Zara',
            gender: 'FEMALE',
            dateOfBirth: '2016-06-15',
            undertakingReceived: true,
          },
        })
        .expect(201)
    ).body;
    await office
      .post(`/api/admissions/applications/${a.id}/decision`)
      .send({ decision: 'GRANTED' })
      .expect(200);
    const m = mobile();
    const res = await office
      .post(`/api/admissions/applications/${a.id}/admit`)
      .send({
        divisionId,
        guardians: [
          { fullName: 'Sana Khan', relationship: 'MOTHER', mobile: m },
        ],
      })
      .expect(201);
    const detail = (
      await office.get(`/api/students/${res.body.studentId}`).expect(200)
    ).body;
    const acc = await office
      .post(`/api/guardians/${detail.guardians[0].id}/account`)
      .expect(201);
    return loginAndSettle(
      app,
      m,
      acc.body.temporaryPassword,
      'Parent-Pass-123',
    );
  }

  const week = async (who: Agent, divisionId: string, weekOf = monday) =>
    (
      await who
        .get(`/api/timetable/divisions/${divisionId}?weekOf=${weekOf}`)
        .expect(200)
    ).body;
  const period = (s: { slots: Slot[] }, n: number) =>
    s.slots.filter((x) => x.kind === 'PERIOD')[n - 1];
  const inbox = async (who: Agent) =>
    (await who.get('/api/notifications?pageSize=100').expect(200)).body
      .items as { type: string; title: string }[];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    superAdmin = await adminAgent(app);
    schoolAdmin = (await createSettledUser(app, superAdmin, 'SCHOOL_ADMIN'))
      .agent;
    office = (await createSettledUser(app, superAdmin, 'OFFICE_STAFF')).agent;
    const years = (await superAdmin.get('/api/academic-years').expect(200))
      .body as {
      isCurrent: boolean;
      startDate: string;
      endDate: string;
    }[];
    let current = years.find((y) => y.isCurrent);
    if (!current) {
      current = (
        await superAdmin
          .post('/api/academic-years')
          .send({
            name: unique('AY'),
            startDate: '2026-04-01',
            endDate: '2027-03-31',
            isCurrent: true,
          })
          .expect(201)
      ).body;
    }
    const start = current!.startDate.slice(0, 10);
    const from = start > todayInIndia() ? start : todayInIndia();
    monday = mondayOf(addDays(from, 14));
    expect(monday <= current!.endDate.slice(0, 10)).toBe(true);

    const cls = async () =>
      (
        await superAdmin
          .post('/api/classes')
          .send({ name: unique('Std') })
          .expect(201)
      ).body.id as string;
    const div = async (c: string, name: string) =>
      (
        await superAdmin
          .post(`/api/classes/${c}/divisions`)
          .send({ name })
          .expect(201)
      ).body.id as string;
    classA = await cls();
    classB = await cls();
    divA = await div(classA, 'A');
    divA2 = await div(classA, 'B');
    divB = await div(classB, 'A');
    maths = (
      await superAdmin
        .post('/api/subjects')
        .send({ name: unique('Maths') })
        .expect(201)
    ).body.id;
    english = (
      await superAdmin
        .post('/api/subjects')
        .send({ name: unique('English') })
        .expect(201)
    ).body.id;
    mathsT = await teacher('Meera');
    englishT = await teacher('Esha');
    spareT = await teacher('Sara');
    await superAdmin
      .post('/api/teaching-assignments')
      .send({ staffId: mathsT.id, divisionId: divA, subjectId: maths })
      .expect(201);
    parentA = await admitParent(divA, classA);
    parentB = await admitParent(divB, classB);
  });
  afterAll(() => app.close());

  describe('timings', () => {
    it('works out a school day from a few numbers', async () => {
      const res = await superAdmin
        .post('/api/timetable/schedules/preview')
        .send({
          firstStart: '08:30',
          periodMinutes: 40,
          periodsPerDay: 6,
          gapMinutes: 0,
          assemblyMinutes: 15,
          breaks: [{ afterPeriod: 3, label: 'Recess', minutes: 20 }],
          days: [1, 2, 3, 4, 5],
        })
        .expect(200);
      expect(res.body.slots).toHaveLength(8);
      expect(res.body.slots[0]).toMatchObject({
        kind: 'ASSEMBLY',
        startsAt: '08:30',
        endsAt: '08:45',
      });
      expect(res.body.slots[4]).toMatchObject({
        kind: 'BREAK',
        label: 'Recess',
        startsAt: '10:45',
      });
    });

    it('an administrator saves named timings with a Saturday of their own and gives them to classes', async () => {
      const p = (
        await superAdmin
          .post('/api/timetable/schedules')
          .send({ name: unique('Primary') })
          .expect(201)
      ).body;
      const preview = (
        await superAdmin
          .post('/api/timetable/schedules/preview')
          .send({
            firstStart: '08:30',
            periodMinutes: 40,
            periodsPerDay: 4,
            gapMinutes: 0,
            breaks: [{ afterPeriod: 2, label: 'Recess', minutes: 20 }],
            days: [1, 2, 3, 4, 5],
          })
          .expect(200)
      ).body.slots;
      const saturday = {
        kind: 'PERIOD',
        label: 'Sat 1',
        startsAt: '08:30',
        endsAt: '09:00',
        days: [6],
      };
      primary = (
        await superAdmin
          .put(`/api/timetable/schedules/${p.id}/slots`)
          .send({ slots: [...preview, saturday] })
          .expect(200)
      ).body;
      expect(primary.slots).toHaveLength(6);

      const s = (
        await schoolAdmin
          .post('/api/timetable/schedules')
          .send({ name: unique('Secondary') })
          .expect(201)
      ).body;
      secondary = (
        await schoolAdmin
          .put(`/api/timetable/schedules/${s.id}/slots`)
          .send({
            slots: [
              {
                kind: 'PERIOD',
                label: 'Period 1',
                startsAt: '08:00',
                endsAt: '08:45',
                days: [1, 2, 3, 4, 5],
              },
              {
                kind: 'PERIOD',
                label: 'Period 2',
                startsAt: '08:45',
                endsAt: '09:30',
                days: [1, 2, 3, 4, 5],
              },
            ],
          })
          .expect(200)
      ).body;

      const list = (
        await superAdmin
          .put('/api/timetable/class-schedules')
          .send({
            classes: [
              { classId: classA, scheduleId: primary.id },
              { classId: classB, scheduleId: secondary.id },
            ],
          })
          .expect(200)
      ).body;
      expect(
        list.classes.find((c: { id: string }) => c.id === classA).scheduleId,
      ).toBe(primary.id);
    });

    it('refuses overlapping rows and a name used twice', async () => {
      await superAdmin
        .put(`/api/timetable/schedules/${secondary.id}/slots`)
        .send({
          slots: [
            {
              kind: 'PERIOD',
              label: 'X',
              startsAt: '08:00',
              endsAt: '09:00',
              days: [1],
            },
            {
              kind: 'PERIOD',
              label: 'Y',
              startsAt: '08:30',
              endsAt: '09:30',
              days: [1],
            },
          ],
        })
        .expect(400);
      const name = unique('Dup');
      await superAdmin
        .post('/api/timetable/schedules')
        .send({ name })
        .expect(201);
      await superAdmin
        .post('/api/timetable/schedules')
        .send({ name })
        .expect(409);
    });

    it('deletes unused timings, and refuses ones a class follows or that hold lessons', async () => {
      const unused = (
        await superAdmin
          .post('/api/timetable/schedules')
          .send({ name: unique('Spare') })
          .expect(201)
      ).body;
      await superAdmin
        .put(`/api/timetable/schedules/${unused.id}/slots`)
        .send({
          slots: [
            {
              kind: 'PERIOD',
              label: 'P1',
              startsAt: '08:00',
              endsAt: '08:40',
              days: [1],
            },
          ],
        })
        .expect(200);
      await mathsT.agent
        .delete(`/api/timetable/schedules/${unused.id}`)
        .expect(403);
      await schoolAdmin
        .delete(`/api/timetable/schedules/${unused.id}`)
        .expect(204);
      await superAdmin
        .delete(`/api/timetable/schedules/${unused.id}`)
        .expect(404);
      // Primary is followed by a class and holds lessons.
      const res = await superAdmin
        .delete(`/api/timetable/schedules/${primary.id}`)
        .expect(409);
      expect(JSON.stringify(res.body.message)).toMatch(/still follow/);
    });

    it('is for administrators only', async () => {
      await office.get('/api/timetable/schedules').expect(403);
      await mathsT.agent.get('/api/timetable/schedules').expect(403);
      await mathsT.agent
        .post('/api/timetable/schedules')
        .send({ name: 'x' })
        .expect(403);
    });
  });

  describe('the week', () => {
    it('fills boxes; the subject teacher is used when no teacher is chosen', async () => {
      const res = await superAdmin
        .put(`/api/timetable/divisions/${divA}/entries`)
        .send({
          entries: [
            {
              slotId: period(primary, 1).id,
              weekday: 1,
              subjectId: maths,
              room: 'Room 3',
            },
            {
              slotId: period(primary, 2).id,
              weekday: 1,
              subjectId: english,
              staffId: englishT.id,
            },
          ],
        })
        .expect(200);
      const p1 = res.body.cells.find(
        (c: { slotId: string }) => c.slotId === period(primary, 1).id,
      );
      expect(p1).toMatchObject({
        weekday: 1,
        staff: { id: mathsT.id },
        room: 'Room 3',
        subject: { id: maths },
      });
      expect(
        res.body.periodsPerWeek.map((p: { count: number }) => p.count),
      ).toEqual([1, 1]);
      expect(res.body.days).toHaveLength(6);
    });

    it('refuses a teacher in two classes at once, also across different timings', async () => {
      // Same timings, other division.
      const same = await superAdmin
        .put(`/api/timetable/divisions/${divA2}/entries`)
        .send({
          entries: [
            {
              slotId: period(primary, 1).id,
              weekday: 1,
              subjectId: maths,
              staffId: mathsT.id,
            },
          ],
        })
        .expect(409);
      expect(JSON.stringify(same.body.message)).toMatch(/same time on Monday/);
      // Secondary period 2 (08:45–09:30) overlaps Primary period 1 (08:30–09:10).
      await superAdmin
        .put(`/api/timetable/divisions/${divB}/entries`)
        .send({
          entries: [
            {
              slotId: period(secondary, 2).id,
              weekday: 1,
              subjectId: maths,
              staffId: mathsT.id,
            },
          ],
        })
        .expect(409);
      // Another day is fine.
      await superAdmin
        .put(`/api/timetable/divisions/${divB}/entries`)
        .send({
          entries: [
            {
              slotId: period(secondary, 2).id,
              weekday: 2,
              subjectId: maths,
              staffId: mathsT.id,
            },
          ],
        })
        .expect(200);
    });

    it('refuses a lesson in a break or on a day the period does not run', async () => {
      const recess = primary.slots.find((s) => s.kind === 'BREAK')!;
      await superAdmin
        .put(`/api/timetable/divisions/${divA}/entries`)
        .send({
          entries: [{ slotId: recess.id, weekday: 1, subjectId: maths }],
        })
        .expect(400);
      await superAdmin
        .put(`/api/timetable/divisions/${divA}/entries`)
        .send({
          entries: [
            { slotId: period(primary, 1).id, weekday: 6, subjectId: maths },
          ],
        })
        .expect(400);
    });

    it('teachers read any class and their own week; families only their child’s class; office nothing', async () => {
      const t = await week(englishT.agent, divB);
      expect(t.division.id).toBe(divB);
      const mine = (
        await mathsT.agent
          .get(`/api/timetable/mine?weekOf=${monday}`)
          .expect(200)
      ).body;
      expect(
        mine.cells
          .map((c: { division: { id: string } }) => c.division.id)
          .sort(),
      ).toEqual([divA, divB].sort());
      await mathsT.agent.get(`/api/timetable/staff/${englishT.id}`).expect(404);
      const p = await week(parentA, divA);
      expect(p.cells.length).toBeGreaterThan(0);
      await parentA.get(`/api/timetable/divisions/${divB}`).expect(404);
      const picker = (await parentB.get('/api/timetable/divisions').expect(200))
        .body;
      expect(picker.map((d: { id: string }) => d.id)).toEqual([divB]);
      await office.get(`/api/timetable/divisions/${divA}`).expect(403);
    });

    it('a class with a timetable keeps its timings until the timetable is cleared', async () => {
      await superAdmin
        .put('/api/timetable/class-schedules')
        .send({ classes: [{ classId: classA, scheduleId: secondary.id }] })
        .expect(409);
      await superAdmin
        .put(`/api/timetable/schedules/${primary.id}/slots`)
        .send({
          slots: primary.slots.filter((s) => s.id !== period(primary, 1).id),
        })
        .expect(409);
    });

    it('moving a period’s time is refused when it would make a clash with other timings', async () => {
      // Primary period 1 holds Meera on Monday; Secondary period 2 holds her on Tuesday only.
      // Put her in Secondary period 1 on Monday (08:00–08:45) — overlaps Primary period 1 (08:30).
      await superAdmin
        .put(`/api/timetable/divisions/${divB}/entries`)
        .send({
          entries: [
            {
              slotId: period(secondary, 1).id,
              weekday: 1,
              subjectId: maths,
              staffId: mathsT.id,
            },
          ],
        })
        .expect(409);
    });

    it('reassigns a subject for good and can make the new teacher the subject teacher', async () => {
      const res = await superAdmin
        .post('/api/timetable/reassign')
        .send({
          divisionId: divA,
          subjectId: maths,
          fromStaffId: mathsT.id,
          toStaffId: spareT.id,
          alsoSubjectTeacher: true,
        })
        .expect(200);
      expect(res.body.moved).toBe(1);
      const st = await prisma.subjectTeacher.findFirst({
        where: { divisionId: divA, subjectId: maths },
      });
      expect(st!.staffId).toBe(spareT.id);
      expect(
        (await inbox(spareT.agent)).some(
          (n) => n.type === 'timetable.reassigned',
        ),
      ).toBe(true);
      // And back, for the tests below.
      await superAdmin
        .post('/api/timetable/reassign')
        .send({
          divisionId: divA,
          subjectId: maths,
          fromStaffId: spareT.id,
          toStaffId: mathsT.id,
          alsoSubjectTeacher: true,
        })
        .expect(200);
    });
  });

  describe('one day', () => {
    let leaveTypeId: string;

    beforeAll(async () => {
      leaveTypeId = (
        await superAdmin
          .post('/api/leave/types')
          .send({ name: unique('Sick'), unlimited: true })
          .expect(201)
      ).body.id;
      const year = await prisma.academicYear.findFirstOrThrow({
        where: { isCurrent: true },
      });
      const school = await prisma.staff.findUniqueOrThrow({
        where: { id: mathsT.id },
      });
      await prisma.leaveRequest.create({
        data: {
          schoolId: school.schoolId,
          staffId: mathsT.id,
          leaveTypeId,
          academicYearId: year.id,
          startsOn: toDate(monday),
          endsOn: toDate(monday),
          halfDays: 2,
          reason: 'Fever',
          status: 'APPROVED',
          requestedById: mathsT.userId,
        },
      });
    });

    it('lists a teacher on leave with their periods needing a substitute', async () => {
      const day = (
        await superAdmin.get(`/api/timetable/day?date=${monday}`).expect(200)
      ).body;
      const away = day.onLeave.find(
        (a: { staff: { id: string } }) => a.staff.id === mathsT.id,
      );
      expect(away.periods).toHaveLength(1);
      expect(away.periods[0].change).toBeNull();
      expect(day.needsSubstitute).toBeGreaterThanOrEqual(1);
    });

    it('suggests free teachers: not on leave, not teaching then', async () => {
      const res = (
        await superAdmin
          .get(
            `/api/timetable/free-teachers?date=${monday}&divisionId=${divA}&slotId=${period(primary, 1).id}`,
          )
          .expect(200)
      ).body;
      const ids = res.teachers.map((t: { id: string }) => t.id);
      expect(ids).toContain(spareT.id);
      expect(ids).toContain(englishT.id); // English is in period 2, so free in period 1
      expect(ids).not.toContain(mathsT.id);
      const p2 = (
        await superAdmin
          .get(
            `/api/timetable/free-teachers?date=${monday}&divisionId=${divA}&slotId=${period(primary, 2).id}`,
          )
          .expect(200)
      ).body.teachers.map((t: { id: string }) => t.id);
      expect(p2).not.toContain(englishT.id);
    });

    it('sets a substitute, tells both teachers, and shows it to the class, the substitute and the family', async () => {
      await superAdmin
        .post('/api/timetable/adjustments')
        .send({
          date: monday,
          divisionId: divA,
          slotId: period(primary, 1).id,
          kind: 'SUBSTITUTE',
          substituteStaffId: englishT.id,
          reason: 'Teacher on sick leave',
        })
        .expect(201);
      // English teaches period 2 of A-A; she cannot also cover period 2 of A-B.
      await superAdmin
        .put(`/api/timetable/divisions/${divA2}/entries`)
        .send({
          entries: [
            {
              slotId: period(primary, 2).id,
              weekday: 1,
              subjectId: maths,
              staffId: spareT.id,
            },
          ],
        })
        .expect(200);
      await superAdmin
        .post('/api/timetable/adjustments')
        .send({
          date: monday,
          divisionId: divA2,
          slotId: period(primary, 2).id,
          kind: 'SUBSTITUTE',
          substituteStaffId: englishT.id,
          reason: 'Cover',
        })
        .expect(409);
      // On leave: cannot be a substitute.
      await superAdmin
        .post('/api/timetable/adjustments')
        .send({
          date: monday,
          divisionId: divA2,
          slotId: period(primary, 2).id,
          kind: 'SUBSTITUTE',
          substituteStaffId: mathsT.id,
          reason: 'Cover',
        })
        .expect(409);
      // One change per period per day.
      await superAdmin
        .post('/api/timetable/adjustments')
        .send({
          date: monday,
          divisionId: divA,
          slotId: period(primary, 1).id,
          kind: 'CANCELLED',
          reason: 'Again',
        })
        .expect(409);

      expect(
        (await inbox(englishT.agent)).some(
          (n) => n.type === 'timetable.substitute',
        ),
      ).toBe(true);
      expect(
        (await inbox(mathsT.agent)).some((n) => n.type === 'timetable.covered'),
      ).toBe(true);

      const staffView = await week(superAdmin, divA);
      expect(staffView.changes[0]).toMatchObject({
        kind: 'SUBSTITUTE',
        substitute: { id: englishT.id },
        reason: 'Teacher on sick leave',
      });
      const family = await week(parentA, divA);
      expect(family.changes[0].reason).toBeNull();
      const sub = (
        await englishT.agent
          .get(`/api/timetable/mine?weekOf=${monday}`)
          .expect(200)
      ).body;
      expect(
        sub.changes.some(
          (c: { kind: string; division: { id: string } }) =>
            c.kind === 'SUBSTITUTE' && c.division.id === divA,
        ),
      ).toBe(true);
      const day = (
        await superAdmin.get(`/api/timetable/day?date=${monday}`).expect(200)
      ).body;
      const away = day.onLeave.find(
        (a: { staff: { id: string } }) => a.staff.id === mathsT.id,
      );
      expect(away.periods[0].change).toMatchObject({ kind: 'SUBSTITUTE' });
    });

    it('cancels a period for a day and undoes it', async () => {
      const res = await superAdmin
        .post('/api/timetable/adjustments')
        .send({
          date: monday,
          divisionId: divA,
          slotId: period(primary, 2).id,
          kind: 'CANCELLED',
          reason: 'Sports practice',
        })
        .expect(201);
      // The English teacher is now free in period 2 that day.
      const free = (
        await superAdmin
          .get(
            `/api/timetable/free-teachers?date=${monday}&divisionId=${divA2}&slotId=${period(primary, 2).id}`,
          )
          .expect(200)
      ).body.teachers.map((t: { id: string }) => t.id);
      expect(free).toContain(englishT.id);
      expect(
        (await inbox(englishT.agent)).some(
          (n) => n.type === 'timetable.cancelled',
        ),
      ).toBe(true);
      await superAdmin
        .delete(`/api/timetable/adjustments/${res.body.id}`)
        .expect(204);
      await superAdmin
        .delete(`/api/timetable/adjustments/${res.body.id}`)
        .expect(404);
      const after = await week(superAdmin, divA);
      expect(
        after.changes.filter((c: { kind: string }) => c.kind === 'CANCELLED'),
      ).toHaveLength(0);
    });

    it('refuses a free period, Sundays, other days of the year and non-administrators', async () => {
      await superAdmin
        .post('/api/timetable/adjustments')
        .send({
          date: addDays(monday, 1),
          divisionId: divA,
          slotId: period(primary, 1).id,
          kind: 'CANCELLED',
          reason: 'Nothing there',
        })
        .expect(400);
      await superAdmin
        .post('/api/timetable/adjustments')
        .send({
          date: addDays(monday, 6),
          divisionId: divA,
          slotId: period(primary, 1).id,
          kind: 'CANCELLED',
          reason: 'Sunday',
        })
        .expect(400);
      await superAdmin
        .post('/api/timetable/adjustments')
        .send({
          date: '2001-01-01',
          divisionId: divA,
          slotId: period(primary, 1).id,
          kind: 'CANCELLED',
          reason: 'Long ago',
        })
        .expect(400);
      await mathsT.agent.get(`/api/timetable/day?date=${monday}`).expect(403);
      await parentA
        .post('/api/timetable/adjustments')
        .send({
          date: monday,
          divisionId: divA,
          slotId: period(primary, 1).id,
          kind: 'CANCELLED',
          reason: 'x',
        })
        .expect(403);
    });
  });

  describe('Excel import', () => {
    it('hands out a filled-in template per class and imports the boxes that pass, refusing clashes in the file', async () => {
      const wb = await downloadXlsx(
        superAdmin,
        `/api/imports/timetable/template?classId=${classA}`,
      );
      const ws = wb.getWorksheet('Timetable')!;
      const keys = ws.getRow(1).values as unknown[];
      const col = (k: string) => keys.indexOf(k);
      const find = (division: string, day: string, periodLabel: string) => {
        for (let r = 3; r <= ws.rowCount; r++) {
          const row = ws.getRow(r);
          if (
            row.getCell(col('division')).value === division &&
            row.getCell(col('day')).value === day &&
            row.getCell(col('period')).value === periodLabel
          )
            return row;
        }
        throw new Error(`no row ${division} ${day} ${periodLabel}`);
      };
      // Saved boxes come filled in.
      expect(
        String(find('A', 'Monday', 'Period 1').getCell(col('teacher')).text),
      ).toContain('Meera');
      // Breaks are left out; Saturday has its own period.
      expect(() => find('A', 'Monday', 'Recess')).toThrow();
      find('A', 'Saturday', 'Sat 1');

      const englishNo = (
        await prisma.staff.findUniqueOrThrow({ where: { id: englishT.id } })
      ).employeeNo;
      const englishName = (
        await prisma.subject.findUniqueOrThrow({ where: { id: english } })
      ).name;
      const ok = find('A', 'Tuesday', 'Period 3');
      ok.getCell(col('subject')).value = englishName;
      ok.getCell(col('teacher')).value = englishNo;
      ok.getCell(col('room')).value = 'Lab 1';
      const clash = find('B', 'Tuesday', 'Period 3');
      clash.getCell(col('subject')).value = englishName;
      clash.getCell(col('teacher')).value = englishNo;
      const unknown = find('B', 'Wednesday', 'Period 1');
      unknown.getCell(col('subject')).value = 'Astrology';

      const checked = (
        await uploadXlsx(superAdmin, '/api/imports/timetable/check', wb, 201)
      ).body;
      const bad = checked.rows.filter(
        (r: { errors: string[] }) => r.errors.length,
      );
      expect(bad).toHaveLength(3);
      expect(JSON.stringify(bad)).toMatch(/same time on Tuesday/);
      expect(JSON.stringify(bad)).toMatch(/Astrology is not a subject/);
      expect(checked.summary.ready).toBe(0);
      await superAdmin.delete(`/api/imports/batches/${checked.id}`).expect(204);

      // Without the clashing and unknown rows, the good box goes in.
      clash.getCell(col('subject')).value = null;
      clash.getCell(col('teacher')).value = null;
      unknown.getCell(col('subject')).value = null;
      const again = (
        await uploadXlsx(superAdmin, '/api/imports/timetable/check', wb, 201)
      ).body;
      expect(again.summary.ready).toBe(1);
      await superAdmin.post(`/api/imports/batches/${again.id}/run`).expect(200);
      const tue = period(primary, 3);
      const saved = await prisma.timetableEntry.findFirst({
        where: { divisionId: divA, slotId: tue.id, weekday: 2 },
      });
      expect(saved).toMatchObject({
        subjectId: english,
        staffId: englishT.id,
        room: 'Lab 1',
      });
      await mathsT.agent
        .get(`/api/imports/timetable/template?classId=${classA}`)
        .expect(403);
    });
  });

  describe('copy from another year', () => {
    it('only fills a year that has no timings, and never from the same year', async () => {
      const current = await prisma.academicYear.findFirstOrThrow({
        where: { isCurrent: true },
      });
      await superAdmin
        .post('/api/timetable/copy')
        .send({ fromAcademicYearId: current.id })
        .expect(400);
      const other = await prisma.academicYear.create({
        data: {
          schoolId: current.schoolId,
          name: unique('Old'),
          startDate: new Date('2001-04-01'),
          endDate: new Date('2002-03-31'),
        },
      });
      const res = await superAdmin
        .post('/api/timetable/copy')
        .send({ fromAcademicYearId: other.id })
        .expect(409);
      expect(res.body.message).toMatch(/already has timings/);
      await schoolAdmin
        .post('/api/timetable/copy')
        .send({ fromAcademicYearId: other.id })
        .expect(409);
      await mathsT.agent
        .post('/api/timetable/copy')
        .send({ fromAcademicYearId: other.id })
        .expect(403);
    });
  });
});
