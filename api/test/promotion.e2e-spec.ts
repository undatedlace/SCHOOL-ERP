import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/database/prisma.service.js';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
  unique,
} from './helpers.js';

const mobile = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;

describe('year-end promotion (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Agent;
  let office: Agent;
  let schoolId: string;
  let oldYear: string;
  let newYear: string;
  let std1: string;
  let std2: string;
  let std1A: string;
  let std1B: string;
  let std2A: string;
  let std2B: string;
  let std3: string; // the last class
  let std3A: string;

  // Dates far from anything else in the shared test database.
  const OLD = { start: '2031-04-01', end: '2032-03-31' };
  const NEW = { start: '2032-04-01', end: '2033-03-31' };

  async function newStudent(divisionId: string, surname: string) {
    const created = (
      await office
        .post('/api/admissions/applications')
        .send({
          answers: {
            classApplied: std1,
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
    const res = await office
      .post(`/api/admissions/applications/${created.id}/admit`)
      // Admission only accepts a division of the granted class; it is moved below.
      .send({
        divisionId: std1A,
        guardians: [
          {
            fullName: 'Imran Shaikh',
            relationship: 'FATHER',
            mobile: mobile(),
          },
        ],
      })
      .expect(201);
    // Admission enrols in the current year; this test wants the student in its own old year.
    await prisma.enrollment.updateMany({
      where: { studentId: res.body.studentId },
      data: {
        academicYearId: oldYear,
        divisionId,
        startedOn: new Date(`${OLD.start}T00:00:00Z`),
      },
    });
    return res.body.studentId as string;
  }

  const query = (divisionId?: string) =>
    `fromAcademicYearId=${oldYear}&toAcademicYearId=${newYear}${divisionId ? `&divisionId=${divisionId}` : ''}`;
  const run = (
    who: Agent,
    divisionId: string,
    entries: { studentId: string; action: string; divisionId?: string }[],
  ) =>
    who.post('/api/promotion/run').send({
      fromAcademicYearId: oldYear,
      toAcademicYearId: newYear,
      divisionId,
      entries,
    });
  const enrolments = (studentId: string) =>
    prisma.enrollment.findMany({
      where: { studentId },
      orderBy: { startedOn: 'asc' },
    });

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await adminAgent(app);
    office = (await createSettledUser(app, admin, 'OFFICE_STAFF')).agent;
    schoolId = (
      await prisma.school.findFirstOrThrow({ orderBy: { createdAt: 'asc' } })
    ).id;

    const year = async (name: string, d: { start: string; end: string }) =>
      (
        await prisma.academicYear.create({
          data: {
            schoolId,
            name: unique(name),
            startDate: new Date(`${d.start}T00:00:00Z`),
            endDate: new Date(`${d.end}T00:00:00Z`),
          },
        })
      ).id;
    oldYear = await year('OLD', OLD);
    newYear = await year('NEW', NEW);

    // Three classes in a row, with sort orders no other suite uses.
    const base = 3_000_000 + Math.floor(Math.random() * 100_000) * 3;
    const cls = async (name: string, sortOrder: number) =>
      (
        await prisma.schoolClass.create({
          data: { schoolId, name: unique(name), sortOrder },
        })
      ).id;
    std1 = await cls('S1', base);
    std2 = await cls('S2', base + 1);
    std3 = await cls('S3', base + 2);
    const div = async (classId: string, name: string) =>
      (await prisma.division.create({ data: { schoolId, classId, name } })).id;
    std1A = await div(std1, 'A');
    std1B = await div(std1, 'B');
    std2A = await div(std2, 'A');
    std2B = await div(std2, 'B');
    std3A = await div(std3, 'A');
  });
  afterAll(() => app.close());

  describe('planning', () => {
    it('suggests moving each student to the same-named division of the next class', async () => {
      const a = await newStudent(std1A, unique('Plan'));
      const plan = (
        await admin.get(`/api/promotion/plan?${query(std1A)}`).expect(200)
      ).body;
      expect(plan.nextClass.id).toBe(std2);
      expect(plan.nextClass.divisions.map((d: { id: string }) => d.id)).toEqual(
        [std2A, std2B],
      );
      expect(plan.sameClassDivisions.map((d: { id: string }) => d.id)).toEqual([
        std1A,
        std1B,
      ]);
      const row = plan.students.find(
        (s: { studentId: string }) => s.studentId === a,
      );
      expect(row.suggested).toEqual({ action: 'PROMOTE', divisionId: std2A });
    });

    it('shows progress for each division', async () => {
      const res = (
        await admin.get(`/api/promotion/status?${query()}`).expect(200)
      ).body;
      const d = res.divisions.find((x: { id: string }) => x.id === std1A);
      expect(d.total).toBeGreaterThan(0);
      expect(d.remaining).toBe(d.total - d.done);
    });
  });

  describe('running it', () => {
    it('promotes, repeats and lets students leave, keeping the old enrolments', async () => {
      const up = await newStudent(std1B, unique('Up'));
      const stay = await newStudent(std1B, unique('Stay'));
      const gone = await newStudent(std1B, unique('Gone'));
      const res = (
        await run(admin, std1B, [
          { studentId: up, action: 'PROMOTE', divisionId: std2B },
          { studentId: stay, action: 'REPEAT', divisionId: std1A },
          { studentId: gone, action: 'LEFT' },
        ]).expect(201)
      ).body;
      expect(res).toMatchObject({
        promoted: 1,
        repeated: 1,
        left: 1,
        skipped: [],
      });

      const [oldRow, newRow] = await enrolments(up);
      expect(oldRow).toMatchObject({
        academicYearId: oldYear,
        divisionId: std1B,
      });
      expect(oldRow.endedOn?.toISOString().slice(0, 10)).toBe(OLD.end);
      expect(newRow).toMatchObject({
        academicYearId: newYear,
        divisionId: std2B,
      });
      expect(newRow.startedOn.toISOString().slice(0, 10)).toBe(NEW.start);

      const repeated = await enrolments(stay);
      expect(repeated.map((e) => e.divisionId)).toEqual([std1B, std1A]);

      const left = await enrolments(gone);
      expect(left).toHaveLength(1); // nothing new; the old one is closed
      const student = await prisma.student.findUniqueOrThrow({
        where: { id: gone },
      });
      expect(student.status).toBe('LEFT');
      expect(student.leftOn?.toISOString().slice(0, 10)).toBe(OLD.end);
    });

    it('a student who leaves loses their login at once', async () => {
      const id = await newStudent(std2A, unique('Login'));
      await office.post(`/api/students/${id}/account`).expect(201);
      await run(admin, std2A, [{ studentId: id, action: 'LEFT' }]).expect(201);
      const s = await prisma.student.findUniqueOrThrow({
        where: { id },
        include: { user: true },
      });
      expect(s.user?.status).toBe('DISABLED');
    });

    it('running it again does nothing twice', async () => {
      const id = await newStudent(std1A, unique('Twice'));
      const entry = { studentId: id, action: 'PROMOTE', divisionId: std2A };
      await run(admin, std1A, [entry]).expect(201);
      const again = (await run(admin, std1A, [entry]).expect(201)).body;
      expect(again.promoted).toBe(0);
      expect(again.skipped[0].reason).toMatch(/Already in/);
      expect(
        await prisma.enrollment.count({
          where: { studentId: id, academicYearId: newYear },
        }),
      ).toBe(1);
    });

    it('two people promoting the same student at once create one enrolment', async () => {
      const id = await newStudent(std1A, unique('Race'));
      const entry = { studentId: id, action: 'PROMOTE', divisionId: std2A };
      await Promise.all([
        run(admin, std1A, [entry]),
        run(admin, std1A, [entry]),
      ]);
      expect(
        await prisma.enrollment.count({
          where: { studentId: id, academicYearId: newYear },
        }),
      ).toBe(1);
    });

    it('drops moved students from the plan and counts them as done', async () => {
      const plan = (
        await admin.get(`/api/promotion/plan?${query(std1B)}`).expect(200)
      ).body;
      expect(plan.students).toHaveLength(0);
      expect(plan.alreadyDone).toBeGreaterThanOrEqual(3);
    });
  });

  describe('refusing mistakes', () => {
    it('refuses promoting sideways or down, repeating into another class, and a missing division', async () => {
      const id = await newStudent(std2B, unique('Bad'));
      const bad = async (e: Record<string, unknown>) =>
        (
          await run(admin, std2B, [{ studentId: id, ...e } as never]).expect(
            400,
          )
        ).body.message as string;
      expect(await bad({ action: 'PROMOTE', divisionId: std1A })).toMatch(
        /not a higher class/,
      );
      expect(await bad({ action: 'PROMOTE', divisionId: std2A })).toMatch(
        /not a higher class/,
      );
      expect(await bad({ action: 'REPEAT', divisionId: std3A })).toMatch(
        /stays in/,
      );
      expect(await bad({ action: 'PROMOTE' })).toMatch(/Choose the division/);
      expect(await bad({ action: 'FLY' })).toBeTruthy();
      // Nothing happened to the student.
      expect(
        await prisma.enrollment.count({
          where: { studentId: id, academicYearId: newYear },
        }),
      ).toBe(0);
    });

    it('is all or nothing: one bad entry changes nobody', async () => {
      const ok = await newStudent(std2B, unique('Ok'));
      const bad = await newStudent(std2B, unique('Oops'));
      await run(admin, std2B, [
        { studentId: ok, action: 'PROMOTE', divisionId: std3A },
        { studentId: bad, action: 'PROMOTE', divisionId: std1A },
      ]).expect(400);
      expect(
        await prisma.enrollment.count({
          where: { studentId: ok, academicYearId: newYear },
        }),
      ).toBe(0);
      const row = await prisma.enrollment.findFirstOrThrow({
        where: { studentId: ok, academicYearId: oldYear },
      });
      expect(row.endedOn).toBeNull();
    });

    it('refuses students who were not in that division, duplicates, and unknown things', async () => {
      const elsewhere = await newStudent(std2A, unique('Else'));
      await run(admin, std2B, [
        { studentId: elsewhere, action: 'LEFT' },
      ]).expect(400);
      await run(admin, std2A, [
        { studentId: elsewhere, action: 'LEFT' },
        { studentId: elsewhere, action: 'LEFT' },
      ]).expect(400);
      await run(admin, randomUUID(), [
        { studentId: elsewhere, action: 'LEFT' },
      ]).expect(404);
      await run(admin, std2A, []).expect(400);
    });

    it('needs the new year to come after the old one, and both to exist', async () => {
      await admin
        .get(
          `/api/promotion/plan?fromAcademicYearId=${newYear}&toAcademicYearId=${oldYear}&divisionId=${std1A}`,
        )
        .expect(400);
      await admin
        .get(
          `/api/promotion/plan?fromAcademicYearId=${randomUUID()}&toAcademicYearId=${newYear}&divisionId=${std1A}`,
        )
        .expect(404);
    });

    it('a student who has already left is skipped, not moved', async () => {
      const id = await newStudent(std2A, unique('Left'));
      await prisma.student.update({
        where: { id },
        data: { status: 'LEFT', leftOn: new Date('2031-09-01T00:00:00Z') },
      });
      const res = (
        await run(admin, std2A, [
          { studentId: id, action: 'PROMOTE', divisionId: std3A },
        ]).expect(201)
      ).body;
      expect(res.skipped[0].reason).toMatch(/left/);
      expect(
        await prisma.enrollment.count({
          where: { studentId: id, academicYearId: newYear },
        }),
      ).toBe(0);
    });
  });

  describe('who may promote', () => {
    it('only the admin; office staff and others are refused', async () => {
      await office.get(`/api/promotion/status?${query()}`).expect(403);
      await run(office, std1A, [
        { studentId: randomUUID(), action: 'LEFT' },
      ]).expect(403);
      const teacher = await createSettledUser(app, admin, 'TEACHER');
      await teacher.agent
        .get(`/api/promotion/plan?${query(std1A)}`)
        .expect(403);
      const parent = await createSettledUser(app, admin, 'PARENT');
      await parent.agent.get(`/api/promotion/status?${query()}`).expect(403);
    });

    it('is written to the audit log', async () => {
      const log = (
        await admin.get('/api/audit-logs?action=students.promoted').expect(200)
      ).body;
      expect(JSON.stringify(log)).toContain('students.promoted');
    });
  });
});
