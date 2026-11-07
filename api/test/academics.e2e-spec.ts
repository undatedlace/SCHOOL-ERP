import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
  unique,
} from './helpers.js';

describe('school settings, academic setup and audit (e2e)', () => {
  let app: INestApplication;
  let admin: Agent;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    admin = await adminAgent(app);
  });
  afterAll(() => app.close());

  describe('school profile', () => {
    it('anyone logged in can read it, only settings.manage can change it', async () => {
      const teacher = await createSettledUser(app, admin, 'TEACHER');
      const before = await teacher.agent.get('/api/school').expect(200);
      expect(before.body.name).toEqual(expect.any(String));
      await teacher.agent
        .patch('/api/school')
        .send({ name: 'Hijacked' })
        .expect(403);

      const name = unique('Greenfield');
      const updated = await admin
        .patch('/api/school')
        .send({
          name,
          address: '12 Main Road',
          phone: '+91 98765 43210',
          email: 'Office@Greenfield.TEST',
          board: 'CBSE',
        })
        .expect(200);
      expect(updated.body).toMatchObject({
        name,
        address: '12 Main Road',
        board: 'CBSE',
        email: 'office@greenfield.test',
      });
      expect(
        (await teacher.agent.get('/api/school').expect(200)).body.name,
      ).toBe(name);
    });

    it('validates the profile', async () => {
      await admin.patch('/api/school').send({ email: 'nope' }).expect(400);
      await admin.patch('/api/school').send({ phone: 'abc' }).expect(400);
      await admin.patch('/api/school').send({ name: 'x' }).expect(400);
      await admin.patch('/api/school').send({ id: randomUUID() }).expect(400);
    });
  });

  describe('academic years', () => {
    it('keeps exactly one year current', async () => {
      const a = await admin
        .post('/api/academic-years')
        .send({
          name: unique('Y'),
          startDate: '2026-04-01',
          endDate: '2027-03-31',
          isCurrent: true,
        })
        .expect(201);
      const b = await admin
        .post('/api/academic-years')
        .send({
          name: unique('Y'),
          startDate: '2027-04-01',
          endDate: '2028-03-31',
          isCurrent: true,
        })
        .expect(201);

      let years = (await admin.get('/api/academic-years').expect(200)).body as {
        id: string;
        isCurrent: boolean;
      }[];
      expect(years.filter((y) => y.isCurrent).map((y) => y.id)).toEqual([
        b.body.id,
      ]);

      await admin
        .post(`/api/academic-years/${a.body.id}/set-current`)
        .expect(200);
      years = (await admin.get('/api/academic-years').expect(200)).body;
      expect(years.filter((y) => y.isCurrent).map((y) => y.id)).toEqual([
        a.body.id,
      ]);

      await admin
        .patch(`/api/academic-years/${b.body.id}`)
        .send({ isCurrent: true })
        .expect(200);
      years = (await admin.get('/api/academic-years').expect(200)).body;
      expect(years.filter((y) => y.isCurrent).map((y) => y.id)).toEqual([
        b.body.id,
      ]);
    });

    it('validates dates and names', async () => {
      const name = unique('Y');
      await admin
        .post('/api/academic-years')
        .send({ name, startDate: '2026-04-01', endDate: '2026-03-31' })
        .expect(400);
      await admin
        .post('/api/academic-years')
        .send({ name, startDate: 'yesterday', endDate: '2026-03-31' })
        .expect(400);
      await admin
        .post('/api/academic-years')
        .send({ name, startDate: '2026-04-01', endDate: '2027-03-31' })
        .expect(201);
      await admin
        .post('/api/academic-years')
        .send({ name, startDate: '2026-04-01', endDate: '2027-03-31' })
        .expect(409);
    });

    it('rejects an edit that would make the date range invalid', async () => {
      const y = await admin
        .post('/api/academic-years')
        .send({
          name: unique('Y'),
          startDate: '2030-04-01',
          endDate: '2031-03-31',
        })
        .expect(201);
      await admin
        .patch(`/api/academic-years/${y.body.id}`)
        .send({ endDate: '2030-01-01' })
        .expect(400);
    });

    it('a teacher can read but not change years', async () => {
      const teacher = await createSettledUser(app, admin, 'TEACHER');
      await teacher.agent.get('/api/academic-years').expect(200);
      await teacher.agent
        .post('/api/academic-years')
        .send({
          name: unique('Y'),
          startDate: '2040-04-01',
          endDate: '2041-03-31',
        })
        .expect(403);
    });
  });

  describe('classes and divisions', () => {
    it('creates classes in order, with divisions grouped under them', async () => {
      const first = await admin
        .post('/api/classes')
        .send({ name: unique('Std') })
        .expect(201);
      const second = await admin
        .post('/api/classes')
        .send({ name: unique('Std') })
        .expect(201);
      expect(second.body.sortOrder).toBe(first.body.sortOrder + 1);

      await admin
        .post(`/api/classes/${first.body.id}/divisions`)
        .send({ name: 'A' })
        .expect(201);
      await admin
        .post(`/api/classes/${first.body.id}/divisions`)
        .send({ name: 'B' })
        .expect(201);
      // "A" may repeat in a different class, but not within the same one.
      await admin
        .post(`/api/classes/${second.body.id}/divisions`)
        .send({ name: 'A' })
        .expect(201);
      await admin
        .post(`/api/classes/${first.body.id}/divisions`)
        .send({ name: 'A' })
        .expect(409);

      const list = (await admin.get('/api/classes').expect(200)).body as {
        id: string;
        divisions: { name: string }[];
      }[];
      expect(
        list.find((c) => c.id === first.body.id)?.divisions.map((d) => d.name),
      ).toEqual(['A', 'B']);
      expect(
        list.find((c) => c.id === second.body.id)?.divisions.map((d) => d.name),
      ).toEqual(['A']);
    });

    it('rejects duplicate class names', async () => {
      const name = unique('Std');
      await admin.post('/api/classes').send({ name }).expect(201);
      await admin.post('/api/classes').send({ name }).expect(409);
    });

    it('cannot delete a class that still has divisions', async () => {
      const cls = await admin
        .post('/api/classes')
        .send({ name: unique('Std') })
        .expect(201);
      const div = await admin
        .post(`/api/classes/${cls.body.id}/divisions`)
        .send({ name: 'A' })
        .expect(201);

      await admin.delete(`/api/classes/${cls.body.id}`).expect(409);
      await admin.delete(`/api/divisions/${div.body.id}`).expect(204);
      await admin.delete(`/api/classes/${cls.body.id}`).expect(204);
    });

    it('renames classes and divisions', async () => {
      const cls = await admin
        .post('/api/classes')
        .send({ name: unique('Std') })
        .expect(201);
      const renamed = unique('Renamed');
      await admin
        .patch(`/api/classes/${cls.body.id}`)
        .send({ name: renamed })
        .expect(200);
      const div = await admin
        .post(`/api/classes/${cls.body.id}/divisions`)
        .send({ name: 'C' })
        .expect(201);
      const res = await admin
        .patch(`/api/divisions/${div.body.id}`)
        .send({ name: 'D' })
        .expect(200);
      expect(res.body.name).toBe('D');
      const list = (await admin.get('/api/classes').expect(200)).body as {
        id: string;
        name: string;
      }[];
      expect(list.find((c) => c.id === cls.body.id)?.name).toBe(renamed);
    });

    it('returns 404 for a division on a missing class and 400 for a malformed id', async () => {
      await admin
        .post(`/api/classes/${randomUUID()}/divisions`)
        .send({ name: 'A' })
        .expect(404);
      await admin
        .post('/api/classes/not-a-uuid/divisions')
        .send({ name: 'A' })
        .expect(400);
    });
  });

  describe('subjects', () => {
    it('creates, updates, rejects duplicates and deletes', async () => {
      const name = unique('Maths');
      const created = await admin
        .post('/api/subjects')
        .send({ name, code: 'MAT' })
        .expect(201);
      await admin.post('/api/subjects').send({ name }).expect(409);

      const updated = await admin
        .patch(`/api/subjects/${created.body.id}`)
        .send({ code: 'MTH' })
        .expect(200);
      expect(updated.body).toMatchObject({ name, code: 'MTH' });

      const list = (await admin.get('/api/subjects').expect(200)).body as {
        id: string;
      }[];
      expect(list.map((s) => s.id)).toContain(created.body.id);

      await admin.delete(`/api/subjects/${created.body.id}`).expect(204);
      await admin.delete(`/api/subjects/${created.body.id}`).expect(404);
    });
  });

  describe('audit log', () => {
    it('records academic changes with the actor, and only audit.read can view it', async () => {
      const name = unique('Audit-Subject');
      const created = await admin
        .post('/api/subjects')
        .send({ name })
        .expect(201);

      const res = await admin
        .get('/api/audit-logs?action=subject.created&pageSize=100')
        .expect(200);
      const entry = res.body.items.find(
        (i: { entityId: string }) => i.entityId === created.body.id,
      );
      expect(entry).toMatchObject({
        action: 'subject.created',
        entityType: 'subject',
      });
      expect(entry.actorName).toEqual(expect.any(String));

      const paged = await admin.get('/api/audit-logs?pageSize=1').expect(200);
      expect(paged.body.items).toHaveLength(1);
      expect(paged.body.total).toBeGreaterThan(1);

      const accountant = await createSettledUser(app, admin, 'ACCOUNTANT');
      await accountant.agent.get('/api/audit-logs').expect(403);
    });
  });
});
