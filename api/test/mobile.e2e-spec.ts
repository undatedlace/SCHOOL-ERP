import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  Agent,
  adminAgent,
  createTestApp,
  createUser,
  unique,
} from './helpers.js';

describe('mobile access (e2e)', () => {
  let app: INestApplication;
  let admin: Agent;
  let email: string;
  let temp: string;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    admin = await adminAgent(app);
    const u = await createUser(admin, 'STAFF');
    email = u.email;
    temp = u.tempPassword;
  });
  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  let token: string;

  it('a mobile client gets the token in the body and no cookie', async () => {
    const res = await request(server())
      .post('/api/v1/auth/login')
      .set('X-Client', 'mobile')
      .send({ identifier: email, password: temp })
      .expect(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.expiresInMs).toBeGreaterThan(0);
    expect(res.headers['set-cookie']).toBeUndefined();
    token = res.body.token;
  });

  it('a browser login still gets only a cookie, never the token in the body', async () => {
    const res = await request(server())
      .post('/api/auth/login')
      .send({ identifier: email, password: temp })
      .expect(200);
    expect(res.body.token).toBeUndefined();
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('the bearer token works on /api and /api/v1, and wrong ones do not', async () => {
    await request(server())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const me = await request(server())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.mustChangePassword).toBe(true);
    await request(server())
      .get('/api/auth/me')
      .set('Authorization', 'Bearer nonsense')
      .expect(401);
    await request(server()).get('/api/auth/me').expect(401);
  });

  it('a bearer request is not stopped by the origin check; a cookie one still is', async () => {
    await request(server())
      .post('/api/auth/change-password')
      .set('Authorization', 'Bearer nonsense')
      .set('Origin', 'https://evil.example')
      .send({ currentPassword: 'a', newPassword: 'b' })
      .expect(401);
    await admin
      .post('/api/devices')
      .set('Origin', 'https://evil.example')
      .send({ platform: 'ANDROID', pushToken: 'x' })
      .expect(403);
  });

  it('changing the password gives the mobile client a new token', async () => {
    const res = await request(server())
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Client', 'mobile')
      .send({ currentPassword: temp, newPassword: 'Mobile-Pass-789' })
      .expect(200);
    expect(res.body.token).toEqual(expect.any(String));
    token = res.body.token;
    const me = await request(server())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.mustChangePassword).toBe(false);
  });

  it('registers a device, refreshes it, lists it and removes it; others cannot touch it', async () => {
    const pushToken = unique('push');
    const reg = await request(server())
      .post('/api/v1/devices')
      .set('Authorization', `Bearer ${token}`)
      .send({ platform: 'ANDROID', pushToken, appVersion: '1.0.0' })
      .expect(200);
    const again = await request(server())
      .post('/api/devices')
      .set('Authorization', `Bearer ${token}`)
      .send({ platform: 'ANDROID', pushToken, appVersion: '1.0.1' })
      .expect(200);
    expect(again.body.id).toBe(reg.body.id);

    const list = await request(server())
      .get('/api/devices')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].appVersion).toBe('1.0.1');

    await admin.delete(`/api/devices/${reg.body.id}`).expect(404);
    await request(server())
      .post('/api/devices')
      .set('Authorization', `Bearer ${token}`)
      .send({ platform: 'WINDOWS', pushToken: 'y' })
      .expect(400);
    await request(server())
      .delete(`/api/devices/${reg.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
  });

  it('logging out ends a bearer session', async () => {
    await request(server())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    await request(server())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });
});
