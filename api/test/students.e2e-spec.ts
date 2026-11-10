import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service.js';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
  unique,
} from './helpers.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWM4UaEBAAN0AWme5/1hAAAAAElFTkSuQmCC',
  'base64',
);
const mobile = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;

describe('students and the admit flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Agent;
  let office: Agent;
  let classId: string;
  let otherClassId: string;
  let divisionA: string;
  let divisionB: string;
  let otherClassDivision: string;
  let yearId: string;

  const answers = (over: Record<string, unknown> = {}) => ({
    classApplied: classId,
    surname: unique('Shaikh'),
    firstName: 'Ayaan',
    fatherName: 'Imran',
    gender: 'MALE',
    dateOfBirth: '2021-06-15',
    undertakingReceived: true,
    ...over,
  });
  const guardian = (over: Record<string, unknown> = {}) => ({
    fullName: 'Imran Shaikh',
    relationship: 'FATHER',
    mobile: mobile(),
    ...over,
  });

  /** An application that has been granted and is ready to admit. */
  async function granted(over: Record<string, unknown> = {}) {
    const created = (
      await office
        .post('/api/admissions/applications')
        .send({ answers: answers(over) })
        .expect(201)
    ).body;
    await office
      .post(`/api/admissions/applications/${created.id}/decision`)
      .send({ decision: 'GRANTED' })
      .expect(200);
    return created.id as string;
  }
  const admit = (
    id: string,
    body: Record<string, unknown> = {},
    who: Agent = office,
  ) =>
    who
      .post(`/api/admissions/applications/${id}/admit`)
      .send({ divisionId: divisionA, guardians: [guardian()], ...body });

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await adminAgent(app);
    office = (
      await createSettledUser(app, admin, 'OFFICE_STAFF', 'Front Office')
    ).agent;

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
    const mk = async (name: string) =>
      (await admin.post('/api/classes').send({ name }).expect(201)).body
        .id as string;
    classId = await mk(unique('Nursery'));
    otherClassId = await mk(unique('Std'));
    const div = async (cls: string, name: string) =>
      (
        await admin
          .post(`/api/classes/${cls}/divisions`)
          .send({ name })
          .expect(201)
      ).body.id as string;
    divisionA = await div(classId, 'A');
    divisionB = await div(classId, 'B');
    otherClassDivision = await div(otherClassId, 'A');
  });
  afterAll(() => app.close());

  describe('admitting a granted application', () => {
    it('creates the student, guardians and enrolment together', async () => {
      const photo = (
        await office
          .post('/api/files')
          .field('purpose', 'application-photo')
          .attach('file', PNG, 'c.png')
          .expect(201)
      ).body.id;
      const id = await granted({ childPhoto: photo, firstName: 'Zayd' });
      const father = guardian({
        fullName: 'Imran Shaikh',
        relationship: 'FATHER',
        occupation: 'Engineer',
      });
      const mother = guardian({
        fullName: 'Ayesha Shaikh',
        relationship: 'MOTHER',
        mobile: father.mobile,
      });

      const res = await admit(id, {
        guardians: [father, mother],
        divisionId: divisionB,
      }).expect(201);
      expect(res.body.studentId).toBeDefined();
      expect(res.body.admissionNo).toMatch(/^\d+$/);

      const student = (
        await office.get(`/api/students/${res.body.studentId}`).expect(200)
      ).body;
      expect(student).toMatchObject({
        firstName: 'Zayd',
        fatherName: 'Imran',
        gender: 'MALE',
        status: 'ACTIVE',
        photoFileId: photo,
        admissionNo: res.body.admissionNo,
      });
      expect(student.dateOfBirth).toContain('2021-06-15');
      expect(student.fullName).toBe(`Zayd Imran ${student.surname}`);

      expect(student.enrollments).toHaveLength(1);
      expect(student.enrollments[0]).toMatchObject({
        class: { id: classId },
        division: { id: divisionB },
        academicYear: { id: yearId },
      });

      expect(
        student.guardians.map(
          (g: {
            fullName: string;
            relationship: string;
            isPrimary: boolean;
          }) => [g.fullName, g.relationship, g.isPrimary],
        ),
      ).toEqual([
        ['Imran Shaikh', 'FATHER', true],
        ['Ayesha Shaikh', 'MOTHER', false],
      ]);
      expect(student.application).toMatchObject({ id });

      const application = (
        await office.get(`/api/admissions/applications/${id}`).expect(200)
      ).body;
      expect(application).toMatchObject({
        status: 'GRANTED',
        studentId: student.id,
        suggestedGuardians: [],
      });
      expect(application.admittedAt).toBeTruthy();
      expect(application.decision.grantedDivision.id).toBe(divisionB);
    });

    it('offers guardians taken from the application as a starting point', async () => {
      const id = await granted({
        fatherFullName: 'Imran Shaikh',
        motherFullName: 'Ayesha Shaikh',
        familyMobile: '98765 43210',
      });
      const detail = (
        await office.get(`/api/admissions/applications/${id}`).expect(200)
      ).body;
      expect(detail.suggestedGuardians).toEqual([
        {
          fullName: 'Imran Shaikh',
          relationship: 'FATHER',
          mobile: '9876543210',
          isPrimary: true,
        },
        {
          fullName: 'Ayesha Shaikh',
          relationship: 'MOTHER',
          mobile: '9876543210',
          isPrimary: false,
        },
      ]);
    });

    it('numbers admissions in sequence, accepts a typed number, and refuses a repeat', async () => {
      const a = (await admit(await granted()).expect(201)).body.admissionNo;
      const b = (await admit(await granted()).expect(201)).body.admissionNo;
      expect(Number(b)).toBeGreaterThan(Number(a));

      const typed = unique('ADM');
      expect(
        (await admit(await granted(), { admissionNo: typed }).expect(201)).body
          .admissionNo,
      ).toBe(typed);
      await admit(await granted(), { admissionNo: typed }).expect(409);
    });

    it('is all or nothing: a refused admission leaves nothing behind', async () => {
      const taken = unique('TAKEN');
      await admit(await granted(), { admissionNo: taken }).expect(201);

      const id = await granted();
      const before = {
        students: await prisma.student.count(),
        guardians: await prisma.guardian.count(),
        enrollments: await prisma.enrollment.count(),
      };
      await admit(id, {
        admissionNo: taken,
        guardians: [guardian({ fullName: 'Nobody Created' })],
      }).expect(409);

      expect(await prisma.student.count()).toBe(before.students);
      expect(await prisma.guardian.count()).toBe(before.guardians);
      expect(await prisma.enrollment.count()).toBe(before.enrollments);
      const app1 = (
        await office.get(`/api/admissions/applications/${id}`).expect(200)
      ).body;
      expect(app1.studentId).toBeNull();
      await admit(id).expect(201); // and it can still be admitted afterwards
    });

    it('only a granted application can be admitted, and only once', async () => {
      const received = (
        await office
          .post('/api/admissions/applications')
          .send({ answers: answers() })
          .expect(201)
      ).body.id;
      await admit(received).expect(400);

      const refused = (
        await office
          .post('/api/admissions/applications')
          .send({ answers: answers() })
          .expect(201)
      ).body.id;
      await office
        .post(`/api/admissions/applications/${refused}/decision`)
        .send({ decision: 'REFUSED', note: 'No seat' })
        .expect(200);
      await admit(refused).expect(400);

      const id = await granted();
      await admit(id).expect(201);
      await admit(id).expect(409);
    });

    it('checks the division, the guardians and the request shape', async () => {
      const id = await granted();
      await admit(id, { divisionId: otherClassDivision }).expect(400); // another class's division
      await admit(id, { divisionId: randomUUID() }).expect(400);
      await admit(id, { divisionId: 'nope' }).expect(400);
      await admit(id, { guardians: [] }).expect(400);
      await admit(id, { guardians: undefined }).expect(400);
      await admit(id, { guardians: [guardian({ mobile: '12345' })] }).expect(
        400,
      );
      await admit(id, {
        guardians: [guardian({ relationship: 'UNCLE' })],
      }).expect(400);
      await admit(id, {
        guardians: [guardian({ email: 'not-an-email' })],
      }).expect(400);
      await admit(id, {
        guardians: Array.from({ length: 7 }, () => guardian()),
      }).expect(400);
      await admit(id, { joinedOn: 'yesterday' }).expect(400);
      await admit(id, { extra: true }).expect(400);
      expect(
        (await office.get(`/api/admissions/applications/${id}`).expect(200))
          .body.studentId,
      ).toBeNull();
    });

    it('a parent with two children is one guardian linked twice; father and mother stay separate people', async () => {
      const shared = mobile();
      const father = {
        fullName: 'Imran Shaikh',
        relationship: 'FATHER',
        mobile: shared,
        isPrimary: true,
      };
      const mother = {
        fullName: 'Ayesha Shaikh',
        relationship: 'MOTHER',
        mobile: shared,
      };
      const first = (
        await admit(await granted(), { guardians: [father, mother] }).expect(
          201,
        )
      ).body.studentId;
      const second = (
        await admit(await granted(), {
          guardians: [{ ...father, fullName: 'imran shaikh' }, mother],
        }).expect(201)
      ).body.studentId;

      expect(await prisma.guardian.count({ where: { mobile: shared } })).toBe(
        2,
      ); // not 4
      const a = (
        await office.get(`/api/students/${first}`).expect(200)
      ).body.guardians
        .map((g: { id: string }) => g.id)
        .sort();
      const b = (
        await office.get(`/api/students/${second}`).expect(200)
      ).body.guardians
        .map((g: { id: string }) => g.id)
        .sort();
      expect(a).toEqual(b);
    });

    it('two people admitting the same application at the same moment create only one student', async () => {
      const id = await granted();
      const before = await prisma.student.count();
      const results = await Promise.all([admit(id), admit(id), admit(id)]);
      expect(results.map((r) => r.status).sort((x, y) => x - y)).toEqual([
        201, 409, 409,
      ]);
      expect(await prisma.student.count()).toBe(before + 1);
    });

    it('simultaneous admissions of different applications never share an admission number', async () => {
      const ids = await Promise.all(Array.from({ length: 8 }, () => granted()));
      const results = await Promise.all(ids.map((id) => admit(id)));
      expect(results.map((r) => r.status)).toEqual(Array(8).fill(201));
      expect(new Set(results.map((r) => r.body.admissionNo)).size).toBe(8);
    });

    it('needs both admissions and student management; others are refused', async () => {
      const id = await granted();
      const accountant = await createSettledUser(app, admin, 'ACCOUNTANT');
      const teacher = await createSettledUser(app, admin, 'TEACHER');
      const parent = await createSettledUser(app, admin, 'PARENT');
      for (const who of [accountant, teacher, parent])
        await admit(id, {}, who.agent).expect(403);
      await request(app.getHttpServer())
        .post(`/api/admissions/applications/${id}/admit`)
        .send({})
        .expect(401);
      await admit(id).expect(201);
    });

    it('is recorded in the audit log', async () => {
      const id = await granted();
      const studentId = (await admit(id).expect(201)).body.studentId;
      const log = await admin.get('/api/audit-logs?pageSize=100').expect(200);
      const actions = log.body.items
        .filter(
          (i: { entityId: string }) =>
            i.entityId === id || i.entityId === studentId,
        )
        .map((i: { action: string }) => i.action);
      expect(actions).toEqual(
        expect.arrayContaining(['admissions.admitted', 'students.created']),
      );
    });
  });

  describe('who can see which students', () => {
    let studentId: string;
    let otherStudentId: string;
    let guardianId: string;
    const lastName = unique('Visible');

    beforeAll(async () => {
      studentId = (
        await admit(await granted({ surname: lastName })).expect(201)
      ).body.studentId;
      otherStudentId = (
        await admit(await granted({ surname: unique('Other') })).expect(201)
      ).body.studentId;
      guardianId = (await office.get(`/api/students/${studentId}`).expect(200))
        .body.guardians[0].id;
    });

    it('office staff, accountants and admins see every student', async () => {
      const accountant = await createSettledUser(app, admin, 'ACCOUNTANT');
      for (const who of [office, admin, accountant.agent]) {
        const list = await who
          .get(`/api/students?search=${lastName}`)
          .expect(200);
        expect(list.body.total).toBe(1);
        await who.get(`/api/students/${studentId}`).expect(200);
      }
    });

    it('teachers read every student, student accounts see none, and other staff have no access', async () => {
      const teacher = await createSettledUser(app, admin, 'TEACHER');
      expect(
        (await teacher.agent.get('/api/students').expect(200)).body.total,
      ).toBeGreaterThan(0);
      await teacher.agent.get(`/api/students/${studentId}`).expect(200);
      const student = await createSettledUser(app, admin, 'STUDENT');
      expect(
        (await student.agent.get('/api/students').expect(200)).body.total,
      ).toBe(0);
      await student.agent.get(`/api/students/${studentId}`).expect(404);
      const staff = await createSettledUser(app, admin, 'STAFF');
      await staff.agent.get('/api/students').expect(403); // has no student permission at all
    });

    it('a parent sees only their own child, without the admissions paperwork, and cannot change anything', async () => {
      const parent = await createSettledUser(app, admin, 'PARENT');
      expect(
        (await parent.agent.get('/api/students').expect(200)).body.total,
      ).toBe(0);
      await parent.agent.get(`/api/students/${studentId}`).expect(404);

      await prisma.guardian.update({
        where: { id: guardianId },
        data: { userId: parent.id },
      });

      const list = await parent.agent
        .get('/api/students?pageSize=100')
        .expect(200);
      expect(list.body.items.map((s: { id: string }) => s.id)).toEqual([
        studentId,
      ]);
      const profile = (
        await parent.agent.get(`/api/students/${studentId}`).expect(200)
      ).body;
      expect(profile.application).toBeNull();
      expect(profile.guardians[0].hasLogin).toBe(true);
      await parent.agent.get(`/api/students/${otherStudentId}`).expect(404);

      await parent.agent
        .patch(`/api/students/${studentId}`)
        .send({ surname: 'Hacked' })
        .expect(403);
      await parent.agent
        .post(`/api/students/${studentId}/guardians`)
        .send(guardian())
        .expect(403);
      await prisma.guardian.update({
        where: { id: guardianId },
        data: { userId: null },
      });
    });

    it("never shows another school's students", async () => {
      const other = await prisma.school.create({
        data: { name: unique('Other') },
      });
      const foreign = await prisma.student.create({
        data: {
          schoolId: other.id,
          seq: 1,
          admissionNo: '1',
          firstName: 'Foreign',
          surname: 'Child',
          gender: 'MALE',
          dateOfBirth: new Date('2020-01-01'),
          joinedOn: new Date('2026-06-01'),
        },
      });
      await admin.get(`/api/students/${foreign.id}`).expect(404);
      await admin
        .patch(`/api/students/${foreign.id}`)
        .send({ surname: 'Hacked' })
        .expect(404);
      await admin
        .post(`/api/students/${foreign.id}/guardians`)
        .send(guardian())
        .expect(404);
      expect(
        (await admin.get('/api/students?search=Foreign').expect(200)).body
          .total,
      ).toBe(0);
    });
  });

  describe('finding students', () => {
    it('searches, filters by class and division, and pages', async () => {
      const tag = unique('Zq').replace(/-/g, '');
      const inA = await admit(await granted({ surname: `${tag}A` }), {
        divisionId: divisionA,
      }).expect(201);
      await admit(await granted({ surname: `${tag}B` }), {
        divisionId: divisionB,
      }).expect(201);
      await admit(
        await granted({ surname: `${tag}C`, classApplied: otherClassId }),
        { divisionId: otherClassDivision },
      ).expect(201);

      expect(
        (await office.get(`/api/students?search=${tag}`).expect(200)).body
          .total,
      ).toBe(3);
      expect(
        (await office.get(`/api/students?search=${tag}&pageSize=2`).expect(200))
          .body.items,
      ).toHaveLength(2);
      expect(
        (
          await office
            .get(`/api/students?search=${tag}&classId=${classId}`)
            .expect(200)
        ).body.total,
      ).toBe(2);
      expect(
        (
          await office
            .get(`/api/students?search=${tag}&classId=${otherClassId}`)
            .expect(200)
        ).body.total,
      ).toBe(1);
      const division = await office
        .get(`/api/students?search=${tag}&divisionId=${divisionA}`)
        .expect(200);
      expect(
        division.body.items.map((s: { admissionNo: string }) => s.admissionNo),
      ).toEqual([inA.body.admissionNo]);
      expect(division.body.items[0].current).toMatchObject({
        class: { id: classId },
        division: { id: divisionA },
        academicYear: { id: yearId },
      });

      const byNo = await office
        .get(`/api/students?search=${inA.body.admissionNo}`)
        .expect(200);
      expect(byNo.body.total).toBeGreaterThanOrEqual(1);

      await office.get('/api/students?status=NONSENSE').expect(400);
      await office.get('/api/students?pageSize=500').expect(400);
      await office.get('/api/students/not-a-uuid').expect(400);
      await office.get(`/api/students/${randomUUID()}`).expect(404);
    });
  });

  describe('changing a student', () => {
    let studentId: string;
    beforeEach(async () => {
      studentId = (await admit(await granted()).expect(201)).body.studentId;
    });

    it('updates details', async () => {
      const res = await office
        .patch(`/api/students/${studentId}`)
        .send({
          firstName: 'Zayd',
          gender: 'FEMALE',
          dateOfBirth: '2020-02-29',
        })
        .expect(200);
      expect(res.body).toMatchObject({ firstName: 'Zayd', gender: 'FEMALE' });
      expect(res.body.dateOfBirth).toContain('2020-02-29');
    });

    it('keeps admission numbers unique', async () => {
      const other = (
        await admit(await granted(), { admissionNo: unique('N') }).expect(201)
      ).body.admissionNo;
      await office
        .patch(`/api/students/${studentId}`)
        .send({ admissionNo: other })
        .expect(409);
    });

    it('records leaving without deleting anything, and can be undone', async () => {
      const left = await office
        .patch(`/api/students/${studentId}`)
        .send({ status: 'LEFT' })
        .expect(200);
      expect(left.body.status).toBe('LEFT');
      expect(left.body.leftOn).toBeTruthy();
      expect(left.body.enrollments).toHaveLength(1); // history is kept

      const back = await office
        .patch(`/api/students/${studentId}`)
        .send({ status: 'ACTIVE' })
        .expect(200);
      expect(back.body).toMatchObject({ status: 'ACTIVE', leftOn: null });

      const dated = await office
        .patch(`/api/students/${studentId}`)
        .send({ status: 'LEFT', leftOn: '2026-12-01' })
        .expect(200);
      expect(dated.body.leftOn).toContain('2026-12-01');
      await office
        .patch(`/api/students/${studentId}`)
        .send({ leftOn: '2026-12-01' })
        .expect(400);
    });

    it('validates input and is only for people who may manage students', async () => {
      await office
        .patch(`/api/students/${studentId}`)
        .send({ gender: 'ROBOT' })
        .expect(400);
      await office
        .patch(`/api/students/${studentId}`)
        .send({ dateOfBirth: '2020-13-45' })
        .expect(400);
      await office
        .patch(`/api/students/${studentId}`)
        .send({ hacked: true })
        .expect(400);
      const accountant = await createSettledUser(app, admin, 'ACCOUNTANT');
      await accountant.agent
        .patch(`/api/students/${studentId}`)
        .send({ surname: 'X' })
        .expect(403);
    });
  });

  describe('guardians', () => {
    let studentId: string;
    beforeEach(async () => {
      studentId = (
        await admit(await granted(), {
          guardians: [guardian({ fullName: 'First Parent' })],
        }).expect(201)
      ).body.studentId;
    });

    it('adds a guardian, and refuses to add the same person twice', async () => {
      const extra = guardian({
        fullName: 'Second Parent',
        relationship: 'MOTHER',
      });
      const res = await office
        .post(`/api/students/${studentId}/guardians`)
        .send(extra)
        .expect(201);
      expect(
        res.body.guardians.map((g: { fullName: string }) => g.fullName).sort(),
      ).toEqual(['First Parent', 'Second Parent']);
      expect(
        res.body.guardians.find(
          (g: { fullName: string }) => g.fullName === 'First Parent',
        ).isPrimary,
      ).toBe(true);
      await office
        .post(`/api/students/${studentId}/guardians`)
        .send(extra)
        .expect(409);
    });

    it('a new guardian can be made the primary contact', async () => {
      const res = await office
        .post(`/api/students/${studentId}/guardians`)
        .send(guardian({ fullName: 'New Primary', isPrimary: true }))
        .expect(201);
      const primaries = res.body.guardians.filter(
        (g: { isPrimary: boolean }) => g.isPrimary,
      );
      expect(primaries.map((g: { fullName: string }) => g.fullName)).toEqual([
        'New Primary',
      ]);
    });

    it("updates a guardian's contact details", async () => {
      const g = (await office.get(`/api/students/${studentId}`).expect(200))
        .body.guardians[0];
      const res = await office
        .patch(`/api/guardians/${g.id}`)
        .send({ email: 'NEW@Example.com', occupation: 'Doctor' })
        .expect(200);
      expect(res.body).toMatchObject({
        email: 'new@example.com',
        occupation: 'Doctor',
      });
      await office
        .patch(`/api/guardians/${g.id}`)
        .send({ mobile: 'abc' })
        .expect(400);
    });

    it('removes a link but never the last guardian, and hands over the primary role', async () => {
      const first = (await office.get(`/api/students/${studentId}`).expect(200))
        .body.guardians[0];
      await office
        .delete(`/api/students/${studentId}/guardians/${first.id}`)
        .expect(400); // the only one

      const added = (
        await office
          .post(`/api/students/${studentId}/guardians`)
          .send(guardian({ fullName: 'Backup Parent' }))
          .expect(201)
      ).body;
      await office
        .delete(`/api/students/${studentId}/guardians/${first.id}`)
        .expect(204);
      const after = (await office.get(`/api/students/${studentId}`).expect(200))
        .body;
      expect(after.guardians).toHaveLength(1);
      expect(after.guardians[0]).toMatchObject({
        fullName: 'Backup Parent',
        isPrimary: true,
      });
      expect(added.guardians).toHaveLength(2);
      await office
        .delete(`/api/students/${studentId}/guardians/${first.id}`)
        .expect(404);
    });

    it("removing a link keeps the guardian's other children", async () => {
      const shared = guardian({ fullName: 'Shared Parent' });
      const one = (
        await admit(await granted(), { guardians: [shared] }).expect(201)
      ).body.studentId;
      const two = (
        await admit(await granted(), { guardians: [shared] }).expect(201)
      ).body.studentId;
      await office
        .post(`/api/students/${one}/guardians`)
        .send(guardian({ fullName: 'Someone Else' }))
        .expect(201);
      const g = (
        await office.get(`/api/students/${one}`).expect(200)
      ).body.guardians.find(
        (x: { fullName: string }) => x.fullName === 'Shared Parent',
      );
      await office.delete(`/api/students/${one}/guardians/${g.id}`).expect(204);
      const stillLinked = (await office.get(`/api/students/${two}`).expect(200))
        .body.guardians;
      expect(stillLinked.map((x: { id: string }) => x.id)).toContain(g.id);
    });
  });
});
