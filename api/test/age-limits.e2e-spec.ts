import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
  unique,
} from './helpers.js';

describe('age limits (e2e)', () => {
  let app: INestApplication;
  let admin: Agent;
  let office: Agent;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    admin = await adminAgent(app);
    office = (await createSettledUser(app, admin, 'OFFICE_STAFF')).agent;
  });
  afterAll(() => app.close());

  const newClass = async (body: Record<string, unknown> = {}) =>
    (
      await admin
        .post('/api/classes')
        .send({ name: unique('Cls'), ...body })
        .expect(201)
    ).body as {
      id: string;
      name: string;
      minAgeYears: number | null;
      admissionsOpen: boolean;
    };

  const currentYear = async () => {
    const years = (await admin.get('/api/academic-years').expect(200)).body as {
      id: string;
      isCurrent: boolean;
    }[];
    return (years.find((y) => y.isCurrent) ??
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
      ).body) as { id: string };
  };

  describe('class settings', () => {
    it('a class starts with no age rule and open for admission', async () => {
      const cls = await newClass();
      expect(cls).toMatchObject({ minAgeYears: null, admissionsOpen: true });
    });

    it('sets, changes and removes the minimum age, and opens or closes admissions', async () => {
      const cls = await newClass({ minAgeYears: 3, admissionsOpen: false });
      expect(cls).toMatchObject({ minAgeYears: 3, admissionsOpen: false });

      const changed = await admin
        .patch(`/api/classes/${cls.id}`)
        .send({ minAgeYears: 4, admissionsOpen: true })
        .expect(200);
      expect(changed.body).toMatchObject({
        minAgeYears: 4,
        admissionsOpen: true,
      });

      const removed = await admin
        .patch(`/api/classes/${cls.id}`)
        .send({ minAgeYears: null })
        .expect(200);
      expect(removed.body.minAgeYears).toBeNull();
      expect(removed.body.admissionsOpen).toBe(true); // untouched

      const listed = (await admin.get('/api/classes').expect(200)).body as {
        id: string;
        minAgeYears: number | null;
      }[];
      expect(listed.find((c) => c.id === cls.id)?.minAgeYears).toBeNull();
    });

    it('rejects an age that makes no sense', async () => {
      const cls = await newClass();
      for (const bad of [-1, 26, 3.5, 'three']) {
        await admin
          .patch(`/api/classes/${cls.id}`)
          .send({ minAgeYears: bad })
          .expect(400);
      }
      await admin
        .patch(`/api/classes/${cls.id}`)
        .send({ admissionsOpen: 'yes' })
        .expect(400);
    });

    it('only people who may manage academic setup can change it', async () => {
      const cls = await newClass();
      const teacher = await createSettledUser(app, admin, 'TEACHER');
      await teacher.agent
        .patch(`/api/classes/${cls.id}`)
        .send({ minAgeYears: 3 })
        .expect(403);
      await teacher.agent.get('/api/classes').expect(200); // but may read them
    });
  });

  describe('the date ages are counted on', () => {
    it('is set on an academic year, can be changed and cleared', async () => {
      const year = await admin
        .post('/api/academic-years')
        .send({
          name: unique('AY'),
          startDate: '2030-04-01',
          endDate: '2031-03-31',
          ageCutoffDate: '2030-07-31',
        })
        .expect(201);
      expect(year.body.ageCutoffDate).toContain('2030-07-31');

      const changed = await admin
        .patch(`/api/academic-years/${year.body.id}`)
        .send({ ageCutoffDate: '2030-06-01' })
        .expect(200);
      expect(changed.body.ageCutoffDate).toContain('2030-06-01');

      const untouched = await admin
        .patch(`/api/academic-years/${year.body.id}`)
        .send({ name: unique('Renamed') })
        .expect(200);
      expect(untouched.body.ageCutoffDate).toContain('2030-06-01');

      const cleared = await admin
        .patch(`/api/academic-years/${year.body.id}`)
        .send({ ageCutoffDate: null })
        .expect(200);
      expect(cleared.body.ageCutoffDate).toBeNull();
    });

    it('rejects a date that is not a date', async () => {
      await admin
        .post('/api/academic-years')
        .send({
          name: unique('AY'),
          startDate: '2030-04-01',
          endDate: '2031-03-31',
          ageCutoffDate: 'July',
        })
        .expect(400);
    });
  });

  describe('eligibility advice', () => {
    const ask = (who: Agent, query: string) =>
      who.get(`/api/admissions/eligibility?${query}`);

    it('says a child who is old enough is eligible, and counts age on the receive date by default', async () => {
      await currentYear();
      const cls = await newClass({ minAgeYears: 3 });
      const res = await ask(
        office,
        `classId=${cls.id}&dateOfBirth=2023-07-31&receivedOn=2026-07-31`,
      ).expect(200);
      expect(res.body).toMatchObject({
        eligible: true,
        issues: [],
        ageMonths: 36,
        ageText: '3 years 0 months',
      });
    });

    it('flags a child who is a day too young, in plain words', async () => {
      const cls = await newClass({ minAgeYears: 3 });
      const res = await ask(
        office,
        `classId=${cls.id}&dateOfBirth=2023-08-01&receivedOn=2026-07-31`,
      ).expect(200);
      expect(res.body.eligible).toBe(false);
      expect(res.body.issues[0]).toMatch(
        /2 years 11 months old as on 2026-07-31, and .* needs at least 3 years/,
      );
    });

    it('flags a class that is not open for admission', async () => {
      const cls = await newClass({ minAgeYears: 3, admissionsOpen: false });
      const res = await ask(
        office,
        `classId=${cls.id}&dateOfBirth=2021-01-01&receivedOn=2026-07-31`,
      ).expect(200);
      expect(res.body.issues.join()).toMatch(/not open/);
    });

    it('has no age rule for a class without a minimum age', async () => {
      const cls = await newClass();
      const res = await ask(
        office,
        `classId=${cls.id}&dateOfBirth=2026-01-01&receivedOn=2026-07-31`,
      ).expect(200);
      expect(res.body.eligible).toBe(true);
    });

    it("counts age on the academic year's date when one is set", async () => {
      const year = await currentYear();
      const cls = await newClass({ minAgeYears: 3 });
      await admin
        .patch(`/api/academic-years/${year.id}`)
        .send({ ageCutoffDate: '2026-07-31' })
        .expect(200);
      try {
        // Born 2023-08-15: too young on 31 July even though they turn 3 before the form date.
        const res = await ask(
          office,
          `classId=${cls.id}&dateOfBirth=2023-08-15&receivedOn=2026-09-01`,
        ).expect(200);
        expect(res.body).toMatchObject({ eligible: false, asOn: '2026-07-31' });
      } finally {
        await admin
          .patch(`/api/academic-years/${year.id}`)
          .send({ ageCutoffDate: null })
          .expect(200);
      }
    });

    it('validates the request and is only for people who may read admissions', async () => {
      const cls = await newClass({ minAgeYears: 3 });
      await ask(office, `classId=${cls.id}`).expect(400);
      await ask(office, `classId=nope&dateOfBirth=2023-01-01`).expect(400);
      await ask(office, `classId=${cls.id}&dateOfBirth=2023-02-30`).expect(400);
      await ask(
        office,
        `classId=${randomUUID()}&dateOfBirth=2023-01-01`,
      ).expect(404);
      const teacher = await createSettledUser(app, admin, 'TEACHER');
      await ask(
        teacher.agent,
        `classId=${cls.id}&dateOfBirth=2023-01-01`,
      ).expect(403);
    });
  });

  describe('on an application', () => {
    const answers = (classId: string, dob: string) => ({
      classApplied: classId,
      surname: unique('Shaikh'),
      firstName: 'Ayaan',
      gender: 'MALE',
      dateOfBirth: dob,
      undertakingReceived: true,
    });

    it('is shown as advice, and never stops the application being saved', async () => {
      await currentYear();
      const cls = await newClass({ minAgeYears: 3, admissionsOpen: false });
      const res = await office
        .post('/api/admissions/applications')
        .send({
          receivedOn: '2026-07-31',
          answers: answers(cls.id, '2026-01-01'),
        })
        .expect(201);
      expect(res.body.eligibility.eligible).toBe(false);
      expect(res.body.eligibility.issues).toHaveLength(2);
      expect(res.body.status).toBe('RECEIVED');
    });

    it('says nothing is wrong for a child who is eligible', async () => {
      const cls = await newClass({ minAgeYears: 3 });
      const res = await office
        .post('/api/admissions/applications')
        .send({
          receivedOn: '2026-07-31',
          answers: answers(cls.id, '2021-01-01'),
        })
        .expect(201);
      expect(res.body.eligibility).toMatchObject({
        eligible: true,
        issues: [],
      });
    });

    it("changes when the class's rule changes later", async () => {
      const cls = await newClass({ minAgeYears: 3 });
      const created = (
        await office
          .post('/api/admissions/applications')
          .send({
            receivedOn: '2026-07-31',
            answers: answers(cls.id, '2022-01-01'),
          })
          .expect(201)
      ).body;
      expect(created.eligibility.eligible).toBe(true);
      await admin
        .patch(`/api/classes/${cls.id}`)
        .send({ minAgeYears: 5 })
        .expect(200);
      const again = (
        await office
          .get(`/api/admissions/applications/${created.id}`)
          .expect(200)
      ).body;
      expect(again.eligibility.eligible).toBe(false);
    });

    it('does not leak class settings into the applications list', async () => {
      const list = (
        await office.get('/api/admissions/applications?pageSize=5').expect(200)
      ).body;
      for (const item of list.items) {
        expect(Object.keys(item.academicYear).sort()).toEqual(['id', 'name']);
        if (item.class)
          expect(Object.keys(item.class).sort()).toEqual(['id', 'name']);
      }
    });
  });

  describe('on the form', () => {
    it('the published admission form has the age limits table', async () => {
      const form = (await office.get('/api/admissions/form').expect(200)).body;
      const types = (
        form.schema.sections as { fields: { type: string }[] }[]
      ).flatMap((s) => s.fields.map((f) => f.type));
      expect(types).toContain('ageLimits');
    });

    it('can be added to a form in the builder, and takes no answer', async () => {
      const draft = (await admin.post('/api/forms/admission/draft').expect(200))
        .body;
      const schema = structuredClone(draft.schema) as {
        sections: { fields: Record<string, unknown>[] }[];
      };
      const id = `limits${Date.now().toString(36)}`;
      schema.sections[0].fields.push({
        id,
        type: 'ageLimits',
        label: 'Ages',
        required: true,
      });
      const saved = await admin
        .put('/api/forms/admission/draft')
        .send({ schema })
        .expect(200);
      const field = (
        saved.body.schema.sections as {
          fields: { id: string; required?: boolean }[];
        }[]
      )
        .flatMap((s) => s.fields)
        .find((f) => f.id === id);
      expect(field?.required).toBeUndefined();
      await admin.delete('/api/forms/admission/draft').expect(204);
    });
  });
});
