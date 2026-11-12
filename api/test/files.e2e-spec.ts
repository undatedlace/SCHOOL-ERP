import { INestApplication } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { FilesService } from '../src/modules/files/files.service.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { sniffImage } from '../src/modules/files/image-sniff.js';
import { makeImage } from './support/images.js';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
  unique,
} from './helpers.js';

// A real 1x1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWM4UaEBAAN0AWme5/1hAAAAAElFTkSuQmCC',
  'base64',
);
let JPEG: Buffer;

describe('files (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Agent;
  let office: Agent;

  /** Is there still a file on disk under this key? (The e2e suite uses local storage.) */
  const storageHas = (key: string) =>
    existsSync(join(process.env.FILES_DIR!, key));

  const upload = (
    who: Agent,
    data: Buffer,
    name = 'photo.png',
    purpose: string | null = 'application-photo',
  ) => {
    const req = who.post('/api/files');
    if (purpose !== null) req.field('purpose', purpose);
    return req.attach('file', data, { filename: name });
  };

  beforeAll(async () => {
    JPEG = await makeImage('jpeg');
    ({ app, prisma } = await createTestApp());
    admin = await adminAgent(app);
    office = (await createSettledUser(app, admin, 'OFFICE_STAFF')).agent;
  });
  afterAll(() => app.close());

  describe('uploading', () => {
    it('stores a real image and returns its id', async () => {
      const res = await upload(office, PNG).expect(201);
      expect(res.body).toMatchObject({
        purpose: 'application-photo',
        mimeType: 'image/png',
        sizeBytes: expect.any(Number),
      });
      expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('accepts JPEG too, and works out the type from the content, not the name', async () => {
      const res = await upload(office, JPEG, 'looks-like-text.txt').expect(201);
      expect(res.body.mimeType).toBe('image/jpeg');
    });

    it('is only for people who may add files for that purpose', async () => {
      const accountant = await createSettledUser(app, admin, 'ACCOUNTANT'); // may read admissions, not change them
      await upload(accountant.agent, PNG).expect(403);
      for (const role of ['TEACHER', 'PARENT', 'STAFF']) {
        const user = await createSettledUser(app, admin, role);
        await upload(user.agent, PNG).expect(403);
      }
      const anonymous = request(app.getHttpServer());
      await anonymous
        .post('/api/files')
        .field('purpose', 'application-photo')
        .attach('file', PNG, 'a.png')
        .expect(401);
    });

    it('rejects a missing file, an empty file, and an unknown or missing purpose', async () => {
      await office
        .post('/api/files')
        .field('purpose', 'application-photo')
        .expect(400);
      await upload(office, Buffer.alloc(0)).expect(400);
      await upload(office, PNG, 'a.png', 'secret-documents').expect(400);
      await upload(office, PNG, 'a.png', null).expect(400);
    });

    it.each([
      [
        'a text file renamed to .png',
        Buffer.from('just some text'),
        'fake.png',
      ],
      [
        'HTML',
        Buffer.from('<html><script>alert(1)</script></html>'),
        'page.png',
      ],
      [
        'SVG (can carry scripts)',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
        'logo.svg',
      ],
      ['a PDF', Buffer.from('%PDF-1.7 fake'), 'form.pdf'],
      ['a GIF', Buffer.from('GIF89a......'), 'anim.gif'],
    ])('rejects %s', async (_name, data, filename) => {
      await upload(office, data, filename).expect(415);
    });

    it('stores only the picture: no location data, upright, and a sensible size', async () => {
      const photo = await makeImage('jpeg', 3000, 2000, {
        IFD0: { Copyright: 'SECRET-OWNER' },
      });
      const { id } = (await upload(office, photo, 'holiday.jpg').expect(201))
        .body;
      const res = await office
        .get(`/api/files/${id}`)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      const stored = res.body as Buffer;
      expect(stored.toString('latin1')).not.toContain('SECRET-OWNER');
      const meta = await sharp(stored).metadata();
      expect([meta.width, meta.height]).toEqual([1600, 1067]);
      const row = await prisma.storedFile.findUniqueOrThrow({ where: { id } });
      expect(row.sizeBytes).toBe(stored.length);
    });

    it('refuses a file that has an image header but is not a picture', async () => {
      const fake = Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
        Buffer.alloc(64),
      ]);
      const res = await upload(office, fake, 'fake.jpg').expect(415);
      expect(res.body.message).toMatch(/could not be read/);
    });

    it('rejects a file that is too large', async () => {
      const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
      await upload(office, big).expect(413);
    });

    it('records the upload in the audit log without the file name or contents', async () => {
      const res = await upload(office, PNG, 'child-photo.png').expect(201);
      const log = await admin
        .get('/api/audit-logs?action=files.&pageSize=100')
        .expect(200);
      const entry = log.body.items.find(
        (i: { entityId: string }) => i.entityId === res.body.id,
      );
      expect(entry.action).toBe('files.uploaded');
      expect(JSON.stringify(entry)).not.toContain('child-photo');
    });
  });

  describe('viewing', () => {
    it('returns the image bytes with safe headers to people allowed to see them', async () => {
      const { id } = (await upload(office, PNG).expect(201)).body;
      const res = await office
        .get(`/api/files/${id}`)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(res.headers['content-type']).toMatch(/^image\/png/);
      expect(res.headers['cache-control']).toBe('private, max-age=3600');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-disposition']).toMatch(/^inline/);
      expect(sniffImage(res.body as Buffer)?.mime).toBe('image/png');

      const accountant = await createSettledUser(app, admin, 'ACCOUNTANT');
      await accountant.agent.get(`/api/files/${id}`).expect(200); // may read admissions
    });

    it('does not reveal files to people who may not see them, or that they exist', async () => {
      const { id } = (await upload(office, PNG).expect(201)).body;
      const teacher = await createSettledUser(app, admin, 'TEACHER');
      const parent = await createSettledUser(app, admin, 'PARENT');
      const missing = (
        await teacher.agent.get(`/api/files/${randomUUID()}`).expect(404)
      ).body;
      const forbidden = (
        await teacher.agent.get(`/api/files/${id}`).expect(404)
      ).body;
      await parent.agent.get(`/api/files/${id}`).expect(404);
      expect(forbidden).toEqual(missing); // identical, so ids cannot be probed
      await request(app.getHttpServer()).get(`/api/files/${id}`).expect(401);
    });

    it('rejects a malformed id', () =>
      office.get('/api/files/not-a-uuid').expect(400));

    it("never serves another school's file", async () => {
      const other = await prisma.school.create({
        data: { name: unique('Other'), code: unique('other').toLowerCase() },
      });
      const foreign = await prisma.storedFile.create({
        data: {
          schoolId: other.id,
          purpose: 'application-photo',
          storageKey: `${other.id}/2026/${randomUUID()}.png`,
          originalName: 'x.png',
          mimeType: 'image/png',
          sizeBytes: 1,
          uploadedById: randomUUID(),
        },
      });
      await office.get(`/api/files/${foreign.id}`).expect(404);
      await admin.get(`/api/files/${foreign.id}`).expect(404);
    });
  });

  describe('photographs on an application', () => {
    let classId: string;
    const answers = (over: Record<string, unknown> = {}) => ({
      classApplied: classId,
      surname: 'Shaikh',
      firstName: unique('Ayaan'),
      gender: 'MALE',
      dateOfBirth: '2021-06-15',
      undertakingReceived: true,
      ...over,
    });

    beforeAll(async () => {
      const years = (await admin.get('/api/academic-years').expect(200))
        .body as { isCurrent: boolean }[];
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
      classId = (
        await admin
          .post('/api/classes')
          .send({ name: unique('Nursery') })
          .expect(201)
      ).body.id;
    });

    it('cleans up old uploads that were never attached, and only those', async () => {
      const files = app.get(FilesService);
      const mk = async () => (await upload(office, PNG).expect(201)).body.id;
      const attached = await mk();
      const abandoned = await mk();
      const fresh = await mk();
      await office
        .post('/api/admissions/applications')
        .send({ answers: answers({ childPhoto: attached }) })
        .expect(201);

      const old = new Date(Date.now() - 48 * 3_600_000);
      await prisma.storedFile.updateMany({
        where: { id: { in: [attached, abandoned] } },
        data: { createdAt: old },
      });
      const key = (
        await prisma.storedFile.findUniqueOrThrow({ where: { id: abandoned } })
      ).storageKey;

      const removed = await files.purgeUnattached(24);
      expect(removed).toBeGreaterThanOrEqual(1);

      const left = await prisma.storedFile.findMany({
        where: { id: { in: [attached, abandoned, fresh] } },
        select: { id: true },
      });
      expect(left.map((f) => f.id).sort((a, b) => a.localeCompare(b))).toEqual(
        [attached, fresh].sort((a, b) => a.localeCompare(b)),
      );
      await office.get(`/api/files/${abandoned}`).expect(404);
      await office.get(`/api/files/${attached}`).expect(200);
      expect(storageHas(key)).toBe(false);
    });

    it('the published admission form has the four photograph boxes', async () => {
      const form = (await office.get('/api/admissions/form').expect(200)).body;
      const photos = (
        form.schema.sections as { fields: { id: string; type: string }[] }[]
      )
        .flatMap((s) => s.fields)
        .filter((f) => f.type === 'image')
        .map((f) => f.id);
      expect(photos).toEqual([
        'childPhoto',
        'motherPhoto',
        'fatherPhoto',
        'guardianPhoto',
      ]);
    });

    it('keeps uploaded photographs with the application', async () => {
      const child = (await upload(office, PNG).expect(201)).body.id;
      const mother = (await upload(office, JPEG, 'mother.jpg').expect(201)).body
        .id;
      const created = await office
        .post('/api/admissions/applications')
        .send({ answers: answers({ childPhoto: child, motherPhoto: mother }) })
        .expect(201);
      expect(created.body.answers).toMatchObject({
        childPhoto: child,
        motherPhoto: mother,
      });
      await office.get(`/api/files/${child}`).expect(200);
    });

    it('photographs are optional', async () => {
      const created = await office
        .post('/api/admissions/applications')
        .send({ answers: answers() })
        .expect(201);
      expect(created.body.answers).not.toHaveProperty('childPhoto');
    });

    it('rejects a photograph id that was never uploaded', async () => {
      const res = await office
        .post('/api/admissions/applications')
        .send({ answers: answers({ childPhoto: randomUUID() }) })
        .expect(400);
      expect(res.body.errors.childPhoto).toMatch(/upload the photograph/);
    });

    it("rejects another school's photograph, even with a real id", async () => {
      const other = await prisma.school.create({
        data: { name: unique('Other'), code: unique('other').toLowerCase() },
      });
      const foreign = await prisma.storedFile.create({
        data: {
          schoolId: other.id,
          purpose: 'application-photo',
          storageKey: `${other.id}/2026/${randomUUID()}.png`,
          originalName: 'x.png',
          mimeType: 'image/png',
          sizeBytes: 1,
          uploadedById: randomUUID(),
        },
      });
      const res = await office
        .post('/api/admissions/applications')
        .send({ answers: answers({ childPhoto: foreign.id }) })
        .expect(400);
      expect(res.body.errors.childPhoto).toBeDefined();
    });

    it('can replace a photograph when editing', async () => {
      const first = (await upload(office, PNG).expect(201)).body.id;
      const second = (await upload(office, JPEG, 'new.jpg').expect(201)).body
        .id;
      const app1 = (
        await office
          .post('/api/admissions/applications')
          .send({ answers: answers({ childPhoto: first }) })
          .expect(201)
      ).body;
      const updated = await office
        .patch(`/api/admissions/applications/${app1.id}`)
        .send({ answers: answers({ childPhoto: second }) })
        .expect(200);
      expect(updated.body.answers.childPhoto).toBe(second);
    });
  });
});
