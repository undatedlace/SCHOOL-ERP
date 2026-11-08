import { INestApplication } from '@nestjs/common';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
} from './helpers.js';
import { startFakeS3 } from './support/fake-s3-server.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);

const S3_ENV = [
  'FILES_DRIVER',
  'S3_BUCKET',
  'S3_REGION',
  'S3_ENDPOINT',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_FORCE_PATH_STYLE',
  'S3_KEY_PREFIX',
] as const;

describe('files stored in S3 (e2e)', () => {
  let fake: Awaited<ReturnType<typeof startFakeS3>>;
  let app: INestApplication;
  let admin: Agent;
  let office: Agent;
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    fake = await startFakeS3('erp-files');
    for (const name of S3_ENV) saved[name] = process.env[name];
    Object.assign(process.env, {
      FILES_DRIVER: 's3',
      S3_BUCKET: 'erp-files',
      S3_REGION: 'ap-south-1',
      S3_ENDPOINT: fake.endpoint,
      S3_ACCESS_KEY_ID: 'AKIATESTKEY',
      S3_SECRET_ACCESS_KEY: 'test-secret',
      S3_FORCE_PATH_STYLE: 'true',
      S3_KEY_PREFIX: 'school-erp',
    });
    ({ app } = await createTestApp());
    admin = await adminAgent(app);
    office = (await createSettledUser(app, admin, 'OFFICE_STAFF')).agent;
  });

  afterAll(async () => {
    await app.close();
    await fake.close();
    for (const name of S3_ENV) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  const upload = (who: Agent) =>
    who
      .post('/api/files')
      .field('purpose', 'application-photo')
      .attach('file', PNG, 'p.png');

  it('keeps an uploaded photograph in the bucket, under the prefix, with its image type', async () => {
    const { id } = (await upload(office).expect(201)).body;
    const keys = [...fake.objects.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(
      /^school-erp\/[0-9a-f-]{36}\/\d{4}\/[0-9a-f-]{36}\.png$/,
    );
    const stored = fake.objects.get(keys[0]);
    expect(stored?.body.equals(PNG)).toBe(true);
    expect(stored?.contentType).toBe('image/png');
    expect(id).toBeDefined();
  });

  it('serves it back through the API, privately, to people who may see it', async () => {
    const { id } = (await upload(office).expect(201)).body;
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
    expect((res.body as Buffer).equals(PNG)).toBe(true);
  });

  it('the permission checks still apply, and are made before anything is fetched from the bucket', async () => {
    const { id } = (await upload(office).expect(201)).body;
    const parent = await createSettledUser(app, admin, 'PARENT');
    const before = fake.requests.filter((r) => r.method === 'GET').length;
    await parent.agent.get(`/api/files/${id}`).expect(404);
    expect(fake.requests.filter((r) => r.method === 'GET').length).toBe(before);
  });

  it('a refused or rejected upload leaves nothing in the bucket', async () => {
    const before = fake.objects.size;
    await office
      .post('/api/files')
      .field('purpose', 'application-photo')
      .attach('file', Buffer.from('not an image'), 'x.png')
      .expect(415);
    await office
      .post('/api/files')
      .field('purpose', 'nonsense')
      .attach('file', PNG, 'x.png')
      .expect(400);
    expect(fake.objects.size).toBe(before);
  });
});
