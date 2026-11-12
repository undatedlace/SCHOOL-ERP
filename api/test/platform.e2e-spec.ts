import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service.js';
import { PlatformAuthService } from '../src/modules/platform/platform-auth.service.js';
import {
  Agent,
  adminAgent,
  createTestApp,
  newAgent,
  unique,
} from './helpers.js';

const OWNER_PASSWORD = 'Owner-Settled-Pass-1';

describe('platform owner (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: Agent;
  let ownerEmail: string;

  const http = () => request(app.getHttpServer());

  /** Signs in to a school; returns the agent and the response. */
  async function schoolLogin(
    identifier: string,
    password: string,
    schoolCode?: string,
  ) {
    const agent = newAgent(app);
    const res = await agent
      .post('/api/auth/login')
      .send({ identifier, password, ...(schoolCode ? { schoolCode } : {}) });
    return { agent, res };
  }

  async function onboard(over: Record<string, unknown> = {}) {
    const code = unique('sch').toLowerCase();
    const res = await owner.post('/api/platform/schools').send({
      name: `Test School ${code}`,
      code,
      superAdminName: 'Trustee One',
      superAdminEmail: `trustee@${code}.test`,
      schoolAdminName: 'Principal One',
      schoolAdminEmail: `principal@${code}.test`,
      ...over,
    });
    return { code, res };
  }

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    ownerEmail = `${unique('owner')}@platform.test`;
    const { temporaryPassword } = await app
      .get(PlatformAuthService)
      .createOwner(ownerEmail, 'Platform Owner');

    owner = newAgent(app);
    const login = await owner
      .post('/api/platform/auth/login')
      .send({ email: ownerEmail.toUpperCase(), password: temporaryPassword })
      .expect(200);
    expect(login.body.mustChangePassword).toBe(true);
    // Nothing but the password change until it is done.
    await owner.get('/api/platform/schools').expect(403);
    await owner
      .post('/api/platform/auth/change-password')
      .send({ currentPassword: temporaryPassword, newPassword: OWNER_PASSWORD })
      .expect(204);
    await owner.get('/api/platform/auth/me').expect(200);
  });
  afterAll(() => app.close());

  it('keeps owner and school sessions apart', async () => {
    await http().get('/api/platform/schools').expect(401);
    // A school's Super Admin is not an owner.
    const admin = await adminAgent(app);
    await admin.get('/api/platform/schools').expect(401);
    // An owner is not a school user.
    await owner.get('/api/school').expect(401);
    await owner.get('/api/students').expect(401);
  });

  it('refuses a wrong owner password with the same answer as an unknown owner', async () => {
    const wrong = await http()
      .post('/api/platform/auth/login')
      .send({ email: ownerEmail, password: 'not-it-at-all' })
      .expect(401);
    const unknown = await http()
      .post('/api/platform/auth/login')
      .send({ email: 'nobody@platform.test', password: 'not-it-at-all' })
      .expect(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('onboards a school with its starter forms and first administrators', async () => {
    const { code, res } = await onboard();
    expect(res.status).toBe(201);
    expect(res.body.school).toMatchObject({ code, status: 'ACTIVE' });
    expect(res.body.logins).toHaveLength(2);
    const [trustee, principal] = res.body.logins;
    expect(trustee).toMatchObject({
      role: 'SUPER_ADMIN',
      email: `trustee@${code}.test`,
    });
    expect(principal).toMatchObject({ role: 'SCHOOL_ADMIN' });
    expect(trustee.temporaryPassword).toMatch(/^\S{12}$/);

    const schoolId = res.body.school.id;
    expect(await prisma.staffType.count({ where: { schoolId } })).toBe(3);
    // Teacher, Clerk and Peon onboarding forms plus the admission form, all live.
    expect(
      await prisma.formDefinition.count({
        where: { schoolId, status: 'PUBLISHED' },
      }),
    ).toBe(4);

    // The new Super Admin signs in with the school code and must change the password.
    const { agent, res: login } = await schoolLogin(
      trustee.email,
      trustee.temporaryPassword,
      code,
    );
    expect(login.status).toBe(200);
    expect(login.body.mustChangePassword).toBe(true);
    await agent
      .post('/api/auth/change-password')
      .send({
        currentPassword: trustee.temporaryPassword,
        newPassword: 'Trustee-New-Pass-1',
      })
      .expect(204);
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.roles).toEqual(['SUPER_ADMIN']);
    const school = await agent.get('/api/school').expect(200);
    expect(school.body).toMatchObject({ id: schoolId, code });

    // Without the code, the sign-in goes to the home school, where this person does not exist.
    const home = await schoolLogin(trustee.email, 'Trustee-New-Pass-1');
    expect(home.res.status).toBe(401);
    // An unknown code is answered like a wrong password.
    const unknown = await schoolLogin(
      trustee.email,
      'Trustee-New-Pass-1',
      'no-such-school',
    );
    expect(unknown.res.status).toBe(401);

    // The school's own audit log says the platform owner made the account.
    const entry = await prisma.auditLog.findFirst({
      where: { schoolId, action: 'platform.admin_created' },
    });
    expect(entry?.metadata).toMatchObject({ by: ownerEmail.toLowerCase() });
    expect(
      await prisma.platformAuditLog.count({
        where: { schoolId, action: 'platform.school_onboarded' },
      }),
    ).toBe(1);
  });

  it('makes a code from the name when none is given, and refuses a taken or bad code', async () => {
    const name = `Code From ${unique('Name')}`;
    const made = await owner
      .post('/api/platform/schools')
      .send({
        name,
        superAdminName: 'Trustee Two',
        superAdminEmail: `${unique('t')}@x.test`,
      })
      .expect(201);
    expect(made.body.school.code).toMatch(/^code-from-name-/);
    expect(made.body.logins).toHaveLength(1);

    const taken = await onboard({ code: made.body.school.code });
    expect(taken.res.status).toBe(409);
    const bad = await onboard({ code: 'Bad Code!' });
    expect(bad.res.status).toBe(400);
    const same = await onboard({
      schoolAdminEmail: undefined,
      schoolAdminName: undefined,
    });
    expect(same.res.status).toBe(201);
  });

  it('lists schools with counts only and shows a school with its administrators', async () => {
    const { res } = await onboard();
    const id = res.body.school.id;
    const list = await owner.get('/api/platform/schools').expect(200);
    const row = list.body.find((s: { id: string }) => s.id === id);
    expect(row).toMatchObject({
      students: 0,
      staff: 0,
      logins: 2,
      isHome: false,
    });
    expect(list.body[0].isHome).toBe(true);

    const one = await owner.get(`/api/platform/schools/${id}`).expect(200);
    expect(
      one.body.admins.map(
        (a: { roles: { code: string }[] }) => a.roles[0].code,
      ),
    ).toEqual(['SUPER_ADMIN', 'SCHOOL_ADMIN']);
    await owner
      .get('/api/platform/schools/00000000-0000-7000-8000-000000000000')
      .expect(404);
  });

  it('suspends a school: everyone is signed out and cannot sign in until it is resumed', async () => {
    const { code, res } = await onboard();
    const id = res.body.school.id;
    const trustee = res.body.logins[0];
    const { agent } = await schoolLogin(
      trustee.email,
      trustee.temporaryPassword,
      code,
    );
    await agent.get('/api/auth/me').expect(200);

    const paused = await owner
      .post(`/api/platform/schools/${id}/suspend`)
      .expect(200);
    expect(paused.body.status).toBe('SUSPENDED');
    await agent.get('/api/auth/me').expect(401);
    const refused = await schoolLogin(
      trustee.email,
      trustee.temporaryPassword,
      code,
    );
    expect(refused.res.status).toBe(403);
    expect(refused.res.body.message).toMatch(/paused/);
    // A wrong password still gets the plain answer, so the pause reveals nothing.
    const wrong = await schoolLogin(trustee.email, 'wrong-password-123', code);
    expect(wrong.res.status).toBe(401);

    await owner.post(`/api/platform/schools/${id}/resume`).expect(200);
    const back = await schoolLogin(
      trustee.email,
      trustee.temporaryPassword,
      code,
    );
    expect(back.res.status).toBe(200);
  });

  it('adds an administrator and resets only administrators’ passwords', async () => {
    const { code, res } = await onboard({
      schoolAdminName: undefined,
      schoolAdminEmail: undefined,
    });
    const id = res.body.school.id;

    const added = await owner
      .post(`/api/platform/schools/${id}/admins`)
      .send({
        fullName: 'Second Trustee',
        email: `second@${code}.test`,
        role: 'SUPER_ADMIN',
      })
      .expect(201);
    expect(added.body.temporaryPassword).toBeTruthy();
    await owner
      .post(`/api/platform/schools/${id}/admins`)
      .send({
        fullName: 'Again',
        email: `second@${code}.test`,
        role: 'SCHOOL_ADMIN',
      })
      .expect(409);
    await owner
      .post(`/api/platform/schools/${id}/admins`)
      .send({ fullName: 'Teacher', email: `t@${code}.test`, role: 'TEACHER' })
      .expect(400);

    const detail = await owner.get(`/api/platform/schools/${id}`).expect(200);
    const second = detail.body.admins.find(
      (a: { email: string }) => a.email === `second@${code}.test`,
    );
    const reset = await owner
      .post(`/api/platform/schools/${id}/admins/${second.id}/reset-password`)
      .expect(200);
    const { res: login } = await schoolLogin(
      `second@${code}.test`,
      reset.body.temporaryPassword,
      code,
    );
    expect(login.status).toBe(200);

    // Not an administrator (here: a teacher made inside the school) → not found for the owner.
    const teacher = await prisma.user.create({
      data: {
        schoolId: id,
        fullName: 'A Teacher',
        email: `teacher@${code}.test`,
        passwordHash: 'x',
      },
    });
    await owner
      .post(`/api/platform/schools/${id}/admins/${teacher.id}/reset-password`)
      .expect(404);
  });

  it('renames a school and changes its code', async () => {
    const { res } = await onboard();
    const id = res.body.school.id;
    const newCode = unique('renamed').toLowerCase();
    const changed = await owner
      .patch(`/api/platform/schools/${id}`)
      .send({ name: 'Renamed School', code: newCode })
      .expect(200);
    expect(changed.body).toMatchObject({
      name: 'Renamed School',
      code: newCode,
    });
  });

  it('signs the owner out', async () => {
    const agent = newAgent(app);
    await agent
      .post('/api/platform/auth/login')
      .send({ email: ownerEmail, password: OWNER_PASSWORD })
      .expect(200);
    await agent.post('/api/platform/auth/logout').expect(204);
    await agent.get('/api/platform/auth/me').expect(401);
  });
});
