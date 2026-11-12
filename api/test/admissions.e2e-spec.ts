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

type Schema = { sections: { fields: Record<string, unknown>[] }[] };

describe('admissions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Agent;
  let office: Agent;
  let classId: string;
  let otherClassId: string;
  let divisionId: string;
  let otherDivisionId: string;

  const answers = (over: Record<string, unknown> = {}) => ({
    classApplied: classId,
    surname: 'Shaikh',
    firstName: unique('Ayaan'),
    gender: 'MALE',
    dateOfBirth: '2021-06-15',
    undertakingReceived: true,
    ...over,
  });
  const create = (body: Record<string, unknown> = {}, who: Agent = office) =>
    who
      .post('/api/admissions/applications')
      .send({ answers: answers(), ...body });

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await adminAgent(app);
    office = (
      await createSettledUser(app, admin, 'OFFICE_STAFF', 'Front Office')
    ).agent;

    // An academic year that is current, and two classes with a division each.
    const years = (await admin.get('/api/academic-years').expect(200)).body as {
      isCurrent: boolean;
    }[];
    if (!years.some((y) => y.isCurrent)) {
      await admin
        .post('/api/academic-years')
        .send({
          name: unique('AY'),
          startDate: '2026-04-01',
          endDate: '2027-03-31',
          isCurrent: true,
        })
        .expect(201);
    }
    const mk = async (name: string) =>
      (await admin.post('/api/classes').send({ name }).expect(201)).body
        .id as string;
    classId = await mk(unique('Nursery'));
    otherClassId = await mk(unique('Std'));
    divisionId = (
      await admin
        .post(`/api/classes/${classId}/divisions`)
        .send({ name: 'A' })
        .expect(201)
    ).body.id;
    otherDivisionId = (
      await admin
        .post(`/api/classes/${otherClassId}/divisions`)
        .send({ name: 'A' })
        .expect(201)
    ).body.id;
  });
  afterAll(() => app.close());

  describe('who can do what', () => {
    it('office staff can read the form and take applications; accountants can only read; others are blocked', async () => {
      await office.get('/api/admissions/form').expect(200);

      const accountant = await createSettledUser(app, admin, 'ACCOUNTANT');
      await accountant.agent.get('/api/admissions/form').expect(200);
      await accountant.agent.get('/api/admissions/applications').expect(200);
      await create({}, accountant.agent).expect(403);

      for (const role of ['TEACHER', 'PARENT', 'STAFF']) {
        const user = await createSettledUser(app, admin, role);
        await user.agent.get('/api/admissions/applications').expect(403);
        await user.agent.get('/api/admissions/form').expect(403);
        await create({}, user.agent).expect(403);
      }
    });

    it('requires a login', async () => {
      const anonymous = (await import('supertest')).default(
        app.getHttpServer(),
      );
      await anonymous.get('/api/admissions/applications').expect(401);
    });
  });

  describe('taking an application', () => {
    it('saves a valid application and fills in the derived fields', async () => {
      const first = unique('Ayaan');
      const res = await create({
        answers: answers({ firstName: first, fatherName: 'Imran' }),
      }).expect(201);

      expect(res.body).toMatchObject({
        status: 'RECEIVED',
        studentName: `${first} Imran Shaikh`,
        class: { id: classId },
        editable: true,
      });
      expect(res.body.seq).toBeGreaterThanOrEqual(1);
      expect(res.body.formNo).toBe(String(res.body.seq));
      expect(res.body.dateOfBirth).toContain('2021-06-15');
      expect(res.body.allowedDecisions).toEqual([
        'UNDER_REVIEW',
        'GRANTED',
        'REFUSED',
        'WITHDRAWN',
      ]);
    });

    it('numbers applications one after another', async () => {
      const a = (await create().expect(201)).body.seq as number;
      const b = (await create().expect(201)).body.seq as number;
      expect(b).toBe(a + 1);
    });

    it('never gives two applications the same number, even when saved at the same moment', async () => {
      const results = await Promise.all(
        Array.from({ length: 12 }, () => create()),
      );
      expect(results.map((r) => r.status)).toEqual(Array(12).fill(201));
      expect(new Set(results.map((r) => r.body.seq)).size).toBe(12);
      expect(new Set(results.map((r) => r.body.formNo)).size).toBe(12);
    });

    it('skips a number the office already typed by hand when numbering automatically', async () => {
      const next = (await create().expect(201)).body.seq as number;
      // Type the number that the next automatic application would have received.
      await create({ formNo: String(next + 1) }).expect(201);
      const auto = (await create().expect(201)).body;
      expect(auto.formNo).not.toBe(String(next + 1));
      expect(auto.seq).toBeGreaterThan(next);
    });

    it('keeps the number printed on the paper form, and refuses a repeat', async () => {
      const no = unique('P');
      const res = await create({ formNo: no }).expect(201);
      expect(res.body.formNo).toBe(no);
      await create({ formNo: no }).expect(409);
    });

    it('explains which answers are wrong', async () => {
      const res = await create({
        answers: {
          classApplied: randomUUID(),
          dateOfBirth: '2021-02-30',
          gender: 'ROBOT',
        },
      }).expect(400);
      expect(res.body.errors).toMatchObject({
        classApplied: expect.stringMatching(/choose one/),
        dateOfBirth: expect.stringMatching(/valid date/),
        gender: expect.stringMatching(/choose one/),
        surname: expect.stringMatching(/required/),
        firstName: expect.stringMatching(/required/),
        undertakingReceived: expect.stringMatching(/ticked/),
      });
    });

    it('stores only the fields the form has', async () => {
      const res = await create({
        answers: answers({ hacked: 'yes', surname: '  Khan  ' }),
      }).expect(201);
      expect(res.body.answers).not.toHaveProperty('hacked');
      expect(res.body.answers.surname).toBe('Khan');
    });

    it('stores repeating groups and drops blank rows', async () => {
      const res = await create({
        answers: answers({
          siblings: [
            { name: 'Sara', age: 8, school: 'Hera', class: '3' },
            { name: '', age: null },
          ],
        }),
      }).expect(201);
      expect(res.body.answers.siblings).toEqual([
        { name: 'Sara', age: 8, school: 'Hera', class: '3' },
      ]);
    });

    it('rejects a request that is not shaped right', async () => {
      await office.post('/api/admissions/applications').send({}).expect(400);
      await office
        .post('/api/admissions/applications')
        .send({ answers: 'x' })
        .expect(400);
      await create({ receivedOn: 'yesterday' }).expect(400);
      await create({ extra: true }).expect(400);
    });

    it("will not use another school's academic year", async () => {
      const other = await prisma.school.create({
        data: { name: unique('Other'), code: unique('other').toLowerCase() },
      });
      const year = await prisma.academicYear.create({
        data: {
          schoolId: other.id,
          name: '2026-27',
          startDate: new Date('2026-04-01'),
          endDate: new Date('2027-03-31'),
        },
      });
      await create({ academicYearId: year.id }).expect(404);
    });
  });

  describe('finding applications', () => {
    it('lists, searches by name or form number, filters and pages', async () => {
      const tag = unique('Zq').replace(/-/g, '');
      for (let i = 0; i < 3; i++)
        await create({ answers: answers({ firstName: `${tag}${i}` }) }).expect(
          201,
        );

      const found = await office
        .get(`/api/admissions/applications?search=${tag}&pageSize=2`)
        .expect(200);
      expect(found.body.total).toBe(3);
      expect(found.body.items).toHaveLength(2);
      expect(found.body.items[0]).toMatchObject({
        class: { id: classId },
        status: 'RECEIVED',
      });

      const byNo = await office
        .get(
          `/api/admissions/applications?search=${found.body.items[0].formNo}`,
        )
        .expect(200);
      expect(byNo.body.total).toBeGreaterThanOrEqual(1);

      const none = await office
        .get(`/api/admissions/applications?search=${tag}&status=REFUSED`)
        .expect(200);
      expect(none.body.total).toBe(0);
      const byClass = await office
        .get(
          `/api/admissions/applications?search=${tag}&classId=${otherClassId}`,
        )
        .expect(200);
      expect(byClass.body.total).toBe(0);

      await office
        .get('/api/admissions/applications?status=NONSENSE')
        .expect(400);
      await office.get('/api/admissions/applications?pageSize=500').expect(400);
    });

    it('counts applications by status', async () => {
      const app1 = (await create().expect(201)).body.id as string;
      await office
        .post(`/api/admissions/applications/${app1}/decision`)
        .send({ decision: 'REFUSED' })
        .expect(200);
      const summary = (
        await office.get('/api/admissions/applications/summary').expect(200)
      ).body;
      expect(summary.total).toBeGreaterThan(0);
      expect(summary.counts.REFUSED).toBeGreaterThanOrEqual(1);
      expect(
        Object.values(summary.counts).reduce(
          (a, b) => (a as number) + (b as number),
          0,
        ),
      ).toBe(summary.total);
    });

    it('returns 404 for an unknown application and 400 for a malformed id', async () => {
      await office
        .get(`/api/admissions/applications/${randomUUID()}`)
        .expect(404);
      await office.get('/api/admissions/applications/nope').expect(400);
    });
  });

  describe('editing', () => {
    it('updates answers and refreshes the derived fields', async () => {
      const created = (await create().expect(201)).body;
      const res = await office
        .patch(`/api/admissions/applications/${created.id}`)
        .send({
          answers: answers({
            firstName: 'Zayd',
            surname: 'Ansari',
            classApplied: otherClassId,
          }),
        })
        .expect(200);
      expect(res.body).toMatchObject({
        studentName: 'Zayd Ansari',
        class: { id: otherClassId },
      });
    });

    it('still validates edits', async () => {
      const created = (await create().expect(201)).body;
      await office
        .patch(`/api/admissions/applications/${created.id}`)
        .send({ answers: { surname: 'x' } })
        .expect(400);
    });

    it('keeps the form number unique when it is changed', async () => {
      const a = (await create({ formNo: unique('A') }).expect(201)).body;
      const b = (await create().expect(201)).body;
      await office
        .patch(`/api/admissions/applications/${b.id}`)
        .send({ formNo: a.formNo })
        .expect(409);
    });
  });

  describe('deciding', () => {
    const decide = (id: string, body: object) =>
      office.post(`/api/admissions/applications/${id}/decision`).send(body);

    it('moves through review to granted, admitting to the class applied for by default', async () => {
      const id = (await create().expect(201)).body.id as string;
      const review = await decide(id, { decision: 'UNDER_REVIEW' }).expect(200);
      expect(review.body.status).toBe('UNDER_REVIEW');

      const granted = await decide(id, {
        decision: 'GRANTED',
        divisionId,
        note: 'Seat confirmed',
      }).expect(200);
      expect(granted.body.status).toBe('GRANTED');
      expect(granted.body.decision).toMatchObject({
        note: 'Seat confirmed',
        grantedClass: { id: classId },
        grantedDivision: { id: divisionId },
      });
      expect(granted.body.decision.decidedAt).toBeTruthy();
      expect(granted.body.editable).toBe(false);
      expect(granted.body.allowedDecisions).toEqual([]);
    });

    it('a granted application is final: no edits and no further decisions', async () => {
      const id = (await create().expect(201)).body.id as string;
      await decide(id, { decision: 'GRANTED' }).expect(200);
      await decide(id, { decision: 'REFUSED' }).expect(400);
      await decide(id, { decision: 'UNDER_REVIEW' }).expect(400);
      await office
        .patch(`/api/admissions/applications/${id}`)
        .send({ answers: answers() })
        .expect(400);
    });

    it('lets the school grant a different class than the one applied for', async () => {
      const id = (await create().expect(201)).body.id as string;
      const res = await decide(id, {
        decision: 'GRANTED',
        classId: otherClassId,
        divisionId: otherDivisionId,
      }).expect(200);
      expect(res.body.decision.grantedClass.id).toBe(otherClassId);
    });

    it('checks the class and division when granting', async () => {
      const id = (await create().expect(201)).body.id as string;
      await decide(id, {
        decision: 'GRANTED',
        divisionId: otherDivisionId,
      }).expect(400); // division of another class
      await decide(id, { decision: 'GRANTED', classId: randomUUID() }).expect(
        400,
      );
      await decide(id, {
        decision: 'GRANTED',
        divisionId: randomUUID(),
      }).expect(400);
    });

    it('a refused or withdrawn application can be reopened', async () => {
      const id = (await create().expect(201)).body.id as string;
      await decide(id, { decision: 'REFUSED', note: 'No seats' }).expect(200);
      await decide(id, { decision: 'GRANTED' }).expect(400); // must be reviewed again first
      const reopened = await decide(id, { decision: 'UNDER_REVIEW' }).expect(
        200,
      );
      expect(reopened.body.decision.decidedAt).toBeNull();
      await decide(id, { decision: 'WITHDRAWN' }).expect(200);
    });

    it('rejects an unknown decision', async () => {
      const id = (await create().expect(201)).body.id as string;
      await decide(id, { decision: 'MAYBE' }).expect(400);
      await decide(id, {}).expect(400);
    });

    it('is recorded in the audit log', async () => {
      const id = (await create().expect(201)).body.id as string;
      await decide(id, { decision: 'GRANTED' }).expect(200);
      const log = await admin
        .get('/api/audit-logs?action=admissions.&pageSize=100')
        .expect(200);
      const entry = log.body.items.find(
        (i: { entityId: string; action: string }) =>
          i.entityId === id && i.action === 'admissions.decided',
      );
      expect(entry).toBeDefined();
    });
  });

  describe('school isolation', () => {
    it("never shows or changes another school's applications", async () => {
      const other = await prisma.school.create({
        data: { name: unique('Other'), code: unique('other').toLowerCase() },
      });
      const year = await prisma.academicYear.create({
        data: {
          schoolId: other.id,
          name: '2026-27',
          startDate: new Date('2026-04-01'),
          endDate: new Date('2027-03-31'),
        },
      });
      const form = await prisma.formDefinition.create({
        data: {
          schoolId: other.id,
          key: 'admission',
          version: 1,
          name: 'x',
          status: 'PUBLISHED',
          schema: { sections: [] },
        },
      });
      const foreign = await prisma.application.create({
        data: {
          schoolId: other.id,
          academicYearId: year.id,
          formId: form.id,
          seq: 1,
          formNo: '1',
          receivedOn: new Date('2026-06-01'),
          studentName: 'Foreign Child',
          answers: {},
          createdById: randomUUID(),
        },
      });

      await office
        .get(`/api/admissions/applications/${foreign.id}`)
        .expect(404);
      await office
        .patch(`/api/admissions/applications/${foreign.id}`)
        .send({ formNo: 'X' })
        .expect(404);
      await office
        .post(`/api/admissions/applications/${foreign.id}/decision`)
        .send({ decision: 'GRANTED' })
        .expect(404);
      const list = await office
        .get('/api/admissions/applications?search=Foreign&pageSize=100')
        .expect(200);
      expect(list.body.total).toBe(0);
    });
  });

  describe('changing the form later', () => {
    it('old applications keep the version they were filled in with; new ones follow the new version', async () => {
      const old = (await create().expect(201)).body;
      const oldVersion = old.form.version as number;

      // Publish a new version that adds a required question.
      const draft = (await admin.post('/api/forms/admission/draft').expect(200))
        .body;
      const schema = structuredClone(draft.schema) as Schema;
      schema.sections[0].fields.push({
        id: 'siblingAtSchool',
        type: 'checkbox',
        label: 'Sibling studies here',
        required: true,
      });
      await admin
        .put('/api/forms/admission/draft')
        .send({ schema })
        .expect(200);
      await admin.post('/api/forms/admission/publish').expect(200);

      // New applications now need the new answer.
      const missing = await create().expect(400);
      expect(missing.body.errors.siblingAtSchool).toMatch(/ticked/);
      await create({ answers: answers({ siblingAtSchool: true }) }).expect(201);

      // The old application still shows its own version and can still be edited without it.
      const reread = (
        await office.get(`/api/admissions/applications/${old.id}`).expect(200)
      ).body;
      expect(reread.form.version).toBe(oldVersion);
      expect(JSON.stringify(reread.form.schema)).not.toContain(
        'siblingAtSchool',
      );
      await office
        .patch(`/api/admissions/applications/${old.id}`)
        .send({ answers: answers({ firstName: 'Edited' }) })
        .expect(200);

      // Put the form back the way it was so later tests are unaffected.
      const again = (await admin.post('/api/forms/admission/draft').expect(200))
        .body;
      const restored = structuredClone(again.schema) as Schema;
      restored.sections[0].fields = restored.sections[0].fields.filter(
        (f) => f.id !== 'siblingAtSchool',
      );
      await admin
        .put('/api/forms/admission/draft')
        .send({ schema: restored })
        .expect(200);
      await admin.post('/api/forms/admission/publish').expect(200);
      await create().expect(201);
    });
  });
});
