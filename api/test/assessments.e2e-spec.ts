import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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

describe('tests and results (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let superAdmin: Agent;
  let schoolAdmin: Agent;
  let office: Agent;
  let teacherT: Agent; // class teacher of A
  let teacherS: Agent; // teaches Science in A only
  let teacherNone: Agent;
  let parentA1: Agent;
  let parentA2: Agent;
  let parentB: Agent;
  let divA: string;
  let divB: string;
  let maths: string;
  let science: string;
  let a1: string;
  let a2: string;
  let b1: string;

  async function teacher(assign?: { divisionId: string; subjectId?: string }) {
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
    if (assign)
      await superAdmin
        .post('/api/teaching-assignments')
        .send({ staffId: created.id, ...assign })
        .expect(201);
    return loginAndSettle(
      app,
      email,
      created.temporaryPassword,
      'Teacher-Pass-123',
    );
  }

  async function admit(divisionId: string, classId: string) {
    const surname = unique('Rs');
    const app1 = (
      await office
        .post('/api/admissions/applications')
        .send({
          answers: {
            classApplied: classId,
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
      .post(`/api/admissions/applications/${app1.id}/decision`)
      .send({ decision: 'GRANTED' })
      .expect(200);
    const m = mobile();
    const res = await office
      .post(`/api/admissions/applications/${app1.id}/admit`)
      .send({
        divisionId,
        guardians: [
          { fullName: 'Imran Shaikh', relationship: 'FATHER', mobile: m },
        ],
      })
      .expect(201);
    const detail = (
      await office.get(`/api/students/${res.body.studentId}`).expect(200)
    ).body;
    const acc = await office
      .post(`/api/guardians/${detail.guardians[0].id}/account`)
      .expect(201);
    return {
      id: res.body.studentId as string,
      parent: await loginAndSettle(
        app,
        m,
        acc.body.temporaryPassword,
        'Parent-Pass-123',
      ),
    };
  }

  const test = (who: Agent, over: Record<string, unknown> = {}) =>
    who.post('/api/assessments').send({
      name: unique('Unit Test'),
      kind: 'UNIT',
      divisionId: divA,
      subjectId: maths,
      maxMarks: 20,
      conductedOn: '2026-11-05',
      ...over,
    });
  const results = async (who: Agent, studentId: string) =>
    (await who.get(`/api/results/students/${studentId}`).expect(200)).body as {
      results: {
        assessment: { id: string; name: string };
        marks: number | null;
        absent: boolean;
        percent: number | null;
        classAverage: number | null;
        classHighest: number | null;
        remark: string | null;
      }[];
    };
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
      .body as { isCurrent: boolean }[];
    if (!years.some((y) => y.isCurrent)) {
      await superAdmin
        .post('/api/academic-years')
        .send({
          name: unique('AY'),
          startDate: '2026-04-01',
          endDate: '2027-03-31',
          isCurrent: true,
        })
        .expect(201);
    }
    const cls = async () =>
      (
        await superAdmin
          .post('/api/classes')
          .send({ name: unique('Std') })
          .expect(201)
      ).body.id as string;
    const classA = await cls();
    const classB = await cls();
    divA = (
      await superAdmin
        .post(`/api/classes/${classA}/divisions`)
        .send({ name: 'A' })
        .expect(201)
    ).body.id;
    divB = (
      await superAdmin
        .post(`/api/classes/${classB}/divisions`)
        .send({ name: 'A' })
        .expect(201)
    ).body.id;
    maths = (
      await superAdmin
        .post('/api/subjects')
        .send({ name: unique('Maths') })
        .expect(201)
    ).body.id;
    science = (
      await superAdmin
        .post('/api/subjects')
        .send({ name: unique('Science') })
        .expect(201)
    ).body.id;
    teacherT = await teacher({ divisionId: divA });
    teacherS = await teacher({ divisionId: divA, subjectId: science });
    teacherNone = await teacher();
    const s1 = await admit(divA, classA);
    const s2 = await admit(divA, classA);
    const s3 = await admit(divB, classB);
    [a1, a2, b1] = [s1.id, s2.id, s3.id];
    [parentA1, parentA2, parentB] = [s1.parent, s2.parent, s3.parent];
  });
  afterAll(() => app.close());

  describe('who may set tests', () => {
    it('shows each person only the divisions and subjects they teach', async () => {
      const t = (await teacherT.get('/api/assessments/options').expect(200))
        .body;
      const forA = t.divisions.find((d: { id: string }) => d.id === divA);
      expect(forA.subjectIds).toEqual(expect.arrayContaining([maths, science]));
      expect(t.divisions.some((d: { id: string }) => d.id === divB)).toBe(
        false,
      );
      const s = (await teacherS.get('/api/assessments/options').expect(200))
        .body;
      expect(
        s.divisions.find((d: { id: string }) => d.id === divA).subjectIds,
      ).toEqual([science]);
      const a = (await superAdmin.get('/api/assessments/options').expect(200))
        .body;
      expect(a.divisions.map((d: { id: string }) => d.id)).toEqual(
        expect.arrayContaining([divA, divB]),
      );
      expect(
        (await teacherNone.get('/api/assessments/options').expect(200)).body
          .divisions,
      ).toEqual([]);
      await parentA1.get('/api/assessments/options').expect(403);
    });

    it('a class teacher sets any subject; a subject teacher only theirs; others none; administrators anywhere', async () => {
      await test(teacherT).expect(201);
      await test(teacherT, { subjectId: science }).expect(201);
      await test(teacherS, { subjectId: science }).expect(201);
      await test(teacherS, { subjectId: maths }).expect(403);
      await test(teacherT, { divisionId: divB }).expect(403);
      await test(teacherNone).expect(403);
      await test(schoolAdmin, { divisionId: divB }).expect(201);
      for (const who of [parentA1, office]) await test(who).expect(403);
    });

    it('is checked: a real date, maximum, division and subject', async () => {
      await test(teacherT, { maxMarks: 0 }).expect(400);
      await test(teacherT, { maxMarks: 5000 }).expect(400);
      await test(teacherT, { conductedOn: '2026-02-30' }).expect(400);
      await test(teacherT, { divisionId: randomUUID() }).expect(400);
      await test(teacherT, { subjectId: randomUUID() }).expect(400);
      await test(teacherT, { kind: 'WEIRD' }).expect(400);
      await test(teacherT, { name: 'x' }).expect(400);
    });
  });

  describe('entering marks', () => {
    let id: string;
    beforeAll(async () => {
      id = (await test(teacherT).expect(201)).body.id;
    });

    it('shows every student of the division, saves marks, absence and remarks, and gives class statistics', async () => {
      const before = (await teacherT.get(`/api/assessments/${id}`).expect(200))
        .body;
      expect(
        before.students.map((s: { studentId: string }) => s.studentId),
      ).toEqual(expect.arrayContaining([a1, a2]));
      expect(
        before.students.some((s: { studentId: string }) => s.studentId === b1),
      ).toBe(false);
      const res = await teacherT
        .put(`/api/assessments/${id}/marks`)
        .send({
          entries: [
            { studentId: a1, marks: 18, remark: 'Very good' },
            { studentId: a2, absent: true },
          ],
        })
        .expect(200);
      const row = (sid: string) =>
        res.body.students.find(
          (s: { studentId: string }) => s.studentId === sid,
        );
      expect(row(a1)).toMatchObject({
        marks: 18,
        percent: 90,
        absent: false,
        remark: 'Very good',
      });
      expect(row(a2)).toMatchObject({
        marks: null,
        absent: true,
        percent: null,
      });
      expect(res.body.stats).toMatchObject({
        entered: 2,
        scored: 1,
        absent: 1,
        average: 18,
        highest: 18,
        lowest: 18,
      });
      // Sending a student again changes their mark; absent can be undone.
      const again = await teacherT
        .put(`/api/assessments/${id}/marks`)
        .send({ entries: [{ studentId: a2, marks: 12.5 }] })
        .expect(200);
      expect(
        again.body.students.find(
          (s: { studentId: string }) => s.studentId === a2,
        ),
      ).toMatchObject({ marks: 12.5, absent: false });
      expect(
        await prisma.assessmentMark.count({ where: { assessmentId: id } }),
      ).toBe(2);
    });

    it('refuses impossible marks and students from other divisions', async () => {
      const put = (entries: unknown[]) =>
        teacherT.put(`/api/assessments/${id}/marks`).send({ entries });
      await put([{ studentId: a1, marks: 21 }]).expect(400);
      await put([{ studentId: a1, marks: -1 }]).expect(400);
      await put([{ studentId: a1, marks: 3.456 }]).expect(400);
      await put([{ studentId: a1, marks: 5, absent: true }]).expect(400);
      await put([{ studentId: b1, marks: 5 }]).expect(400);
      await put([
        { studentId: a1, marks: 5 },
        { studentId: a1, marks: 6 },
      ]).expect(400);
      await put([]).expect(400);
      await put([{ studentId: randomUUID(), marks: 5 }]).expect(400);
    });

    it("is the setter's own: another teacher cannot see, change or publish it, an administrator can", async () => {
      await teacherS.get(`/api/assessments/${id}`).expect(404);
      await teacherS
        .put(`/api/assessments/${id}/marks`)
        .send({ entries: [{ studentId: a1, marks: 1 }] })
        .expect(404);
      await teacherS.post(`/api/assessments/${id}/publish`).expect(404);
      const list = (
        await teacherS.get('/api/assessments?pageSize=100').expect(200)
      ).body.items as { id: string }[];
      expect(list.some((t) => t.id === id)).toBe(false);
      await schoolAdmin.get(`/api/assessments/${id}`).expect(200);
      expect(
        (
          (await superAdmin.get('/api/assessments?pageSize=100').expect(200))
            .body.items as { id: string }[]
        ).some((t) => t.id === id),
      ).toBe(true);
    });

    it('changes the name and date, but never lets the maximum fall below a mark already given', async () => {
      await teacherT
        .patch(`/api/assessments/${id}`)
        .send({ name: 'Unit Test 1 (revised)', conductedOn: '2026-11-06' })
        .expect(200);
      const low = await teacherT
        .patch(`/api/assessments/${id}`)
        .send({ maxMarks: 10 })
        .expect(400);
      expect(low.body.message).toMatch(/already has/);
      await teacherT
        .patch(`/api/assessments/${id}`)
        .send({ maxMarks: 25 })
        .expect(200);
    });
  });

  describe('publishing', () => {
    let id: string;
    beforeAll(async () => {
      id = (await test(teacherT, { name: unique('Mock') }).expect(201)).body.id;
    });

    it('needs some marks, and until then families see nothing', async () => {
      const r = await teacherT
        .post(`/api/assessments/${id}/publish`)
        .expect(400);
      expect(r.body.message).toMatch(/Enter some marks/);
      await teacherT
        .put(`/api/assessments/${id}/marks`)
        .send({
          entries: [
            { studentId: a1, marks: 15, remark: 'Good' },
            { studentId: a2, absent: true },
          ],
        })
        .expect(200);
      expect(
        (await results(parentA1, a1)).results.some(
          (x) => x.assessment.id === id,
        ),
      ).toBe(false);
    });

    it('shows each family their own child with percentage and class figures, and tells them', async () => {
      const pub = await teacherT
        .post(`/api/assessments/${id}/publish`)
        .expect(200);
      expect(pub.body.published).toBe(true);
      const mine = (await results(parentA1, a1)).results.find(
        (x) => x.assessment.id === id,
      )!;
      expect(mine).toMatchObject({
        marks: 15,
        percent: 75,
        remark: 'Good',
        classAverage: 15,
        classHighest: 15,
      });
      const other = (await results(parentA2, a2)).results.find(
        (x) => x.assessment.id === id,
      )!;
      expect(other).toMatchObject({ marks: null, absent: true });
      // Another family's child, and another division, look like they do not exist.
      await parentA1.get(`/api/results/students/${a2}`).expect(404);
      await parentB.get(`/api/results/students/${a1}`).expect(404);
      expect(
        (await results(parentB, b1)).results.some(
          (x) => x.assessment.id === id,
        ),
      ).toBe(false);
      for (const who of [parentA1, parentA2]) {
        expect(
          (await inbox(who)).some((n) => n.type === 'result.published'),
        ).toBe(true);
      }
      expect(
        (await inbox(parentB)).some(
          (n) => n.type === 'result.published' && n.title.includes('Mock'),
        ),
      ).toBe(false);
      // Publishing twice does nothing more.
      await teacherT.post(`/api/assessments/${id}/publish`).expect(200);
    });

    it("lets the setter's own students' results be read by the teacher and administrators, not by other teachers", async () => {
      expect(
        (await results(teacherT, a1)).results.some(
          (x) => x.assessment.id === id,
        ),
      ).toBe(true);
      expect(
        (await results(schoolAdmin, a1)).results.some(
          (x) => x.assessment.id === id,
        ),
      ).toBe(true);
      await teacherT.get(`/api/results/students/${b1}`).expect(404);
      await teacherNone.get(`/api/results/students/${a1}`).expect(404);
      await office.get(`/api/results/students/${a1}`).expect(403);
    });

    it('records a change to marks after publishing, and taking it back hides it again', async () => {
      await teacherT
        .put(`/api/assessments/${id}/marks`)
        .send({ entries: [{ studentId: a1, marks: 16 }] })
        .expect(200);
      expect(
        (await results(parentA1, a1)).results.find(
          (x) => x.assessment.id === id,
        )!.marks,
      ).toBe(16);
      expect(
        await prisma.auditLog.findFirst({
          where: {
            entityId: id,
            action: 'assessment.marks_changed_after_publish',
          },
        }),
      ).not.toBeNull();
      await teacherT.post(`/api/assessments/${id}/unpublish`).expect(200);
      expect(
        (await results(parentA1, a1)).results.some(
          (x) => x.assessment.id === id,
        ),
      ).toBe(false);
      await teacherT.post(`/api/assessments/${id}/publish`).expect(200);
      await teacherT.delete(`/api/assessments/${id}`).expect(204);
      expect(
        (await results(parentA1, a1)).results.some(
          (x) => x.assessment.id === id,
        ),
      ).toBe(false);
      await teacherT.delete(`/api/assessments/${id}`).expect(404);
      expect(
        await prisma.assessment.findUnique({ where: { id } }),
      ).not.toBeNull();
    });
  });

  it('filters the list by status, division and subject', async () => {
    const t = (
      await test(teacherT, { subjectId: science, name: unique('Sci') }).expect(
        201,
      )
    ).body;
    const q = async (qs: string) =>
      (
        (await teacherT.get(`/api/assessments?pageSize=100&${qs}`).expect(200))
          .body.items as { id: string }[]
      ).map((x) => x.id);
    expect(await q('status=draft')).toContain(t.id);
    expect(await q('status=published')).not.toContain(t.id);
    expect(await q(`subjectId=${science}`)).toContain(t.id);
    expect(await q(`subjectId=${maths}`)).not.toContain(t.id);
    expect(await q(`divisionId=${divB}`)).not.toContain(t.id);
    await teacherT.get('/api/assessments?status=weird').expect(400);
  });
});
