import { INestApplication } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../src/database/prisma.service.js';
import { FilesService } from '../src/modules/files/files.service.js';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
  loginAndSettle,
  unique,
} from './helpers.js';
import { makeImage } from './support/images.js';
import { makePdf, withJavaScript } from './support/pdfs.js';

describe('student documents (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Agent;
  let office: Agent;
  let studentId: string;
  let parent: Agent;

  const upload = (who: Agent, data: Buffer, name: string) =>
    who
      .post('/api/files')
      .field('purpose', 'student-document')
      .attach('file', data, { filename: name });
  const attach = (fileId: string, type = 'BIRTH_CERTIFICATE', who = office) =>
    who.post(`/api/students/${studentId}/documents`).send({ fileId, type });

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await adminAgent(app);
    office = (await createSettledUser(app, admin, 'OFFICE_STAFF')).agent;

    const years = (await admin.get('/api/academic-years').expect(200)).body as {
      isCurrent: boolean;
    }[];
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
    const classId = (
      await admin
        .post('/api/classes')
        .send({ name: unique('KG') })
        .expect(201)
    ).body.id;
    const divisionId = (
      await admin
        .post(`/api/classes/${classId}/divisions`)
        .send({ name: 'A' })
        .expect(201)
    ).body.id;
    const app1 = (
      await office
        .post('/api/admissions/applications')
        .send({
          answers: {
            classApplied: classId,
            surname: unique('Doc'),
            firstName: 'Ria',
            gender: 'FEMALE',
            dateOfBirth: '2021-06-15',
            undertakingReceived: true,
          },
        })
        .expect(201)
    ).body.id;
    await office
      .post(`/api/admissions/applications/${app1}/decision`)
      .send({ decision: 'GRANTED' })
      .expect(200);
    const mobile = `9${Math.floor(100000000 + Math.random() * 899999999)}`;
    studentId = (
      await office
        .post(`/api/admissions/applications/${app1}/admit`)
        .send({
          divisionId,
          guardians: [
            { fullName: 'Parent Doc', relationship: 'FATHER', mobile },
          ],
        })
        .expect(201)
    ).body.studentId;
    const guardianId = (
      await admin.get(`/api/students/${studentId}`).expect(200)
    ).body.guardians[0].id;
    const login = (
      await office.post(`/api/guardians/${guardianId}/account`).expect(201)
    ).body;
    parent = await loginAndSettle(
      app,
      mobile,
      login.temporaryPassword,
      'Parent-Pass-123',
    );
  });
  afterAll(() => app.close());

  it('keeps a PDF as uploaded and serves it as a download, never inline', async () => {
    const pdf = await makePdf(2);
    const up = await upload(office, pdf, 'birth certificate.pdf').expect(201);
    expect(up.body.mimeType).toBe('application/pdf');

    const doc = (await attach(up.body.id).expect(201)).body;
    expect(doc).toMatchObject({ type: 'BIRTH_CERTIFICATE', studentId });

    const res = await office
      .get(`/api/files/${up.body.id}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((res.body as Buffer).equals(pdf)).toBe(true);
    expect(res.headers['content-type']).toMatch(/^application\/pdf/);
    expect(res.headers['content-disposition']).toMatch(/^attachment/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toMatch(/sandbox/);
  });

  it('also takes a photograph of a paper, which is cleaned like any photo', async () => {
    const photo = await makeImage('jpeg', 3000, 2000);
    const up = await upload(office, photo, 'tc.jpg').expect(201);
    expect(up.body.mimeType).toBe('image/jpeg');
    await attach(up.body.id, 'TRANSFER_CERTIFICATE').expect(201);
  });

  it('refuses dangerous or fake PDFs', async () => {
    const bad: [string, Buffer][] = [
      ['javascript', await makePdf(1, { onCatalog: withJavaScript })],
      [
        'javascript in object streams',
        await makePdf(1, { objectStreams: true, onCatalog: withJavaScript }),
      ],
      ['not a pdf', Buffer.from('<script>alert(1)</script>')],
      [
        'junk before the signature',
        Buffer.concat([Buffer.from('x'), await makePdf()]),
      ],
      ['damaged', (await makePdf()).subarray(0, 100)],
      ['too many pages', await makePdf(51)],
    ];
    for (const [name, data] of bad) {
      const res = await upload(office, data, 'x.pdf');
      expect(res.status, name).toBe(415);
    }
  });

  it('PDFs are not accepted as photographs', async () => {
    await office
      .post('/api/files')
      .field('purpose', 'application-photo')
      .attach('file', await makePdf(), { filename: 'p.pdf' })
      .expect(415);
  });

  it('is staff only: parents cannot upload, list, or open documents', async () => {
    const up = await upload(office, await makePdf(), 'a.pdf').expect(201);
    await attach(up.body.id, 'MEDICAL').expect(201);

    await upload(parent, await makePdf(), 'a.pdf').expect(403);
    await parent.get(`/api/students/${studentId}/documents`).expect(403);
    await parent.get(`/api/files/${up.body.id}`).expect(404);

    for (const role of ['TEACHER', 'ACCOUNTANT']) {
      const who = await createSettledUser(app, admin, role);
      await upload(who.agent, await makePdf(), 'a.pdf').expect(403);
    }
    // Accountants and the office may read; the list works for them.
    const acct = await createSettledUser(app, admin, 'ACCOUNTANT');
    await acct.agent.get(`/api/students/${studentId}/documents`).expect(200);
    await attach(up.body.id, 'MEDICAL', acct.agent).expect(403);
  });

  it('lists a student’s documents and records the changes in the audit log', async () => {
    const list = (
      await office.get(`/api/students/${studentId}/documents`).expect(200)
    ).body;
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0]).toMatchObject({ fileId: expect.any(String) });
    for (const action of ['students.document_added']) {
      const res = await admin
        .get(`/api/audit-logs?action=${action}`)
        .expect(200);
      expect(res.body.total).toBeGreaterThan(0);
    }
  });

  it('will not attach the same file twice, a missing file, or a photo-purpose file', async () => {
    const up = await upload(office, await makePdf(), 'a.pdf').expect(201);
    await attach(up.body.id).expect(201);
    await attach(up.body.id).expect(409);
    await attach('00000000-0000-4000-8000-000000000000').expect(400);
    const photo = await office
      .post('/api/files')
      .field('purpose', 'application-photo')
      .attach('file', await makeImage('png'), { filename: 'p.png' })
      .expect(201);
    await attach(photo.body.id).expect(400);
    await office
      .post(`/api/students/${studentId}/documents`)
      .send({ fileId: up.body.id, type: 'NOT_A_TYPE' })
      .expect(400);
    await office
      .post('/api/students/00000000-0000-4000-8000-000000000000/documents')
      .send({ fileId: up.body.id, type: 'OTHER' })
      .expect(404);
  });

  it('removing a document deletes the file too, and the cleanup leaves attached ones alone', async () => {
    const up = await upload(office, await makePdf(), 'gone.pdf').expect(201);
    const doc = (await attach(up.body.id, 'OTHER').expect(201)).body;
    const kept = await upload(office, await makePdf(), 'kept.pdf').expect(201);
    await attach(kept.body.id, 'OTHER').expect(201);
    const row = await prisma.storedFile.findUniqueOrThrow({
      where: { id: up.body.id },
    });
    const keptRow = await prisma.storedFile.findUniqueOrThrow({
      where: { id: kept.body.id },
    });

    await prisma.storedFile.updateMany({
      where: { id: kept.body.id },
      data: { createdAt: new Date(Date.now() - 72 * 3_600_000) },
    });
    await app.get(FilesService).purgeUnattached(24);
    await office.get(`/api/files/${kept.body.id}`).expect(200);

    await office
      .delete(`/api/students/${studentId}/documents/${doc.id}`)
      .expect(204);
    await office.get(`/api/files/${up.body.id}`).expect(404);
    expect(existsSync(join(process.env.FILES_DIR!, row.storageKey))).toBe(
      false,
    );
    expect(existsSync(join(process.env.FILES_DIR!, keptRow.storageKey))).toBe(
      true,
    );
    await office
      .delete(`/api/students/${studentId}/documents/${doc.id}`)
      .expect(404);
  });
});
