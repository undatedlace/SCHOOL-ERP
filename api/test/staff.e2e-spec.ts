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

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWM4UaEBAAN0AWme5/1hAAAAAElFTkSuQmCC',
  'base64',
);
const mobile = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;

describe('staff (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Agent;
  let office: Agent;

  const person = (over: Record<string, unknown> = {}) => ({
    firstName: 'Asha',
    surname: unique('Rao'),
    gender: 'FEMALE',
    designation: 'Teacher',
    ...over,
  });
  const create = (body: Record<string, unknown> = {}, who: Agent = admin) =>
    who.post('/api/staff').send(person(body));
  const email = () => `${unique('s')}@test.local`;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await adminAgent(app);
    office = (await createSettledUser(app, admin, 'OFFICE_STAFF')).agent;
  });
  afterAll(() => app.close());

  describe('adding staff', () => {
    it('adds a person without a login, numbered in sequence', async () => {
      const a = await create().expect(201);
      expect(a.body).toMatchObject({
        status: 'ACTIVE',
        account: null,
        designation: 'Teacher',
      });
      expect(a.body.employeeNo).toMatch(/^\d+$/);
      expect(a.body.fullName).toBe(`Asha ${a.body.surname}`);
      expect(a.body.joinedOn).toBeTruthy();
      expect(a.body).not.toHaveProperty('temporaryPassword');

      const b = await create().expect(201);
      expect(Number(b.body.employeeNo)).toBeGreaterThan(
        Number(a.body.employeeNo),
      );
    });

    it('keeps a typed employee number and refuses a repeat', async () => {
      const no = unique('EMP');
      expect(
        (await create({ employeeNo: no }).expect(201)).body.employeeNo,
      ).toBe(no);
      await create({ employeeNo: no }).expect(409);
    });

    it('never gives two people the same number, even when added at the same moment', async () => {
      const results = await Promise.all(
        Array.from({ length: 8 }, () => create()),
      );
      expect(results.map((r) => r.status)).toEqual(Array(8).fill(201));
      expect(new Set(results.map((r) => r.body.employeeNo)).size).toBe(8);
    });

    it('skips a number that was typed in by hand when numbering automatically', async () => {
      const next = (await create().expect(201)).body.employeeNo;
      await create({ employeeNo: String(Number(next) + 1) }).expect(201);
      const auto = (await create().expect(201)).body;
      expect(auto.employeeNo).not.toBe(String(Number(next) + 1));
    });

    it('validates the details', async () => {
      await create({ firstName: '' }).expect(400);
      await create({ gender: 'ROBOT' }).expect(400);
      await create({ designation: 'x' }).expect(400);
      await create({ mobile: '12345' }).expect(400);
      await create({ email: 'nope' }).expect(400);
      await create({ dateOfBirth: '1990-02-30' }).expect(400);
      await create({ joinedOn: 'yesterday' }).expect(400);
      await create({ hacked: true }).expect(400);
    });

    it('is only for people who may manage staff', async () => {
      await create({}, office).expect(403);
      const teacher = await createSettledUser(app, admin, 'TEACHER');
      await create({}, teacher.agent).expect(403);
      await http().post('/api/staff').send(person()).expect(401);
    });
  });

  describe('giving someone a login', () => {
    it('creates the person and their login together, with a temporary password shown once', async () => {
      const mail = email();
      const res = await create({
        email: mail,
        account: { roleCodes: ['TEACHER'] },
      }).expect(201);
      expect(res.body.temporaryPassword).toHaveLength(12);
      expect(res.body.account).toMatchObject({
        status: 'ACTIVE',
        mustChangePassword: true,
        roles: [{ code: 'TEACHER', name: 'Teacher' }],
      });
      expect(
        (await admin.get(`/api/staff/${res.body.id}`).expect(200)).body,
      ).not.toHaveProperty('temporaryPassword');

      const login = await http()
        .post('/api/auth/login')
        .send({ identifier: mail, password: res.body.temporaryPassword })
        .expect(200);
      expect(login.body.mustChangePassword).toBe(true);
    });

    it('uses the mobile number when there is no email', async () => {
      const m = mobile();
      const res = await create({
        mobile: m,
        account: { roleCodes: ['STAFF'] },
      }).expect(201);
      await http()
        .post('/api/auth/login')
        .send({ identifier: m, password: res.body.temporaryPassword })
        .expect(200);
    });

    it('needs an email or mobile number, and only staff roles', async () => {
      await create({ account: { roleCodes: ['TEACHER'] } }).expect(400);
      await create({
        email: email(),
        account: { roleCodes: ['PARENT'] },
      }).expect(400);
      await create({
        email: email(),
        account: { roleCodes: ['STUDENT'] },
      }).expect(400);
      await create({
        email: email(),
        account: { roleCodes: ['WIZARD'] },
      }).expect(400);
      await create({ email: email(), account: { roleCodes: [] } }).expect(400);
    });

    it('is all or nothing: a login that cannot be created leaves no staff record behind', async () => {
      const taken = email();
      await create({ email: taken, account: { roleCodes: ['STAFF'] } }).expect(
        201,
      );
      const before = {
        staff: await prisma.staff.count(),
        users: await prisma.user.count(),
      };
      await create({ email: taken, account: { roleCodes: ['STAFF'] } }).expect(
        409,
      );
      expect(await prisma.staff.count()).toBe(before.staff);
      expect(await prisma.user.count()).toBe(before.users);
    });

    it('can be added later, once, with an email or mobile number on file', async () => {
      const noContact = (await create().expect(201)).body.id;
      await admin
        .post(`/api/staff/${noContact}/account`)
        .send({ roleCodes: ['TEACHER'] })
        .expect(400);

      const mail = email();
      const id = (await create({ email: mail }).expect(201)).body.id;
      const res = await admin
        .post(`/api/staff/${id}/account`)
        .send({ roleCodes: ['TEACHER'] })
        .expect(201);
      expect(res.body.account.roles[0].code).toBe('TEACHER');
      await http()
        .post('/api/auth/login')
        .send({ identifier: mail, password: res.body.temporaryPassword })
        .expect(200);
      await admin
        .post(`/api/staff/${id}/account`)
        .send({ roleCodes: ['TEACHER'] })
        .expect(409);
    });

    it('refuses a role that is not for staff when adding later', async () => {
      const id = (await create({ email: email() }).expect(201)).body.id;
      await admin
        .post(`/api/staff/${id}/account`)
        .send({ roleCodes: ['PARENT'] })
        .expect(400);
      await admin
        .post(`/api/staff/${id}/account`)
        .send({ roleCodes: [] })
        .expect(400);
    });
  });

  describe('who can see which staff', () => {
    it('admins and office staff see everyone', async () => {
      const tag = unique('Vis').replace(/-/g, '');
      await create({ surname: `${tag}A` }).expect(201);
      await create({ surname: `${tag}B` }).expect(201);
      for (const who of [admin, office]) {
        expect(
          (await who.get(`/api/staff?search=${tag}`).expect(200)).body.total,
        ).toBe(2);
      }
    });

    it('a teacher sees only their own record', async () => {
      const mail = email();
      const mine = (
        await create({
          email: mail,
          account: { roleCodes: ['TEACHER'] },
        }).expect(201)
      ).body;
      const other = (await create().expect(201)).body.id;
      const agent = await loginAndSettle(
        app,
        mail,
        mine.temporaryPassword,
        'Teacher-Pass-123',
      );

      const list = await agent.get('/api/staff?pageSize=100').expect(200);
      expect(list.body.items.map((s: { id: string }) => s.id)).toEqual([
        mine.id,
      ]);
      await agent.get(`/api/staff/${mine.id}`).expect(200);
      await agent.get(`/api/staff/${other}`).expect(404);
      await agent
        .patch(`/api/staff/${mine.id}`)
        .send({ designation: 'Principal' })
        .expect(403);
    });

    it('a teacher account with no staff record sees nobody, and accountants and parents see no staff at all', async () => {
      const teacher = await createSettledUser(app, admin, 'TEACHER');
      expect(
        (await teacher.agent.get('/api/staff').expect(200)).body.total,
      ).toBe(0);
      const accountant = await createSettledUser(app, admin, 'ACCOUNTANT');
      await accountant.agent.get('/api/staff').expect(403);
      const parent = await createSettledUser(app, admin, 'PARENT');
      await parent.agent.get('/api/staff').expect(403);
    });

    it('searches, filters by status and pages', async () => {
      const tag = unique('Zq').replace(/-/g, '');
      for (let i = 0; i < 3; i++)
        await create({ surname: `${tag}${i}`, designation: 'Clerk' }).expect(
          201,
        );
      const left = (
        await create({ surname: `${tag}L`, designation: 'Clerk' }).expect(201)
      ).body.id;
      await admin
        .patch(`/api/staff/${left}`)
        .send({ status: 'LEFT' })
        .expect(200);

      expect(
        (await admin.get(`/api/staff?search=${tag}`).expect(200)).body.total,
      ).toBe(4);
      expect(
        (await admin.get(`/api/staff?search=${tag}&status=LEFT`).expect(200))
          .body.total,
      ).toBe(1);
      expect(
        (
          await admin
            .get(`/api/staff?search=${tag}&status=ACTIVE&pageSize=2`)
            .expect(200)
        ).body.items,
      ).toHaveLength(2);
      expect(
        (
          await admin
            .get(`/api/staff?search=${tag}&pageSize=1&page=2`)
            .expect(200)
        ).body.items,
      ).toHaveLength(1);
      await admin.get('/api/staff?status=NONSENSE').expect(400);
      await admin.get('/api/staff?pageSize=500').expect(400);
      await admin.get('/api/staff/not-a-uuid').expect(400);
      await admin.get(`/api/staff/${randomUUID()}`).expect(404);
    });

    it("never shows another school's staff", async () => {
      const other = await prisma.school.create({
        data: { name: unique('Other') },
      });
      const foreign = await prisma.staff.create({
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
      await admin.get(`/api/staff/${foreign.id}`).expect(404);
      await admin
        .patch(`/api/staff/${foreign.id}`)
        .send({ designation: 'Hacked' })
        .expect(404);
      await admin
        .post(`/api/staff/${foreign.id}/account`)
        .send({ roleCodes: ['STAFF'] })
        .expect(404);
      expect(
        (await admin.get('/api/staff?search=Foreign').expect(200)).body.total,
      ).toBe(0);
    });
  });

  describe('changing a member of staff', () => {
    it("updates details and keeps the login's name in step", async () => {
      const mail = email();
      const created = (
        await create({
          email: mail,
          account: { roleCodes: ['TEACHER'] },
        }).expect(201)
      ).body;
      const res = await admin
        .patch(`/api/staff/${created.id}`)
        .send({
          firstName: 'Fatima',
          designation: 'Head of English',
          qualification: 'M.A., B.Ed.',
          dateOfBirth: '1988-04-02',
        })
        .expect(200);
      expect(res.body).toMatchObject({
        firstName: 'Fatima',
        designation: 'Head of English',
        qualification: 'M.A., B.Ed.',
      });
      expect(res.body.dateOfBirth).toContain('1988-04-02');
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: created.account.userId },
      });
      expect(user.fullName).toBe(`Fatima ${created.surname}`);
    });

    it('keeps employee numbers unique', async () => {
      const taken = unique('E');
      await create({ employeeNo: taken }).expect(201);
      const other = (await create().expect(201)).body.id;
      await admin
        .patch(`/api/staff/${other}`)
        .send({ employeeNo: taken })
        .expect(409);
    });

    it('validates input', async () => {
      const id = (await create().expect(201)).body.id;
      await admin
        .patch(`/api/staff/${id}`)
        .send({ gender: 'ROBOT' })
        .expect(400);
      await admin.patch(`/api/staff/${id}`).send({ mobile: 'abc' }).expect(400);
      await admin.patch(`/api/staff/${id}`).send({ hacked: true }).expect(400);
      await admin
        .patch(`/api/staff/${id}`)
        .send({ leftOn: '2026-12-01' })
        .expect(400); // needs status LEFT
    });
  });

  describe('leaving and rejoining', () => {
    it('records leaving without deleting anything, and can be undone', async () => {
      const id = (await create().expect(201)).body.id;
      const left = await admin
        .patch(`/api/staff/${id}`)
        .send({ status: 'LEFT' })
        .expect(200);
      expect(left.body.status).toBe('LEFT');
      expect(left.body.leftOn).toBeTruthy();

      const dated = await admin
        .patch(`/api/staff/${id}`)
        .send({ status: 'LEFT', leftOn: '2026-12-01' })
        .expect(200);
      expect(dated.body.leftOn).toContain('2026-12-01');

      const back = await admin
        .patch(`/api/staff/${id}`)
        .send({ status: 'ACTIVE' })
        .expect(200);
      expect(back.body).toMatchObject({ status: 'ACTIVE', leftOn: null });
    });

    it('switches the login off and signs the person out when they leave, and back on when they rejoin', async () => {
      const mail = email();
      const created = (
        await create({
          email: mail,
          account: { roleCodes: ['TEACHER'] },
        }).expect(201)
      ).body;
      const agent = await loginAndSettle(
        app,
        mail,
        created.temporaryPassword,
        'Teacher-Pass-123',
      );
      await agent.get('/api/auth/me').expect(200);

      const left = await admin
        .patch(`/api/staff/${created.id}`)
        .send({ status: 'LEFT' })
        .expect(200);
      expect(left.body.account.status).toBe('DISABLED');
      await agent.get('/api/auth/me').expect(401); // signed out everywhere
      await http()
        .post('/api/auth/login')
        .send({ identifier: mail, password: 'Teacher-Pass-123' })
        .expect(401);
      expect(
        await prisma.session.count({
          where: { userId: created.account.userId },
        }),
      ).toBe(0);

      const back = await admin
        .patch(`/api/staff/${created.id}`)
        .send({ status: 'ACTIVE' })
        .expect(200);
      expect(back.body.account.status).toBe('ACTIVE');
      await http()
        .post('/api/auth/login')
        .send({ identifier: mail, password: 'Teacher-Pass-123' })
        .expect(200);
    });

    it('cannot give a login to someone who has left', async () => {
      const id = (await create({ email: email() }).expect(201)).body.id;
      await admin
        .patch(`/api/staff/${id}`)
        .send({ status: 'LEFT' })
        .expect(200);
      await admin
        .post(`/api/staff/${id}/account`)
        .send({ roleCodes: ['TEACHER'] })
        .expect(400);
    });

    it('an administrator cannot mark themselves as left (that would lock them out)', async () => {
      const mail = email();
      const created = (
        await create({
          email: mail,
          account: { roleCodes: ['SCHOOL_ADMIN'] },
        }).expect(201)
      ).body;
      const self = await loginAndSettle(
        app,
        mail,
        created.temporaryPassword,
        'Second-Admin-Pass-1',
      );
      const res = await self
        .patch(`/api/staff/${created.id}`)
        .send({ status: 'LEFT' })
        .expect(400);
      expect(res.body.message).toMatch(/own account/);
      expect(
        (await admin.get(`/api/staff/${created.id}`).expect(200)).body.status,
      ).toBe('ACTIVE');
    });
  });

  describe('photographs', () => {
    const upload = (who: Agent, purpose = 'staff-photo') =>
      who
        .post('/api/files')
        .field('purpose', purpose)
        .attach('file', PNG, 'p.png');

    it('can be attached, and are visible to people who may read staff', async () => {
      const photo = (await upload(admin).expect(201)).body.id;
      const res = await create({ photoFileId: photo }).expect(201);
      expect(res.body.photoFileId).toBe(photo);
      await office.get(`/api/files/${photo}`).expect(200);
      const parent = await createSettledUser(app, admin, 'PARENT');
      await parent.agent.get(`/api/files/${photo}`).expect(404);
    });

    it('only people who may manage staff can upload them', async () => {
      await upload(office).expect(403);
    });

    it('must be a real staff photograph from this school', async () => {
      await create({ photoFileId: randomUUID() }).expect(400);
      const wrongPurpose = (
        await upload(admin, 'application-photo').expect(201)
      ).body.id;
      await create({ photoFileId: wrongPurpose }).expect(400);
    });
  });

  it('records staff changes in the audit log', async () => {
    const created = (
      await create({
        email: email(),
        account: { roleCodes: ['STAFF'] },
      }).expect(201)
    ).body;
    await admin
      .patch(`/api/staff/${created.id}`)
      .send({ designation: 'Librarian' })
      .expect(200);
    await admin
      .patch(`/api/staff/${created.id}`)
      .send({ status: 'LEFT' })
      .expect(200);
    const log = await admin
      .get('/api/audit-logs?action=staff.&pageSize=100')
      .expect(200);
    const actions = log.body.items
      .filter((i: { entityId: string }) => i.entityId === created.id)
      .map((i: { action: string }) => i.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'staff.created',
        'staff.updated',
        'staff.status_changed',
      ]),
    );
  });
});
