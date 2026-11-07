import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/database/prisma.service.js';

export const ADMIN_EMAIL = 'admin@test.local';
export const ADMIN_TEMP_PASSWORD = 'TestAdminPass123';
export const ADMIN_PASSWORD = 'AdminNewPass-456';

export async function createTestApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app: INestApplication = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

/** A supertest agent that keeps the session cookie between calls. */
export const newAgent = (app: INestApplication) =>
  request.agent(app.getHttpServer());

export type Agent = ReturnType<typeof newAgent>;

export async function login(
  app: INestApplication,
  identifier: string,
  password: string,
) {
  const agent = newAgent(app);
  await agent
    .post('/api/auth/login')
    .send({ identifier, password })
    .expect(200);
  return agent;
}

/** Logs in with a temporary password and sets a permanent one. Returns the ready agent. */
export async function loginAndSettle(
  app: INestApplication,
  identifier: string,
  tempPassword: string,
  newPassword: string,
) {
  const agent = await login(app, identifier, tempPassword);
  await agent
    .post('/api/auth/change-password')
    .send({ currentPassword: tempPassword, newPassword })
    .expect(204);
  return agent;
}

export const unique = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * The seeded admin, ready to use. The first run in a fresh database changes the
 * temporary password; later calls just log in with the new one.
 */
export async function adminAgent(app: INestApplication) {
  try {
    return await login(app, ADMIN_EMAIL, ADMIN_PASSWORD);
  } catch {
    return loginAndSettle(
      app,
      ADMIN_EMAIL,
      ADMIN_TEMP_PASSWORD,
      ADMIN_PASSWORD,
    );
  }
}

/** Creates a user through the API (as the admin) and returns their id, login and temporary password. */
export async function createUser(
  admin: Agent,
  roleCode: string,
  name = 'Test User',
) {
  const email = `${unique('u')}@test.local`;
  const res = await admin
    .post('/api/users')
    .send({ fullName: name, email, roleCodes: [roleCode] })
    .expect(201);
  return {
    id: res.body.id as string,
    email,
    tempPassword: res.body.temporaryPassword as string,
  };
}

/** A user who has already set a permanent password. */
export async function createSettledUser(
  app: INestApplication,
  admin: Agent,
  roleCode: string,
  name = 'Test User',
) {
  const user = await createUser(admin, roleCode, name);
  const password = 'Settled-Pass-789';
  const agent = await loginAndSettle(
    app,
    user.email,
    user.tempPassword,
    password,
  );
  return { ...user, password, agent };
}
