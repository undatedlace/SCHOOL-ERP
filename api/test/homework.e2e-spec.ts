import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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

describe('homework (e2e)', () => {
  let app: INestApplication;
  let superAdmin: Agent;
  let schoolAdmin: Agent;
  let office: Agent;
  let teacherA: Agent; // class teacher of A
  let teacherNone: Agent;
  let parentA1: Agent;
  let parentA2: Agent;
  let parentB: Agent;
  let studentA1: Agent;
  let divA: string;
  let divB: string;
  let subject: string;
  let kidA1: { id: string; name: string };
  let kidA2: { id: string; name: string };
  let kidB: { id: string; name: string };
  const today = todayInIndia();

  async function teacher(divisionId?: string) {
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
    if (divisionId) {
      await superAdmin
        .post('/api/teaching-assignments')
        .send({ staffId: created.id, divisionId })
        .expect(201);
    }
    return loginAndSettle(
      app,
      email,
      created.temporaryPassword,
      'Teacher-Pass-123',
    );
  }

  async function admit(divisionId: string, classId: string) {
    const surname = unique('Hw');
    const a = (
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
      .post(`/api/admissions/applications/${a.id}/decision`)
      .send({ decision: 'GRANTED' })
      .expect(200);
    const m = mobile();
    const res = await office
      .post(`/api/admissions/applications/${a.id}/admit`)
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
    const parent = await loginAndSettle(
      app,
      m,
      acc.body.temporaryPassword,
      'Parent-Pass-123',
    );
    return {
      id: res.body.studentId as string,
      name: `Noor ${surname}`,
      parent,
    };
  }

  const set = (who: Agent, over: Record<string, unknown> = {}) =>
    who
      .post('/api/homework')
      .send({
        title: unique('Chapter 3'),
        instructions: 'Do exercise 3.2',
        divisionIds: [divA],
        ...over,
      });
  const mine = async (who: Agent, qs = '') =>
    (await who.get(`/api/homework?pageSize=100${qs}`).expect(200)).body as {
      items: {
        id: string;
        title: string;
        forChildren: string[];
        canChange: boolean;
        instructions: string;
        dueOn: string | null;
      }[];
      total: number;
    };
  const sees = async (who: Agent, id: string, qs = '') =>
    (await mine(who, qs)).items.some((h) => h.id === id);
  const inbox = async (who: Agent) =>
    (await who.get('/api/notifications?pageSize=100').expect(200)).body
      .items as { type: string; title: string }[];

  beforeAll(async () => {
    ({ app } = await createTestApp());
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
    subject = (
      await superAdmin
        .post('/api/subjects')
        .send({ name: unique('Maths') })
        .expect(201)
    ).body.id;
    teacherA = await teacher(divA);
    teacherNone = await teacher();
    const a1 = await admit(divA, classA);
    const a2 = await admit(divA, classA);
    const b = await admit(divB, classB);
    kidA1 = a1;
    kidA2 = a2;
    kidB = b;
    parentA1 = a1.parent;
    parentA2 = a2.parent;
    parentB = b.parent;
    const sl = await office.post(`/api/students/${a1.id}/account`).expect(201);
    studentA1 = await loginAndSettle(
      app,
      sl.body.loginId,
      sl.body.temporaryPassword,
      'Student-Pass-123',
    );
  });
  afterAll(() => app.close());

  describe('setting homework', () => {
    it('a teacher sets it for a division they teach; families of that division see it and are told', async () => {
      const res = await set(teacherA, {
        subjectId: subject,
        dueOn: addDays(today, 3),
      }).expect(201);
      const id = res.body.id as string;
      expect(res.body).toMatchObject({
        canChange: true,
        subject: { id: subject },
        dueOn: addDays(today, 3),
      });
      expect(res.body.divisions).toHaveLength(1);

      for (const who of [parentA1, parentA2, studentA1])
        expect(await sees(who, id)).toBe(true);
      expect(await sees(parentB, id)).toBe(false);
      expect(await sees(teacherNone, id)).toBe(false);
      expect(await sees(teacherA, id)).toBe(true);
      expect(await sees(superAdmin, id)).toBe(true);
      const h = (await mine(parentA1)).items.find((x) => x.id === id)!;
      expect(h.forChildren).toEqual([kidA1.name]);
      expect(h.canChange).toBe(false);

      // Parents and the student are told; the other division's parent is not.
      for (const who of [parentA1, parentA2, studentA1]) {
        const note = (await inbox(who)).find(
          (n) =>
            n.type === 'homework.assigned' && n.title.includes(res.body.title),
        );
        expect(note?.title).toContain('(');
      }
      expect(
        (await inbox(parentB)).some((n) => n.title.includes(res.body.title)),
      ).toBe(false);
    });

    it('can go to one student only, who is the only family told and shown it', async () => {
      const res = await set(teacherA, {
        divisionIds: [],
        studentIds: [kidA1.id],
      }).expect(201);
      expect(await sees(parentA1, res.body.id)).toBe(true);
      expect(await sees(studentA1, res.body.id)).toBe(true);
      expect(await sees(parentA2, res.body.id)).toBe(false);
      expect(res.body.students.map((s: { id: string }) => s.id)).toEqual([
        kidA1.id,
      ]);
      expect(
        (await inbox(parentA2)).some((n) => n.title.includes(res.body.title)),
      ).toBe(false);
    });

    it('is refused for divisions or students the teacher does not teach', async () => {
      await set(teacherA, { divisionIds: [divB] }).expect(403);
      await set(teacherA, { divisionIds: [], studentIds: [kidB.id] }).expect(
        403,
      );
      await set(teacherNone, { divisionIds: [divA] }).expect(403);
    });

    it('an administrator can set it for any division', async () => {
      const s = await set(schoolAdmin, { divisionIds: [divB] }).expect(201);
      expect(await sees(parentB, s.body.id)).toBe(true);
      await set(superAdmin, { divisionIds: [divA, divB] }).expect(201);
    });

    it('is checked: someone to send it to, a real day not in the past, real divisions, students and subjects', async () => {
      await set(teacherA, { divisionIds: [] }).expect(400);
      await set(teacherA, { dueOn: addDays(today, -1) }).expect(400);
      await set(teacherA, { dueOn: '2026-02-30' }).expect(400);
      await set(teacherA, { divisionIds: [randomUUID()] }).expect(400);
      await set(teacherA, {
        divisionIds: [],
        studentIds: [randomUUID()],
      }).expect(400);
      await set(teacherA, { subjectId: randomUUID() }).expect(400);
      await set(teacherA, { title: 'x' }).expect(400);
      await set(teacherA, { instructions: '' }).expect(400);
    });

    it('only teachers and administrators may set it', async () => {
      for (const who of [parentA1, studentA1, office])
        await set(who).expect(403);
    });

    it('keeps instructions exactly as written', async () => {
      const res = await set(teacherA, {
        instructions: '<script>alert(1)</script>',
      }).expect(201);
      const h = (await mine(parentA1)).items.find((x) => x.id === res.body.id)!;
      expect(h.instructions).toBe('<script>alert(1)</script>');
    });
  });

  describe('who sees what', () => {
    it("a teacher sees only their own, an administrator everything, and a family only their children's", async () => {
      const t = await set(teacherA).expect(201);
      const other = await set(superAdmin, { divisionIds: [divB] }).expect(201);
      const teachers = await mine(teacherA);
      expect(teachers.items.some((h) => h.id === t.body.id)).toBe(true);
      expect(teachers.items.some((h) => h.id === other.body.id)).toBe(false);
      expect(await sees(superAdmin, other.body.id)).toBe(true);
      expect(await sees(parentA1, other.body.id)).toBe(false);
      await parentA1.get(`/api/homework/${other.body.id}`).expect(404);
      await parentA1.get(`/api/homework/${t.body.id}`).expect(200);
      await office
        .get('/api/homework')
        .expect(200)
        .then((r) => expect(r.body.items).toEqual([]));
    });

    it('lists open homework by default and everything on request, and filters by division', async () => {
      const dueToday = await set(teacherA, { dueOn: today }).expect(201);
      const noDue = await set(teacherA).expect(201);
      expect(await sees(parentA1, dueToday.body.id)).toBe(true);
      expect(await sees(parentA1, noDue.body.id)).toBe(true);
      expect(await sees(parentA1, noDue.body.id, '&status=all')).toBe(true);
      expect(await sees(teacherA, noDue.body.id, `&divisionId=${divA}`)).toBe(
        true,
      );
      expect(await sees(teacherA, noDue.body.id, `&divisionId=${divB}`)).toBe(
        false,
      );
      await parentA1.get('/api/homework?status=weird').expect(400);
    });

    it('audiences: a teacher gets only their divisions, an administrator all, and others nothing', async () => {
      const t = (await teacherA.get('/api/homework/audiences').expect(200)).body
        .divisions as { id: string }[];
      expect(t.map((d) => d.id)).toEqual([divA]);
      const a = (await superAdmin.get('/api/homework/audiences').expect(200))
        .body.divisions as { id: string }[];
      expect(a.map((d) => d.id)).toEqual(expect.arrayContaining([divA, divB]));
      await parentA1.get('/api/homework/audiences').expect(403);
    });
  });

  describe('changing and removing', () => {
    it('the author or an administrator changes it; others cannot', async () => {
      const h = (await set(teacherA).expect(201)).body;
      const res = await teacherA
        .patch(`/api/homework/${h.id}`)
        .send({ title: 'Chapter 4', dueOn: addDays(today, 5) })
        .expect(200);
      expect(res.body).toMatchObject({
        title: 'Chapter 4',
        dueOn: addDays(today, 5),
      });
      await schoolAdmin
        .patch(`/api/homework/${h.id}`)
        .send({ instructions: 'New instructions' })
        .expect(200);
      // A teacher who cannot see it gets "not found"; a family cannot change it at all.
      await teacherNone
        .patch(`/api/homework/${h.id}`)
        .send({ title: 'Hacked' })
        .expect(404);
      await parentA1
        .patch(`/api/homework/${h.id}`)
        .send({ title: 'Hacked' })
        .expect(403);
      const cleared = await teacherA
        .patch(`/api/homework/${h.id}`)
        .send({ dueOn: '' })
        .expect(200);
      expect(cleared.body.dueOn).toBeNull();
      await teacherA
        .patch(`/api/homework/${h.id}`)
        .send({ subjectId: randomUUID() })
        .expect(400);
    });

    it('removing hides it from everyone, keeps the row, and is audited', async () => {
      const h = (await set(teacherA).expect(201)).body;
      await parentA1.delete(`/api/homework/${h.id}`).expect(403);
      await teacherA.delete(`/api/homework/${h.id}`).expect(204);
      expect(await sees(parentA1, h.id)).toBe(false);
      expect(await sees(teacherA, h.id)).toBe(false);
      await teacherA.delete(`/api/homework/${h.id}`).expect(404);
      await parentA1.get(`/api/homework/${h.id}`).expect(404);
      const { PrismaService } =
        await import('../src/database/prisma.service.js');
      const prisma = app.get(PrismaService);
      expect(
        (await prisma.homework.findUnique({ where: { id: h.id } }))?.archivedAt,
      ).not.toBeNull();
      expect(
        await prisma.auditLog.findFirst({
          where: { entityId: h.id, action: 'homework.archived' },
        }),
      ).not.toBeNull();
    });
  });
});
