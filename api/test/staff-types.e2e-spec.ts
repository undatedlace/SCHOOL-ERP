import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
  loginAndSettle,
  unique,
} from './helpers.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { makeImage } from './support/images.js';
import { makePdf } from './support/pdfs.js';

describe('staff types and onboarding forms (e2e)', () => {
  let app: INestApplication;
  let superAdmin: Agent;
  let schoolAdmin: Agent;
  let office: Agent;
  let accountant: Agent;
  let teacher: Agent;
  let teacherStaffId: string;
  let teacherTypeId: string;
  let clerkTypeId: string;

  const types = async (who = superAdmin, qs = '') =>
    (await who.get(`/api/staff-types${qs}`).expect(200)).body as {
      id: string;
      name: string;
      isTeaching: boolean;
      active: boolean;
      formKey: string;
      staffCount: number;
    }[];

  const uploadDoc = async (who: Agent, purpose = 'staff-document') =>
    who
      .post('/api/files')
      .field('purpose', purpose)
      .attach('file', await makePdf(1), { filename: 'paper.pdf' });

  const newStaff = (
    over: Record<string, unknown> = {},
    who: Agent = schoolAdmin,
  ) =>
    who.post('/api/staff').send({
      firstName: 'Asha',
      surname: unique('Rao'),
      gender: 'FEMALE',
      designation: 'Teacher',
      email: `${unique('s')}@test.local`,
      ...over,
    });

  beforeAll(async () => {
    const made = await createTestApp();
    app = made.app;
    superAdmin = await adminAgent(app);
    schoolAdmin = (await createSettledUser(app, superAdmin, 'SCHOOL_ADMIN'))
      .agent;
    office = (await createSettledUser(app, superAdmin, 'OFFICE_STAFF')).agent;
    accountant = (await createSettledUser(app, superAdmin, 'ACCOUNTANT')).agent;

    const all = await types();
    teacherTypeId = all.find((t) => t.name === 'Teacher')!.id;
    clerkTypeId = all.find((t) => t.name === 'Clerk')!.id;

    const email = `${unique('t')}@test.local`;
    const created = (
      await newStaff({
        email,
        staffTypeId: teacherTypeId,
        account: { roleCodes: ['TEACHER'] },
      }).expect(201)
    ).body;
    teacherStaffId = created.id;
    teacher = await loginAndSettle(
      app,
      email,
      created.temporaryPassword,
      'Teacher-Pass-123',
    );
  });
  afterAll(() => app.close());

  describe('the types', () => {
    it('start with Teacher, Clerk and Peon, and everyone who reads staff can list the active ones', async () => {
      const names = (await types(teacher)).map((t) => t.name);
      expect(names).toEqual(
        expect.arrayContaining(['Teacher', 'Clerk', 'Peon']),
      );
      expect((await types()).find((t) => t.name === 'Teacher')).toMatchObject({
        isTeaching: true,
      });
      await accountant.get('/api/staff-types').expect(403);
    });

    it('a School Admin adds, renames and switches off a type; nobody else can', async () => {
      const name = unique('Driver');
      const t = (
        await schoolAdmin.post('/api/staff-types').send({ name }).expect(201)
      ).body;
      expect(t).toMatchObject({ name, isTeaching: false, active: true });
      expect(t.formKey).toBe(`staff-${t.id}`);
      await schoolAdmin.post('/api/staff-types').send({ name }).expect(409);
      for (const who of [office, accountant, teacher]) {
        await who
          .post('/api/staff-types')
          .send({ name: unique('X') })
          .expect(403);
        await who
          .patch(`/api/staff-types/${t.id}`)
          .send({ active: false })
          .expect(403);
      }
      const renamed = unique('Bus driver');
      expect(
        (
          await schoolAdmin
            .patch(`/api/staff-types/${t.id}`)
            .send({ name: renamed, isTeaching: true })
            .expect(200)
        ).body,
      ).toMatchObject({ name: renamed, isTeaching: true });
      await schoolAdmin
        .patch(`/api/staff-types/${t.id}`)
        .send({ active: false })
        .expect(200);
      expect((await types(teacher)).some((x) => x.id === t.id)).toBe(false);
      expect(
        (await types(schoolAdmin, '?all=true')).some((x) => x.id === t.id),
      ).toBe(true);
      // Someone who cannot set types up never sees switched-off ones, even by asking.
      expect(
        (await types(teacher, '?all=true')).some((x) => x.id === t.id),
      ).toBe(false);
      await schoolAdmin
        .post('/api/staff-types')
        .send({ name: 'x' })
        .expect(400);
      await schoolAdmin
        .patch(`/api/staff-types/${randomUUID()}`)
        .send({ active: true })
        .expect(404);
    });
  });

  describe("each type's onboarding form", () => {
    it('is published as version 1 when the type exists, from the template that fits the work', async () => {
      const list = (await superAdmin.get('/api/forms').expect(200)).body as {
        key: string;
        publishedVersion: number | null;
      }[];
      const ids = async (typeId: string) => {
        const form = (
          await superAdmin.get(`/api/forms/staff-${typeId}`).expect(200)
        ).body;
        expect(form.published.status).toBe('PUBLISHED');
        return (
          form.published.schema.sections as { fields: { id: string }[] }[]
        ).flatMap((sec) => sec.fields.map((f) => f.id));
      };
      for (const typeId of [teacherTypeId, clerkTypeId]) {
        const row = list.find((f) => f.key === `staff-${typeId}`);
        expect(row?.publishedVersion).not.toBeNull();
      }
      // The seeded types and types added later start from the same kind of template.
      const teacherIds = await ids(teacherTypeId);
      expect(teacherIds).toEqual(
        expect.arrayContaining(['qualificationList', 'degreeCertificates']),
      );
      const clerkIds = await ids(clerkTypeId);
      expect(clerkIds).not.toContain('degreeCertificates');
      expect(clerkIds).toEqual(
        expect.arrayContaining([
          'skills',
          'qualificationCertificate',
          'idProof',
        ]),
      );

      const driver = (
        await schoolAdmin
          .post('/api/staff-types')
          .send({ name: unique('Driver') })
          .expect(201)
      ).body;
      const driverIds = await ids(driver.id);
      expect(driverIds).toContain('policeVerification');
      expect(driverIds).not.toContain('skills');
      expect(
        (
          (await superAdmin.get('/api/forms').expect(200)).body as {
            key: string;
            publishedVersion: number | null;
          }[]
        ).find((f) => f.key === driver.formKey)?.publishedVersion,
      ).toBe(1);

      const teacherTwo = (
        await schoolAdmin
          .post('/api/staff-types')
          .send({ name: unique('Tutor'), isTeaching: true })
          .expect(201)
      ).body;
      expect(await ids(teacherTwo.id)).toContain('eligibilityCertificate');
    });

    it('an admin edits and publishes it; nobody without forms.manage can, and unknown keys are refused', async () => {
      const type = (
        await schoolAdmin
          .post('/api/staff-types')
          .send({ name: unique('Lab') })
          .expect(201)
      ).body;
      const draft = (
        await schoolAdmin.post(`/api/forms/${type.formKey}/draft`).expect(200)
      ).body;
      const schema = draft.schema;
      schema.sections[0].fields.push({
        id: 'labSafety',
        type: 'document',
        label: 'Lab safety certificate',
        required: true,
      });
      await schoolAdmin
        .put(`/api/forms/${type.formKey}/draft`)
        .send({ schema })
        .expect(200);
      const live = (
        await schoolAdmin.post(`/api/forms/${type.formKey}/publish`).expect(200)
      ).body;
      // Version 1 was published with the type; the admin's change is version 2.
      expect(live.version).toBe(2);
      for (const who of [office, teacher])
        await who.get(`/api/forms/${type.formKey}`).expect(403);
      await schoolAdmin.get(`/api/forms/staff-${randomUUID()}`).expect(404);
      await schoolAdmin.get('/api/forms/staff-not-an-id').expect(404);
    });
  });

  describe('staff with a type and details', () => {
    it('saves details against the form, and only an administrator can read them', async () => {
      const res = await newStaff({
        staffTypeId: teacherTypeId,
        answers: {
          subjects: 'Maths, Science',
          experienceYears: 7,
          bogus: 'dropped',
        },
      }).expect(201);
      expect(res.body.staffType).toMatchObject({
        name: 'Teacher',
        isTeaching: true,
      });
      expect(res.body.onboarding.answers).toEqual({
        subjects: 'Maths, Science',
        experienceYears: 7,
      });
      expect(res.body.onboarding.version).toBeGreaterThanOrEqual(1);
      expect(res.body.onboarding.schema.sections.length).toBeGreaterThan(0);

      // The teacher reading their own record does not get the papers; office has no access to details.
      const own = (
        await teacher.get(`/api/staff/${teacherStaffId}`).expect(200)
      ).body;
      expect(own.onboarding).toBeNull();
      expect(own.staffType.name).toBe('Teacher');
      expect(
        (await office.get(`/api/staff/${res.body.id}`).expect(200)).body
          .onboarding,
      ).toBeNull();
    });

    it('checks the answers: numbers in range, a real type, and a type before any details', async () => {
      const bad = await newStaff({
        staffTypeId: teacherTypeId,
        answers: { experienceYears: 99 },
      }).expect(400);
      expect(bad.body.message).toMatch(/at most 60/);
      await newStaff({ staffTypeId: randomUUID() }).expect(400);
      await newStaff({ answers: { subjects: 'x' } }).expect(400);
      const off = (
        await schoolAdmin
          .post('/api/staff-types')
          .send({ name: unique('Old') })
          .expect(201)
      ).body;
      await schoolAdmin
        .patch(`/api/staff-types/${off.id}`)
        .send({ active: false })
        .expect(200);
      await newStaff({ staffTypeId: off.id }).expect(400);
    });

    it('stores a document by its file id, and only administrators can read the file', async () => {
      const up = await uploadDoc(schoolAdmin);
      expect(up.status).toBe(201);
      const res = await newStaff({
        staffTypeId: teacherTypeId,
        answers: { idProof: up.body.id },
      }).expect(201);
      expect(res.body.onboarding.answers.idProof).toBe(up.body.id);
      await schoolAdmin.get(`/api/files/${up.body.id}`).expect(200);
      for (const who of [teacher, office, accountant]) {
        await who.get(`/api/files/${up.body.id}`).expect(404);
      }
    });

    it('refuses a document that was not uploaded as a staff document, or by someone who may not', async () => {
      const wrongPurpose = await schoolAdmin
        .post('/api/files')
        .field('purpose', 'staff-photo')
        .attach('file', await makeImage('png'), { filename: 'p.png' })
        .expect(201);
      const r = await newStaff({
        staffTypeId: teacherTypeId,
        answers: { idProof: wrongPurpose.body.id },
      }).expect(400);
      expect(r.body.message).toMatch(/upload the document again/i);
      await newStaff({
        staffTypeId: teacherTypeId,
        answers: { idProof: randomUUID() },
      }).expect(400);
      for (const who of [office, teacher, accountant]) {
        expect((await uploadDoc(who)).status).toBe(403);
      }
    });

    it('a required document is enforced for new staff, while earlier staff keep the form they were filled in with', async () => {
      const type = (
        await schoolAdmin
          .post('/api/staff-types')
          .send({ name: unique('Guard') })
          .expect(201)
      ).body;
      const first = await newStaff({
        staffTypeId: type.id,
        answers: {},
      }).expect(201);
      const v1 = first.body.onboarding.version;
      const draft = (
        await schoolAdmin.post(`/api/forms/${type.formKey}/draft`).expect(200)
      ).body;
      draft.schema.sections[0].fields.push({
        id: 'policeCheck',
        type: 'text',
        label: 'Police verification no.',
        required: true,
      });
      await schoolAdmin
        .put(`/api/forms/${type.formKey}/draft`)
        .send({ schema: draft.schema })
        .expect(200);
      const v2 = (
        await schoolAdmin.post(`/api/forms/${type.formKey}/publish`).expect(200)
      ).body.version;
      expect(v2).toBeGreaterThan(v1);

      // New staff must answer the new question.
      const missing = await newStaff({
        staffTypeId: type.id,
        answers: {},
      }).expect(400);
      expect(missing.body.message).toMatch(
        /Police verification no\. is required/,
      );
      const ok = await newStaff({
        staffTypeId: type.id,
        answers: { policeCheck: 'PV-123' },
      }).expect(201);
      expect(ok.body.onboarding.version).toBe(v2);

      // The earlier person is still on version 1 and can be edited without the new question.
      const same = (
        await schoolAdmin.get(`/api/staff/${first.body.id}`).expect(200)
      ).body;
      expect(same.onboarding.version).toBe(v1);
      await schoolAdmin
        .patch(`/api/staff/${first.body.id}`)
        .send({ answers: { experienceYears: 3 } })
        .expect(200);
    });

    it('changes details, keeps them when only the type is repeated, and starts afresh for a new type', async () => {
      const s = (
        await newStaff({
          staffTypeId: teacherTypeId,
          answers: { subjects: 'Maths' },
        }).expect(201)
      ).body;
      const changed = await schoolAdmin
        .patch(`/api/staff/${s.id}`)
        .send({ answers: { subjects: 'History', levels: 'Std 1 to 5' } })
        .expect(200);
      expect(changed.body.onboarding.answers).toEqual({
        subjects: 'History',
        levels: 'Std 1 to 5',
      });

      const repeated = await schoolAdmin
        .patch(`/api/staff/${s.id}`)
        .send({ staffTypeId: teacherTypeId })
        .expect(200);
      expect(repeated.body.onboarding.answers.subjects).toBe('History');

      const moved = await schoolAdmin
        .patch(`/api/staff/${s.id}`)
        .send({
          staffTypeId: clerkTypeId,
          answers: { skills: 'Tally' },
        })
        .expect(200);
      expect(moved.body.staffType.name).toBe('Clerk');
      expect(moved.body.onboarding.answers).toEqual({ skills: 'Tally' });

      await office
        .patch(`/api/staff/${s.id}`)
        .send({ answers: { x: 1 } })
        .expect(403);
    });

    it('someone with no type cannot be given details, but can be edited as before', async () => {
      const s = (await newStaff().expect(201)).body;
      expect(s.staffType).toBeNull();
      expect(s.onboarding).toBeNull();
      await schoolAdmin
        .patch(`/api/staff/${s.id}`)
        .send({ answers: { subjects: 'x' } })
        .expect(400);
      await schoolAdmin
        .patch(`/api/staff/${s.id}`)
        .send({ designation: 'Senior clerk' })
        .expect(200);
    });
  });

  it("the staff list filters by type and shows each person's type", async () => {
    const clerk = (
      await newStaff({
        staffTypeId: clerkTypeId,
        designation: unique('Clerk'),
      }).expect(201)
    ).body;
    const res = await schoolAdmin
      .get(`/api/staff?staffTypeId=${clerkTypeId}&pageSize=100`)
      .expect(200);
    const ids = res.body.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(clerk.id);
    expect(
      res.body.items.every(
        (i: { staffType: { id: string } }) => i.staffType.id === clerkTypeId,
      ),
    ).toBe(true);
    await schoolAdmin.get('/api/staff?staffTypeId=nope').expect(400);
  });
});

