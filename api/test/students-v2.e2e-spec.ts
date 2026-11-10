import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/database/prisma.service.js';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
  loginAndSettle,
  newAgent,
  unique,
} from './helpers.js';

const mobile = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;

describe('students v2 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let superAdmin: Agent;
  let schoolAdmin: Agent;
  let office: Agent;
  let accountant: Agent;
  let teacher: Agent; // teaches nobody
  let classA: string;
  let classB: string;
  let divA: string;
  let divA2: string;
  let divB: string;

  interface Kid {
    id: string;
    admissionNo: string;
    guardianId: string;
    mobile: string;
    surname: string;
  }

  async function admit(division = divA, cls = classA): Promise<Kid> {
    const surname = unique('Vee');
    const app1 = (
      await office
        .post('/api/admissions/applications')
        .send({
          answers: {
            classApplied: cls,
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
        divisionId: division,
        guardians: [
          { fullName: 'Imran Shaikh', relationship: 'FATHER', mobile: m },
        ],
      })
      .expect(201);
    const detail = (
      await office.get(`/api/students/${res.body.studentId}`).expect(200)
    ).body;
    return {
      id: res.body.studentId,
      admissionNo: res.body.admissionNo,
      guardianId: detail.guardians[0].id,
      mobile: m,
      surname,
    };
  }

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    superAdmin = await adminAgent(app);
    schoolAdmin = (await createSettledUser(app, superAdmin, 'SCHOOL_ADMIN'))
      .agent;
    office = (await createSettledUser(app, superAdmin, 'OFFICE_STAFF')).agent;
    accountant = (await createSettledUser(app, superAdmin, 'ACCOUNTANT')).agent;
    teacher = (await createSettledUser(app, superAdmin, 'TEACHER')).agent;

    const years = (await superAdmin.get('/api/academic-years').expect(200))
      .body as {
      isCurrent: boolean;
    }[];
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
  });
  afterAll(async () => {
    // Leave the school's settings as they were for the other suites.
    await superAdmin.patch('/api/school').send({
      studentIdPrefix: '',
      studentEmailDomain: '',
      studentIdDigits: 4,
    });
    await app.close();
  });

  describe('removing and restoring', () => {
    it('an admin removes a student with a reason; they leave the lists but are kept', async () => {
      const k = await admit();
      const res = await schoolAdmin
        .post(`/api/students/${k.id}/remove`)
        .send({ reason: 'Admitted twice by mistake' })
        .expect(200);
      expect(res.body.status).toBe('REMOVED');
      expect(res.body.removal).toMatchObject({
        reason: 'Admitted twice by mistake',
      });
      expect(res.body.removal.by).toBeTruthy();

      const listed = await schoolAdmin
        .get(`/api/students?search=${k.surname}`)
        .expect(200);
      expect(listed.body.items).toEqual([]);
      const removedList = await schoolAdmin
        .get(`/api/students?search=${k.surname}&status=REMOVED`)
        .expect(200);
      expect(removedList.body.items.map((i: { id: string }) => i.id)).toEqual([
        k.id,
      ]);
      const row = await prisma.student.findUniqueOrThrow({
        where: { id: k.id },
      });
      expect(row.removedAt).not.toBeNull();
    });

    it('needs a reason, and only people who may remove can (office, accountant, teachers cannot)', async () => {
      const k = await admit();
      await schoolAdmin
        .post(`/api/students/${k.id}/remove`)
        .send({})
        .expect(400);
      await schoolAdmin
        .post(`/api/students/${k.id}/remove`)
        .send({ reason: 'x' })
        .expect(400);
      for (const who of [office, accountant, teacher]) {
        await who
          .post(`/api/students/${k.id}/remove`)
          .send({ reason: 'Because I said so' })
          .expect(403);
      }
      expect(
        (await office.get(`/api/students/${k.id}`).expect(200)).body.status,
      ).toBe('ACTIVE');
    });

    it('a removed student looks like they do not exist to everyone who cannot restore them', async () => {
      const k = await admit();
      await superAdmin
        .post(`/api/students/${k.id}/remove`)
        .send({ reason: 'Duplicate record' })
        .expect(200);
      await office.get(`/api/students/${k.id}`).expect(404);
      await teacher.get(`/api/students/${k.id}`).expect(404);
      await accountant.get(`/api/students/${k.id}`).expect(404);
      const asOffice = await office
        .get(`/api/students?search=${k.surname}&status=REMOVED`)
        .expect(200);
      expect(asOffice.body.items).toEqual([]);
      await schoolAdmin.get(`/api/students/${k.id}`).expect(200);
    });

    it('switches the login off and signs them out, and restoring brings it back', async () => {
      const k = await admit();
      const acc = await office
        .post(`/api/students/${k.id}/account`)
        .expect(201);
      const agent = await loginAndSettle(
        app,
        acc.body.loginId,
        acc.body.temporaryPassword,
        'Student-Pass-123',
      );
      await agent.get('/api/auth/me').expect(200);

      await schoolAdmin
        .post(`/api/students/${k.id}/remove`)
        .send({ reason: 'Moved abroad' })
        .expect(200);
      await agent.get('/api/auth/me').expect(401);
      await newAgent(app)
        .post('/api/auth/login')
        .send({ identifier: acc.body.loginId, password: 'Student-Pass-123' })
        .expect(401);

      const back = await schoolAdmin
        .post(`/api/students/${k.id}/restore`)
        .expect(200);
      expect(back.body.status).toBe('ACTIVE');
      expect(back.body.removal).toBeNull();
      await newAgent(app)
        .post('/api/auth/login')
        .send({ identifier: acc.body.loginId, password: 'Student-Pass-123' })
        .expect(200);
      expect(
        (await office.get(`/api/students/${k.id}`).expect(200)).body.status,
      ).toBe('ACTIVE');
    });

    it('cannot be done twice, restored when not removed, or edited while removed', async () => {
      const k = await admit();
      await schoolAdmin.post(`/api/students/${k.id}/restore`).expect(409);
      await schoolAdmin
        .post(`/api/students/${k.id}/remove`)
        .send({ reason: 'Duplicate record' })
        .expect(200);
      await schoolAdmin
        .post(`/api/students/${k.id}/remove`)
        .send({ reason: 'Duplicate record' })
        .expect(409);
      await schoolAdmin
        .patch(`/api/students/${k.id}`)
        .send({ firstName: 'Zed' })
        .expect(400);
      await office
        .patch(`/api/students/${k.id}`)
        .send({ status: 'REMOVED' })
        .expect(400);
    });

    it('records the removal in the audit log', async () => {
      const gone = await admit();
      await schoolAdmin
        .post(`/api/students/${gone.id}/remove`)
        .send({ reason: 'Duplicate record' })
        .expect(200);
      const log = await prisma.auditLog.findFirst({
        where: { entityId: gone.id, action: 'students.removed' },
      });
      expect(log).not.toBeNull();
    });

    it('a parent no longer sees a removed child', async () => {
      const k = await admit();
      const acc = await office
        .post(`/api/guardians/${k.guardianId}/account`)
        .expect(201);
      const parent = await loginAndSettle(
        app,
        k.mobile,
        acc.body.temporaryPassword,
        'Parent-Pass-123',
      );
      await parent.get(`/api/students/${k.id}`).expect(200);
      await schoolAdmin
        .post(`/api/students/${k.id}/remove`)
        .send({ reason: 'Left the school' })
        .expect(200);
      await parent.get(`/api/students/${k.id}`).expect(404);
      expect(
        (await parent.get('/api/students').expect(200)).body.items,
      ).toEqual([]);
    });
  });

  describe('moving within the year', () => {
    it('puts the student in another division and keeps one enrolment', async () => {
      const k = await admit(divA);
      const res = await office
        .post(`/api/students/${k.id}/move`)
        .send({ divisionId: divA2 })
        .expect(200);
      expect(res.body.moved.to.endsWith('-B')).toBe(true);
      expect(res.body.moved.feesNeedReview).toBe(false);
      const after = (await office.get(`/api/students/${k.id}`).expect(200))
        .body;
      expect(after.enrollments.length).toBe(1);
      expect(after.enrollments[0].division.id).toBe(divA2);
      expect(
        await prisma.enrollment.count({ where: { studentId: k.id } }),
      ).toBe(1);
      const log = await prisma.auditLog.findFirst({
        where: { entityId: k.id, action: 'students.moved' },
      });
      expect(log).not.toBeNull();
    });

    it('can move to another class, and says when fees were billed for the old one', async () => {
      const yearId = (
        (await superAdmin.get('/api/academic-years').expect(200)).body as {
          id: string;
          isCurrent: boolean;
        }[]
      ).find((y) => y.isCurrent)!.id;
      const head = (
        await accountant
          .post('/api/fee-heads')
          .send({ name: unique('Tuition') })
          .expect(201)
      ).body.id;
      await accountant
        .put('/api/fee-structures')
        .send({
          academicYearId: yearId,
          classId: classA,
          items: [{ feeHeadId: head, amount: '1000' }],
          instalments: [
            { label: 'Term 1', dueDate: '2099-01-01', percent: 100 },
          ],
        })
        .expect(200);
      const k = await admit(divA);
      await accountant
        .post('/api/fee-invoices/generate')
        .send({ studentIds: [k.id] })
        .expect(200);
      const res = await office
        .post(`/api/students/${k.id}/move`)
        .send({ divisionId: divB })
        .expect(200);
      expect(res.body.moved.feesNeedReview).toBe(true);
      expect(res.body.enrollments[0].class.id).toBe(classB);
    });

    it('refuses the same division, an unknown division, a removed student, and anyone who may not', async () => {
      const k = await admit(divA);
      await office
        .post(`/api/students/${k.id}/move`)
        .send({ divisionId: divA })
        .expect(400);
      await office
        .post(`/api/students/${k.id}/move`)
        .send({ divisionId: randomUUID() })
        .expect(400);
      await office.post(`/api/students/${k.id}/move`).send({}).expect(400);
      for (const who of [teacher, accountant]) {
        await who
          .post(`/api/students/${k.id}/move`)
          .send({ divisionId: divA2 })
          .expect(403);
      }
      await schoolAdmin
        .post(`/api/students/${k.id}/remove`)
        .send({ reason: 'Duplicate record' })
        .expect(200);
      await schoolAdmin
        .post(`/api/students/${k.id}/move`)
        .send({ divisionId: divA2 })
        .expect(400);
    });
  });

  describe('teachers read every student, and change none', () => {
    it('a teacher with no classes opens any current student and lists them', async () => {
      const k = await admit();
      const detail = await teacher.get(`/api/students/${k.id}`).expect(200);
      expect(detail.body.guardians[0].mobile).toBe(k.mobile);
      const list = await teacher
        .get(`/api/students?search=${k.surname}`)
        .expect(200);
      expect(list.body.items.map((i: { id: string }) => i.id)).toEqual([k.id]);
    });

    it('cannot edit, move, remove or add documents, and cannot read the scanned documents', async () => {
      const k = await admit();
      await teacher
        .patch(`/api/students/${k.id}`)
        .send({ firstName: 'Zed' })
        .expect(403);
      await teacher
        .post(`/api/students/${k.id}/move`)
        .send({ divisionId: divA2 })
        .expect(403);
      await teacher
        .post(`/api/students/${k.id}/remove`)
        .send({ reason: 'Nope nope' })
        .expect(403);
      await teacher.get(`/api/students/${k.id}/documents`).expect(403);
      await office.get(`/api/students/${k.id}/documents`).expect(200);
      await accountant.get(`/api/students/${k.id}/documents`).expect(200);
    });

    it('still has no access to fees', async () => {
      const k = await admit();
      await teacher.get(`/api/students/${k.id}/fees`).expect(403);
    });
  });

  describe('the school student ID and e-mail convention', () => {
    it('only a Super Admin may change it, and it is checked', async () => {
      await schoolAdmin
        .patch('/api/school')
        .send({ studentIdPrefix: 'abc' })
        .expect(403);
      await superAdmin
        .patch('/api/school')
        .send({ studentIdPrefix: '9bad' })
        .expect(400);
      await superAdmin
        .patch('/api/school')
        .send({ studentIdPrefix: 'has space' })
        .expect(400);
      await superAdmin
        .patch('/api/school')
        .send({ studentIdDigits: 1 })
        .expect(400);
      await superAdmin
        .patch('/api/school')
        .send({ studentEmailDomain: 'not a domain' })
        .expect(400);
    });

    it('gives new students IDs by the convention, without touching existing ones', async () => {
      const before = await admit();
      expect(before.admissionNo).toMatch(/^\d+$/);
      const set = await superAdmin
        .patch('/api/school')
        .send({ studentIdPrefix: 'HESJ', studentIdDigits: 4 })
        .expect(200);
      expect(set.body.studentIdPrefix).toBe('hesj');
      const a = await admit();
      const b = await admit();
      expect(a.admissionNo).toMatch(/^hesj\d{4}$/);
      expect(b.admissionNo).toMatch(/^hesj\d{4}$/);
      expect(Number(b.admissionNo.slice(4))).toBe(
        Number(a.admissionNo.slice(4)) + 1,
      );
      expect(
        (await office.get(`/api/students/${before.id}`).expect(200)).body
          .admissionNo,
      ).toBe(before.admissionNo);
      await superAdmin
        .patch('/api/school')
        .send({ studentIdPrefix: '' })
        .expect(200);
      expect((await admit()).admissionNo).toMatch(/^\d+$/);
    });

    it('with a domain, shows the school e-mail and lets the student sign in with it', async () => {
      await superAdmin
        .patch('/api/school')
        .send({ studentEmailDomain: 'Hera.Test' })
        .expect(200);
      const k = await admit();
      const detail = (await office.get(`/api/students/${k.id}`).expect(200))
        .body;
      expect(detail.schoolEmail).toBe(
        `${k.admissionNo.toLowerCase()}@hera.test`,
      );
      const acc = await office
        .post(`/api/students/${k.id}/account`)
        .expect(201);
      const login = (identifier: string) =>
        newAgent(app)
          .post('/api/auth/login')
          .send({ identifier, password: acc.body.temporaryPassword });
      await login(k.admissionNo).expect(200);
      await login(`${k.admissionNo}@hera.test`).expect(200);
      await login(`${k.admissionNo.toUpperCase()}@HERA.TEST`).expect(200);
      await login(`${k.admissionNo}@other.test`).expect(401);
      await superAdmin
        .patch('/api/school')
        .send({ studentEmailDomain: '' })
        .expect(200);
      expect(
        (await office.get(`/api/students/${k.id}`).expect(200)).body
          .schoolEmail,
      ).toBeNull();
      await login(`${k.admissionNo}@hera.test`).expect(401);
    });
  });
});
