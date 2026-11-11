import { INestApplication } from '@nestjs/common';
import { HomeworkService } from '../src/modules/homework/homework.service.js';
import { PrismaService } from '../src/database/prisma.service.js';
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

describe('homework hand-ins (e2e)', () => {
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
  let prismaSvc: PrismaService;
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
    who.post('/api/homework').send({
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
    ({ app, prisma: prismaSvc } = await createTestApp());
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

  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWM4UaEBAAN0AWme5/1hAAAAAElFTkSuQmCC',
    'base64',
  );
  const upload = async (who: Agent, purpose: string) =>
    (
      await who
        .post('/api/files')
        .field('purpose', purpose)
        .attach('file', PNG, 'work.png')
        .expect(201)
    ).body.id as string;

  const make = async (over: Record<string, unknown> = {}) =>
    (
      await set(teacherA, {
        handIn: true,
        maxMarks: 10,
        dueOn: addDays(today, 3),
        ...over,
      }).expect(201)
    ).body as { id: string };
  const handIn = (who: Agent, id: string, kid: string, body: object) =>
    who.put(`/api/homework/${id}/students/${kid}/hand-in`).send(body);
  const review = (who: Agent, id: string, kid: string, body: object) =>
    who.put(`/api/homework/${id}/students/${kid}/review`).send(body);

  describe('attachments', () => {
    it('the teacher attaches a worksheet; families of the division download it, others cannot', async () => {
      const fileId = await upload(teacherA, 'homework-attachment');
      const hw = await make({ attachmentFileIds: [fileId] });
      const view = (await parentA1.get(`/api/homework/${hw.id}`).expect(200))
        .body;
      expect(view.attachments).toEqual([
        expect.objectContaining({ id: fileId, name: 'work.png' }),
      ]);
      await parentA1.get(`/api/homework/${hw.id}/files/${fileId}`).expect(200);
      await studentA1.get(`/api/homework/${hw.id}/files/${fileId}`).expect(200);
      await parentB.get(`/api/homework/${hw.id}/files/${fileId}`).expect(404);
      await teacherNone
        .get(`/api/homework/${hw.id}/files/${fileId}`)
        .expect(404);
      // The generic file route refuses scoped files for everyone.
      await teacherA.get(`/api/files/${fileId}`).expect(404);
      await superAdmin.get(`/api/files/${fileId}`).expect(404);
    });

    it("rejects somebody else's upload, the wrong purpose, and a file used twice", async () => {
      const mineFile = await upload(teacherA, 'homework-attachment');
      const other = await upload(superAdmin, 'homework-attachment');
      const wrongPurpose = await upload(parentA1, 'homework-submission');
      await set(teacherA, { attachmentFileIds: [other] }).expect(400);
      await set(teacherA, { attachmentFileIds: [wrongPurpose] }).expect(400);
      await set(teacherA, { attachmentFileIds: [mineFile] }).expect(201);
      await set(teacherA, { attachmentFileIds: [mineFile] }).expect(400);
    });

    it('a parent may not upload attachments; the list can be replaced on update', async () => {
      await parentA1
        .post('/api/files')
        .field('purpose', 'homework-attachment')
        .attach('file', PNG, 'x.png')
        .expect(403);
      const f1 = await upload(teacherA, 'homework-attachment');
      const f2 = await upload(teacherA, 'homework-attachment');
      const hw = await make({ attachmentFileIds: [f1] });
      const res = await teacherA
        .patch(`/api/homework/${hw.id}`)
        .send({ attachmentFileIds: [f2] })
        .expect(200);
      expect(res.body.attachments.map((a: { id: string }) => a.id)).toEqual([
        f2,
      ]);
      // The removed file is gone from storage and records.
      expect(await prismaSvc.storedFile.count({ where: { id: f1 } })).toBe(0);
    });
  });

  describe('handing in', () => {
    it('a parent hands in for their child; the teacher is told and sees it on the roster', async () => {
      const hw = await make();
      const fileId = await upload(parentA1, 'homework-submission');
      const res = await handIn(parentA1, hw.id, kidA1.id, {
        note: 'Done, page 4 is blurry',
        fileIds: [fileId],
      }).expect(200);
      expect(res.body).toMatchObject({ status: 'SUBMITTED', late: false });
      expect(res.body.files).toHaveLength(1);

      const mineView = (
        await parentA1.get(`/api/homework/${hw.id}`).expect(200)
      ).body;
      expect(mineView.children[0]).toMatchObject({
        studentId: kidA1.id,
        submission: { status: 'SUBMITTED' },
      });
      expect(
        (await inbox(teacherA)).some((n) => n.title.includes(kidA1.name)),
      ).toBe(true);

      const roster = (
        await teacherA.get(`/api/homework/${hw.id}/hand-ins`).expect(200)
      ).body;
      expect(roster.counts).toMatchObject({
        students: 3 - 1,
        handedIn: 1,
        marked: 0,
      });
      const row = roster.students.find(
        (s: { studentId: string }) => s.studentId === kidA1.id,
      );
      expect(row.submission.files[0].id).toBe(fileId);

      // The teacher, an admin and the child's own family can open the file; the other family cannot.
      await teacherA.get(`/api/homework/${hw.id}/files/${fileId}`).expect(200);
      await superAdmin
        .get(`/api/homework/${hw.id}/files/${fileId}`)
        .expect(200);
      await studentA1.get(`/api/homework/${hw.id}/files/${fileId}`).expect(200);
      await parentA2.get(`/api/homework/${hw.id}/files/${fileId}`).expect(404);
    });

    it('needs something to hand in, only for your own child, and only where hand-in is on', async () => {
      const hw = await make();
      await handIn(parentA1, hw.id, kidA1.id, {}).expect(400);
      await handIn(parentA1, hw.id, kidA2.id, { note: 'x' }).expect(404);
      await handIn(parentB, hw.id, kidB.id, { note: 'x' }).expect(404);
      await handIn(teacherA, hw.id, kidA1.id, { note: 'x' }).expect(403);
      const plain = (await set(teacherA).expect(201)).body;
      await handIn(parentA1, plain.id, kidA1.id, { note: 'x' }).expect(400);
      // Somebody else's upload cannot be attached.
      const theirs = await upload(parentA2, 'homework-submission');
      await handIn(parentA1, hw.id, kidA1.id, { fileIds: [theirs] }).expect(
        400,
      );
    });

    it('handing in after the due day is allowed and flagged late', async () => {
      const hw = await make({ dueOn: today });
      // Make it past due without waiting.
      await prismaSvc.homework.update({
        where: { id: hw.id },
        data: { dueOn: new Date(`${addDays(today, -2)}T00:00:00.000Z`) },
      });
      const res = await handIn(studentA1, hw.id, kidA1.id, {
        note: 'sorry',
      }).expect(200);
      expect(res.body.late).toBe(true);
    });

    it('handing in again replaces the files; taking it back removes them', async () => {
      const hw = await make();
      const f1 = await upload(parentA1, 'homework-submission');
      const f2 = await upload(studentA1, 'homework-submission');
      await handIn(parentA1, hw.id, kidA1.id, { fileIds: [f1] }).expect(200);
      const again = await handIn(studentA1, hw.id, kidA1.id, {
        fileIds: [f2],
      }).expect(200);
      expect(again.body.files.map((f: { id: string }) => f.id)).toEqual([f2]);
      expect(await prismaSvc.storedFile.count({ where: { id: f1 } })).toBe(0);
      await parentA1
        .delete(`/api/homework/${hw.id}/students/${kidA1.id}/hand-in`)
        .expect(204);
      expect(await prismaSvc.storedFile.count({ where: { id: f2 } })).toBe(0);
      await parentA1
        .delete(`/api/homework/${hw.id}/students/${kidA1.id}/hand-in`)
        .expect(404);
    });
  });

  describe('marking', () => {
    it('the teacher marks with marks and feedback; the family is told; it is locked afterwards', async () => {
      const hw = await make();
      await handIn(parentA1, hw.id, kidA1.id, { note: 'here' }).expect(200);
      await review(parentA1, hw.id, kidA1.id, { status: 'REVIEWED' }).expect(
        403,
      );
      await review(teacherNone, hw.id, kidA1.id, { status: 'REVIEWED' }).expect(
        404,
      );
      await review(teacherA, hw.id, kidA1.id, {
        status: 'REVIEWED',
        marks: 11,
      }).expect(400);
      const res = await review(teacherA, hw.id, kidA1.id, {
        status: 'REVIEWED',
        marks: 8.5,
        feedback: 'Neat work',
      }).expect(200);
      expect(res.body).toMatchObject({
        status: 'REVIEWED',
        marks: '8.5',
        feedback: 'Neat work',
      });
      expect(
        (await inbox(parentA1)).some((n) => n.type === 'homework.reviewed'),
      ).toBe(true);
      await handIn(parentA1, hw.id, kidA1.id, { note: 'again' }).expect(400);
      await parentA1
        .delete(`/api/homework/${hw.id}/students/${kidA1.id}/hand-in`)
        .expect(400);
      // The maximum cannot change once marks are given.
      await teacherA
        .patch(`/api/homework/${hw.id}`)
        .send({ maxMarks: 20 })
        .expect(400);
      // Sending the same maximum again (as the edit form does) is fine.
      await teacherA
        .patch(`/api/homework/${hw.id}`)
        .send({ maxMarks: 10, title: 'Renamed' })
        .expect(200);
    });

    it('asking for it to be done again needs a reason and lets the student hand in once more', async () => {
      const hw = await make();
      await handIn(studentA1, hw.id, kidA1.id, { note: 'v1' }).expect(200);
      await review(teacherA, hw.id, kidA1.id, { status: 'REDO' }).expect(400);
      await review(teacherA, hw.id, kidA1.id, {
        status: 'REDO',
        marks: 3,
        feedback: 'x',
      }).expect(400);
      await review(teacherA, hw.id, kidA1.id, {
        status: 'REDO',
        feedback: 'Show your steps',
      }).expect(200);
      const again = await handIn(studentA1, hw.id, kidA1.id, {
        note: 'v2',
      }).expect(200);
      expect(again.body).toMatchObject({
        status: 'SUBMITTED',
        marks: null,
        feedback: null,
      });
    });

    it('marks need a hand-in homework with a maximum, and nothing handed in cannot be marked', async () => {
      const hw = await make({ maxMarks: undefined });
      await review(teacherA, hw.id, kidA2.id, { status: 'REVIEWED' }).expect(
        404,
      );
      await handIn(parentA2, hw.id, kidA2.id, { note: 'ok' }).expect(200);
      await review(teacherA, hw.id, kidA2.id, {
        status: 'REVIEWED',
        marks: 1,
      }).expect(400);
      await set(teacherA, { maxMarks: 5 }).expect(400);
    });
  });

  describe('reminders', () => {
    it('the day before the due day, families who have not handed in are reminded once', async () => {
      const hw = await make({ dueOn: addDays(today, 1) });
      await handIn(parentA1, hw.id, kidA1.id, { note: 'done' }).expect(200);
      const plain = (
        await set(teacherA, {
          dueOn: addDays(today, 1),
          title: unique('Plain'),
        }).expect(201)
      ).body;
      const before = async (who: Agent, id: string) =>
        (await inbox(who)).filter(
          (n) => n.type === 'homework.due_tomorrow' && n.title.includes(id),
        ).length;
      const svc = app.get(HomeworkService);
      expect(await svc.sendDueReminders()).toBeGreaterThanOrEqual(2);
      const titleOf = async (id: string) =>
        (await prismaSvc.homework.findUniqueOrThrow({ where: { id } })).title;
      const t1 = await titleOf(hw.id);
      const t2 = await titleOf(plain.id);
      // Hand-in homework: the family that handed in is spared, the other is reminded.
      expect(await before(parentA1, t1)).toBe(0);
      expect(await before(parentA2, t1)).toBe(1);
      // Plain homework: everyone is reminded.
      expect(await before(parentA1, t2)).toBe(1);
      expect(await before(parentB, t2)).toBe(0);
      // Running again sends nothing more.
      await svc.sendDueReminders();
      expect(await before(parentA2, t1)).toBe(1);
    });
  });
});