describe('the form to fill in for a staff type (e2e)', () => {
  let app: INestApplication;
  let admin: Agent;
  let office: Agent;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await adminAgent(app);
    office = (await createSettledUser(app, admin, 'OFFICE_STAFF')).agent;
  });
  afterAll(() => app.close());

  it('returns the live form, or the starting form when none is published, to people who manage staff', async () => {
    const type = (
      await admin
        .post('/api/staff-types')
        .send({ name: unique('Cook') })
        .expect(201)
    ).body;
    const first = (
      await admin.get(`/api/staff-types/${type.id}/form`).expect(200)
    ).body;
    expect(first.version).toBe(1);
    expect(first.schema.sections.length).toBeGreaterThan(0);
    await office.get(`/api/staff-types/${type.id}/form`).expect(403);
    await admin.get(`/api/staff-types/${randomUUID()}/form`).expect(404);
  });

  it('numbers a draft that was started before the live version after it, so versions only go up', async () => {
    const type = (
      await admin
        .post('/api/staff-types')
        .send({ name: unique('Warden') })
        .expect(201)
    ).body;
    // A database from before forms were published with the type: only a draft numbered 1 exists.
    await prisma.formDefinition.updateMany({
      where: { key: type.formKey },
      data: { status: 'DRAFT', publishedAt: null },
    });
    // The first person added publishes the starting form (as version 2), as it always has.
    const person = await admin
      .post('/api/staff')
      .send({
        firstName: 'Ravi',
        surname: unique('Kale'),
        gender: 'MALE',
        designation: 'Warden',
        staffTypeId: type.id,
        answers: {},
      })
      .expect(201);
    expect(person.body.onboarding.version).toBe(2);

    const live = (
      await admin.post(`/api/forms/${type.formKey}/publish`).expect(200)
    ).body;
    expect(live.version).toBe(3);
    const detail = (await admin.get(`/api/forms/${type.formKey}`).expect(200))
      .body;
    expect(detail.published.version).toBe(3);
    expect(detail.draft).toBeNull();
  });
});
