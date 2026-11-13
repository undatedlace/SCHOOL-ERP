import { INestApplication } from '@nestjs/common';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
  unique,
} from './helpers.js';

/**
 * Filling an application from photos. The Python OCR service is replaced by a
 * small HTTP server that answers like it, so this tests Nest's side: access,
 * upload checks, the call, and mapping onto the published form.
 */
describe('admission OCR (e2e)', () => {
  let app: INestApplication;
  let admin: Agent;
  let office: Agent;
  let teacher: Agent;
  let ocr: Server;
  let received: { token?: string; parts: number } | null = null;
  let nurseryId: string;
  let jpeg: Buffer;

  const field = (value: unknown, confidence = 0.9) => ({
    value,
    confidence,
    raw: value,
    valid: true,
    check: confidence < 0.6,
  });

  beforeAll(async () => {
    ocr = createServer((req, res) => {
      let size = 0;
      req.on('data', (c: Buffer) => (size += c.length));
      req.on('end', () => {
        const body = String(req.headers['content-type'] ?? '');
        received = {
          token: req.headers['x-ocr-token'] as string | undefined,
          parts: body.includes('multipart/form-data') && size > 0 ? 1 : 0,
        };
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            fields: {
              admissionClass: field('NURSERY', 0.97),
              'student.name.surname': field('MEMON'),
              'student.name.childName': field('ASRA', 0.42),
              'student.dateOfBirth': field('04/08/2022'),
              'father.age': field('38'),
              formNo: field('77'),
            },
            missingPanels: ['page3'],
            seconds: 2.1,
            reader: 'stub',
          }),
        );
      });
    });
    await new Promise<void>((r) => ocr.listen(0, '127.0.0.1', r));
    process.env.OCR_SERVICE_URL = `http://127.0.0.1:${(ocr.address() as AddressInfo).port}`;
    process.env.OCR_SERVICE_TOKEN = 'test-token';

    ({ app } = await createTestApp());
    admin = await adminAgent(app);
    office = (
      await createSettledUser(app, admin, 'OFFICE_STAFF', 'Front Office')
    ).agent;
    teacher = (await createSettledUser(app, admin, 'TEACHER')).agent;

    const classes = (await admin.get('/api/classes').expect(200)).body as {
      id: string;
      name: string;
    }[];
    nurseryId =
      classes.find((c) => c.name === 'Nursery')?.id ??
      (
        (await admin.post('/api/classes').send({ name: 'Nursery' }).expect(201))
          .body as { id: string }
      ).id;

    jpeg = await sharp({
      create: { width: 40, height: 40, channels: 3, background: '#ffffff' },
    })
      .jpeg()
      .toBuffer();
  });

  afterAll(async () => {
    await app.close();
    await new Promise((r) => ocr.close(r));
    delete process.env.OCR_SERVICE_URL;
    delete process.env.OCR_SERVICE_TOKEN;
  });

  it('tells the office the feature is available', async () => {
    const res = await office.get('/api/admissions/ocr/status').expect(200);
    expect(res.body).toEqual({ available: true });
  });

  it('reads photos into answers for the published form', async () => {
    const res = await office
      .post('/api/admissions/ocr')
      .attach('files', jpeg, 'page1.jpg')
      .attach('files', jpeg, 'page2.jpg')
      .expect(200);
    expect(received).toEqual({ token: 'test-token', parts: 1 });
    expect(res.body.answers).toMatchObject({
      classApplied: nurseryId,
      surname: 'MEMON',
      firstName: 'ASRA',
      dateOfBirth: '2022-08-04',
      fatherAge: 38,
    });
    expect(res.body.header).toEqual({ formNo: '77' });
    expect(res.body.review.firstName).toMatchObject({ confidence: 0.42 });
    expect(res.body.summary).toMatchObject({
      missingPages: ['page3'],
      reader: 'stub',
    });
  });

  it('refuses a file that is not a photo, before calling the reader', async () => {
    received = null;
    const res = await office
      .post('/api/admissions/ocr')
      .attach('files', Buffer.from('%PDF-1.7 not a photo'), 'form.jpg')
      .expect(400);
    expect(res.body.message).toMatch(/not a JPEG/);
    expect(received).toBeNull();
  });

  it('needs at least one photo', async () => {
    await office.post('/api/admissions/ocr').expect(400);
  });

  it('is only for people who manage admissions', async () => {
    await teacher
      .post('/api/admissions/ocr')
      .attach('files', jpeg, unique('p') + '.jpg')
      .expect(403);
    await teacher.get('/api/admissions/ocr/status').expect(403);
  });
});
