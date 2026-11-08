import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service.js';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
  loginAndSettle,
  unique,
} from './helpers.js';

const mobile = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;

describe('teaching assignments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Agent;
  let office: Agent;
  let yearId: string;
  let classId: string;
  let divA: string;
  let divB: string;
  let maths: string;
  let english: string;
  let teacher: {
    staffId: string;
    agent: Agent;
    userId: string;
    email: string;
    password: string;
  };
  let colleague: string; // staff without a login

  const staffBody = (over: Record<string, unknown> = {}) => ({
    firstName: 'Asha',
    surname: unique('Rao'),
    gender: 'FEMALE',
    designation: 'Teacher',
    ...over,
  });
  const newStaff = async (over: Record<string, unknown> = {}) =>
    (await admin.post('/api/staff').send(staffBody(over)).expect(201)).body;
  const assign = (body: Record<string, unknown>, who: Agent = admin) =>
    who.post('/api/teaching-assignments').send(body);

  async function teacherWithLogin() {
    const email = `${unique('t')}@test.local`;
    const created = await newStaff({
      email,
      account: { roleCodes: ['TEACHER'] },
    });
    const password = 'Teacher-Pass-123';
    const agent = await loginAndSettle(
      app,
      email,
      created.temporaryPassword,
      password,
    );
    return {
      staffId: created.id as string,
      agent,
      userId: created.account.userId as string,
      email,
      password,
    };
  }

  // ---- students for the visibility tests ----
  const answers = (division: string, over: Record<string, unknown> = {}) => ({
    classApplied: classId,
    surname: unique('Shaikh'),
    firstName: 'Ayaan',
    gender: 'MALE',
    dateOfBirth: '2021-06-15',
    undertakingReceived: true,
    ...over,
  });
  async function enrol(divisionId: string, surname: string) {
    const created = (
      await office
        .post('/api/admissions/applications')
        .send({ answers: answers(divisionId, { surname }) })
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
            mobile: mobile(),
          },
        ],
      })
      .expect(201);
    return res.body.studentId as string;
  }

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await adminAgent(app);
    office = (await createSettledUser(app, admin, 'OFFICE_STAFF')).agent;

    const years = (await admin.get('/api/academic-years').expect(200)).body as {
      id: string;
      isCurrent: boolean;
    }[];
    yearId =
      years.find((y) => y.isCurrent)?.id ??
      (
        await admin
          .post('/api/academic-years')
          .send({
            name: unique('AY'),
            startDate: '2026-04-01',
            endDate: '2027-03-31',
            isCurrent: true,
          })
          .expect(201)
      ).body.id;
    classId = (
      await admin
        .post('/api/classes')
        .send({ name: unique('Std') })
        .expect(201)
    ).body.id;
    divA = (
      await admin
        .post(`/api/classes/${classId}/divisions`)
        .send({ name: 'A' })
        .expect(201)
    ).body.id;
    divB = (
      await admin
        .post(`/api/classes/${classId}/divisions`)
        .send({ name: 'B' })
        .expect(201)
    ).body.id;
    maths = (
      await admin
        .post('/api/subjects')
        .send({ name: unique('Maths') })
        .expect(201)
    ).body.id;
    english = (
      await admin
        .post('/api/subjects')
        .send({ name: unique('English') })
        .expect(201)
    ).body.id;
    teacher = await teacherWithLogin();
    colleague = (await newStaff()).id;
  });
  afterAll(() => app.close());

  describe('assigning', () => {
    it('makes a class teacher, in the current year by default', async () => {
      const res = await assign({
        staffId: teacher.staffId,
        divisionId: divA,
      }).expect(201);
      expect(res.body).toMatchObject({
        kind: 'CLASS_TEACHER',
        subject: null,
        academicYear: { id: yearId },
        division: { id: divA, class: { id: classId } },
        staff: { id: teacher.staffId, status: 'ACTIVE' },
      });
    });

    it('makes a subject teacher, and one person may teach several things', async () => {
      const a = await assign({
        staffId: teacher.staffId,
        divisionId: divA,
        subjectId: maths,
      }).expect(201);
      expect(a.body).toMatchObject({ kind: 'SUBJECT', subject: { id: maths } });
      await assign({
        staffId: teacher.staffId,
        divisionId: divB,
        subjectId: maths,
      }).expect(201);
      await assign({
        staffId: teacher.staffId,
        divisionId: divA,
        subjectId: english,
      }).expect(201);
    });

    it('allows only one class teacher per division, and one teacher per subject, naming who has it', async () => {
      const taken = await assign({
        staffId: colleague,
        divisionId: divA,
      }).expect(409);
      expect(taken.body.message).toMatch(/already has .* as class teacher/);
      const dup = await assign({
        staffId: colleague,
        divisionId: divA,
        subjectId: maths,
      }).expect(409);
      expect(dup.body.message).toMatch(/already teaches .* in /);
      // A different division or subject is free.
      await assign({ staffId: colleague, divisionId: divB }).expect(201);
      const other = (
        await admin
          .post('/api/subjects')
          .send({ name: unique('Art') })
          .expect(201)
      ).body.id;
      await assign({
        staffId: colleague,
        divisionId: divA,
        subjectId: other,
      }).expect(201);
    });

    it('checks the teacher, division and subject', async () => {
      await assign({ staffId: randomUUID(), divisionId: divA }).expect(404);
      await assign({ staffId: colleague, divisionId: randomUUID() }).expect(
        404,
      );
      await assign({
        staffId: colleague,
        divisionId: divA,
        subjectId: randomUUID(),
      }).expect(404);
      await assign({ staffId: 'nope', divisionId: divA }).expect(400);
      await assign({ divisionId: divA }).expect(400);
      await assign({
        staffId: colleague,
        divisionId: divA,
        extra: true,
      }).expect(400);
    });

    it('will not assign someone who has left', async () => {
      const left = (await newStaff()).id;
      await admin
        .patch(`/api/staff/${left}`)
        .send({ status: 'LEFT' })
        .expect(200);
      const freeDivision = (
        await admin
          .post(`/api/classes/${classId}/divisions`)
          .send({ name: unique('X').slice(-5) })
          .expect(201)
      ).body.id;
      const res = await assign({
        staffId: left,
        divisionId: freeDivision,
      }).expect(400);
      expect(res.body.message).toMatch(/has left/);
    });

    it('never mixes schools', async () => {
      const other = await prisma.school.create({
        data: { name: unique('Other') },
      });
      const foreignStaff = await prisma.staff.create({
        data: {
          schoolId: other.id,
          seq: 1,
          employeeNo: '1',
          firstName: 'Foreign',
          surname: 'Teacher',
          gender: 'MALE',
          designation: 'Teacher',
          joinedOn: new Date('2026-06-01'),
        },
      });
      const foreignClass = await prisma.schoolClass.create({
        data: { schoolId: other.id, name: 'C1', sortOrder: 1 },
      });
      const foreignDivision = await prisma.division.create({
        data: { schoolId: other.id, classId: foreignClass.id, name: 'A' },
      });
      const foreignYear = await prisma.academicYear.create({
        data: {
          schoolId: other.id,
          name: '2026-27',
          startDate: new Date('2026-04-01'),
          endDate: new Date('2027-03-31'),
        },
      });
      await assign({ staffId: foreignStaff.id, divisionId: divB }).expect(404);
      await assign({
        staffId: colleague,
        divisionId: foreignDivision.id,
      }).expect(404);
      await assign({
        staffId: colleague,
        divisionId: divB,
        academicYearId: foreignYear.id,
      }).expect(404);
    });

    it('is only for people who may manage academic setup', async () => {
      await assign(
        { staffId: colleague, divisionId: divB, subjectId: english },
        office,
      ).expect(403);
      await assign(
        { staffId: colleague, divisionId: divB, subjectId: english },
        teacher.agent,
      ).expect(403);
      await request(app.getHttpServer())
        .post('/api/teaching-assignments')
        .send({})
        .expect(401);
    });
  });

  describe('viewing', () => {
    it('lists the current year, class teachers first and subjects by name, with filters', async () => {
      const list = (await admin.get('/api/teaching-assignments').expect(200))
        .body as {
        kind: string;
        division: { id: string };
        subject: { name: string } | null;
      }[];
      const inA = list.filter((a) => a.division.id === divA);
      expect(inA[0].kind).toBe('CLASS_TEACHER');
      const subjects = inA
        .filter((a) => a.kind === 'SUBJECT')
        .map((a) => a.subject?.name ?? '');
      expect(subjects).toEqual(
        [...subjects].sort((x, y) => x.localeCompare(y)),
      );

      const byDivision = (
        await admin
          .get(`/api/teaching-assignments?divisionId=${divB}`)
          .expect(200)
      ).body as { division: { id: string } }[];
      expect(byDivision.length).toBeGreaterThan(0);
      expect(byDivision.every((a) => a.division.id === divB)).toBe(true);

      const byStaff = (
        await admin
          .get(`/api/teaching-assignments?staffId=${colleague}`)
          .expect(200)
      ).body as { staff: { id: string } }[];
      expect(byStaff.every((a) => a.staff.id === colleague)).toBe(true);
      await admin.get('/api/teaching-assignments?divisionId=nope').expect(400);
    });

    it('a different academic year has its own assignments', async () => {
      const other = (
        await admin
          .post('/api/academic-years')
          .send({
            name: unique('AY'),
            startDate: '2040-04-01',
            endDate: '2041-03-31',
          })
          .expect(201)
      ).body.id;
      expect(
        (
          await admin
            .get(`/api/teaching-assignments?academicYearId=${other}`)
            .expect(200)
        ).body,
      ).toEqual([]);
      await assign({
        staffId: colleague,
        divisionId: divB,
        subjectId: english,
        academicYearId: other,
      }).expect(201); // free in that year
    });

    it('teachers and office staff can read; others cannot', async () => {
      await teacher.agent.get('/api/teaching-assignments').expect(200);
      await office.get('/api/teaching-assignments').expect(200);
      const other = await createSettledUser(app, admin, 'STAFF');
      await other.agent.get('/api/teaching-assignments').expect(403);
    });

    it('a teacher sees their own classes and subjects, and a user with no staff record sees none', async () => {
      const mine = (
        await teacher.agent.get('/api/teaching-assignments/mine').expect(200)
      ).body as { staff: { id: string } }[];
      expect(mine.length).toBeGreaterThanOrEqual(4);
      expect(mine.every((a) => a.staff.id === teacher.staffId)).toBe(true);
      const nobody = await createSettledUser(app, admin, 'TEACHER');
      expect(
        (await nobody.agent.get('/api/teaching-assignments/mine').expect(200))
          .body,
      ).toEqual([]);
    });
  });

  describe('changing and removing', () => {
    it('hands an assignment to another teacher, and refuses someone who has left', async () => {
      const mk = (
        await admin
          .post('/api/subjects')
          .send({ name: unique('Sci') })
          .expect(201)
      ).body.id;
      const a = (
        await assign({
          staffId: teacher.staffId,
          divisionId: divB,
          subjectId: mk,
        }).expect(201)
      ).body;
      const moved = await admin
        .patch(`/api/teaching-assignments/${a.id}`)
        .send({ staffId: colleague })
        .expect(200);
      expect(moved.body.staff.id).toBe(colleague);

      const left = (await newStaff()).id;
      await admin
        .patch(`/api/staff/${left}`)
        .send({ status: 'LEFT' })
        .expect(200);
      await admin
        .patch(`/api/teaching-assignments/${a.id}`)
        .send({ staffId: left })
        .expect(400);
      await admin
        .patch(`/api/teaching-assignments/${randomUUID()}`)
        .send({ staffId: colleague })
        .expect(404);
      await teacher.agent
        .patch(`/api/teaching-assignments/${a.id}`)
        .send({ staffId: colleague })
        .expect(403);
    });

    it('removes an assignment', async () => {
      const subject = (
        await admin
          .post('/api/subjects')
          .send({ name: unique('Geo') })
          .expect(201)
      ).body.id;
      const a = (
        await assign({
          staffId: colleague,
          divisionId: divA,
          subjectId: subject,
        }).expect(201)
      ).body;
      await admin.delete(`/api/teaching-assignments/${a.id}`).expect(204);
      await admin.delete(`/api/teaching-assignments/${a.id}`).expect(404);
      await assign({
        staffId: teacher.staffId,
        divisionId: divA,
        subjectId: subject,
      }).expect(201); // the place is free again
      await office
        .delete(`/api/teaching-assignments/${randomUUID()}`)
        .expect(403);
    });

    it('is recorded in the audit log', async () => {
      const log = await admin
        .get('/api/audit-logs?action=teaching.&pageSize=100')
        .expect(200);
      const actions = log.body.items.map((i: { action: string }) => i.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'teaching.assigned',
          'teaching.changed',
          'teaching.removed',
        ]),
      );
    });
  });

  describe('a teacher sees the students of the divisions they teach', () => {
    let sA: string;
    let sB: string;
    let inA: string;
    let inB: string;
    let t: Awaited<ReturnType<typeof teacherWithLogin>>;

    beforeAll(async () => {
      // Divisions of their own, so these tests do not depend on the assignments made above.
      sA = (
        await admin
          .post(`/api/classes/${classId}/divisions`)
          .send({ name: unique('P').slice(-6) })
          .expect(201)
      ).body.id;
      sB = (
        await admin
          .post(`/api/classes/${classId}/divisions`)
          .send({ name: unique('Q').slice(-6) })
          .expect(201)
      ).body.id;
      inA = await enrol(sA, unique('InA'));
      inB = await enrol(sB, unique('InB'));
      t = await teacherWithLogin();
    });

    const visibleIds = async (who: Agent) =>
      (
        (await who.get('/api/students?pageSize=100').expect(200)).body
          .items as { id: string }[]
      ).map((s) => s.id);

    it('sees none while they have no assignment', async () => {
      expect(await visibleIds(t.agent)).toEqual([]);
      await t.agent.get(`/api/students/${inA}`).expect(404);
    });

    it('a class teacher sees that division only, without the admissions paperwork, and cannot change anything', async () => {
      const a = (
        await assign({ staffId: t.staffId, divisionId: sA }).expect(201)
      ).body;
      const ids = await visibleIds(t.agent);
      expect(ids).toContain(inA);
      expect(ids).not.toContain(inB);

      const profile = (await t.agent.get(`/api/students/${inA}`).expect(200))
        .body;
      expect(profile.application).toBeNull();
      await t.agent.get(`/api/students/${inB}`).expect(404);
      await t.agent
        .patch(`/api/students/${inA}`)
        .send({ surname: 'Hacked' })
        .expect(403);
      await t.agent
        .post(`/api/students/${inA}/guardians`)
        .send({ fullName: 'X Y', relationship: 'OTHER' })
        .expect(403);

      await admin.delete(`/api/teaching-assignments/${a.id}`).expect(204);
      expect(await visibleIds(t.agent)).toEqual([]); // access ends the moment the assignment does
    });

    it('a subject teacher sees the division they teach in', async () => {
      const hist = (
        await admin
          .post('/api/subjects')
          .send({ name: unique('Hist') })
          .expect(201)
      ).body.id;
      const a = (
        await assign({
          staffId: t.staffId,
          divisionId: sB,
          subjectId: hist,
        }).expect(201)
      ).body;
      const ids = await visibleIds(t.agent);
      expect(ids).toContain(inB);
      expect(ids).not.toContain(inA);
      await admin.delete(`/api/teaching-assignments/${a.id}`).expect(204);
    });

    it('an assignment for another academic year gives no access this year', async () => {
      const otherYear = (
        await admin
          .post('/api/academic-years')
          .send({
            name: unique('AY'),
            startDate: '2045-04-01',
            endDate: '2046-03-31',
          })
          .expect(201)
      ).body.id;
      const a = (
        await assign({
          staffId: t.staffId,
          divisionId: sA,
          academicYearId: otherYear,
        }).expect(201)
      ).body;
      expect(await visibleIds(t.agent)).toEqual([]);
      await admin.delete(`/api/teaching-assignments/${a.id}`).expect(204);
    });

    it('someone who has left sees nothing (their login is switched off too)', async () => {
      await assign({ staffId: t.staffId, divisionId: sA }).expect(201);
      await admin
        .patch(`/api/staff/${t.staffId}`)
        .send({ status: 'LEFT' })
        .expect(200);
      await t.agent.get('/api/students').expect(401);
    });

    it('office staff and parents are unaffected', async () => {
      // Read them directly: the list is paged, and the shared test database holds many students.
      await office.get(`/api/students/${inA}`).expect(200);
      await office.get(`/api/students/${inB}`).expect(200);
      const parent = await createSettledUser(app, admin, 'PARENT');
      expect(await visibleIds(parent.agent)).toEqual([]);
    });
  });
});
