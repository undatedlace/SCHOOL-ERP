import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service.js';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
  unique,
} from './helpers.js';
import { downloadXlsx, fillSheet, uploadXlsx } from './xlsx-helpers.js';

describe('fees import from Excel (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Agent;
  let accountant: Agent;
  let office: Agent;
  let schoolId: string;

  // A year long ago that no other suite uses, and the next one.
  const Y0 = 1500 + Math.floor(Math.random() * 90) * 2;
  const YEAR = {
    name: unique('FeeY'),
    start: `${Y0}-06-01`,
    end: `${Y0 + 1}-05-31`,
  };
  const NEXT = {
    name: unique('FeeN'),
    start: `${Y0 + 1}-06-01`,
    end: `${Y0 + 2}-05-31`,
  };
  let yearId: string;
  let nextId: string;
  const students: { id: string; admissionNo: string }[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await adminAgent(app);
    accountant = (await createSettledUser(app, admin, 'ACCOUNTANT')).agent;
    office = (await createSettledUser(app, admin, 'OFFICE_STAFF')).agent;
    schoolId = (
      await prisma.school.findFirstOrThrow({ orderBy: { createdAt: 'asc' } })
    ).id;
    const year = async (y: typeof YEAR) =>
      (
        await prisma.academicYear.create({
          data: {
            schoolId,
            name: y.name,
            startDate: new Date(`${y.start}T00:00:00Z`),
            endDate: new Date(`${y.end}T00:00:00Z`),
          },
        })
      ).id;
    yearId = await year(YEAR);
    nextId = await year(NEXT);
    const cls = await prisma.schoolClass.create({
      data: {
        schoolId,
        name: unique('FeeImp'),
        sortOrder: 7_000_000 + Math.floor(Math.random() * 100_000),
      },
    });
    const div = await prisma.division.create({
      data: { schoolId, classId: cls.id, name: 'A' },
    });
    const last = await prisma.student.aggregate({
      where: { schoolId },
      _max: { seq: true },
    });
    for (const [i, first] of ['Asma', 'Bushra', 'Chand'].entries()) {
      const s = await prisma.student.create({
        data: {
          schoolId,
          seq: (last._max.seq ?? 0) + 1 + i,
          admissionNo: unique('FI'),
          firstName: first,
          surname: 'Fees',
          gender: 'FEMALE',
          dateOfBirth: new Date(`${Y0 - 6}-01-01T00:00:00Z`),
          joinedOn: new Date(`${YEAR.start}T00:00:00Z`),
        },
      });
      for (const y of [yearId, nextId])
        await prisma.enrollment.create({
          data: {
            schoolId,
            studentId: s.id,
            academicYearId: y,
            divisionId: div.id,
            startedOn: new Date(
              `${y === yearId ? YEAR.start : NEXT.start}T00:00:00Z`,
            ),
          },
        });
      students.push({ id: s.id, admissionNo: s.admissionNo });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const ledger = async (studentId: string) =>
    (await accountant.get(`/api/students/${studentId}/fees`).expect(200)).body;

  it('is only for people who bill and take fees', async () => {
    await office
      .get(`/api/imports/fees/template?academicYearId=${yearId}`)
      .expect(403);
  });

  it('lists every student enrolled that year, one sheet per year', async () => {
    const wb = await downloadXlsx(
      accountant,
      `/api/imports/fees/template?academicYearId=${yearId}`,
    );
    const ws = wb.getWorksheet(YEAR.name)!;
    const nos = [3, 4, 5].map((r) => ws.getRow(r).getCell(1).value);
    expect(nos).toHaveLength(3);
    expect(nos).toEqual(
      expect.arrayContaining(students.map((s) => s.admissionNo)),
    );
  });

  let batchId: string;

  it('bills the year and records what was paid, with the due worked out', async () => {
    const wb = await downloadXlsx(
      accountant,
      `/api/imports/fees/template?academicYearId=${yearId}`,
    );
    const ws = wb.getWorksheet(YEAR.name)!;
    const rowOf = (no: string) => {
      for (let r = 3; r <= 5; r++)
        if (ws.getRow(r).getCell(1).value === no) return r;
      throw new Error('missing');
    };
    const [a, b] = students;
    fillSheet(
      wb,
      YEAR.name,
      [
        {
          billed: 12000,
          paid: 4500.5,
          paidOn: `10/09/${Y0}`,
          mode: 'UPI',
          reference: 'old 101-104',
        },
      ],
      rowOf(a.admissionNo),
    );
    fillSheet(
      wb,
      YEAR.name,
      [{ billed: '5,000', paid: 6000 }],
      rowOf(b.admissionNo),
    );
    // The third is left blank: skipped.

    const checked = (
      await uploadXlsx(accountant, '/api/imports/fees/check', wb, 201)
    ).body;
    expect(checked.summary).toMatchObject({
      total: 3,
      ready: 1,
      withErrors: 1,
      unchanged: 1,
    });
    const bad = checked.rows.find((r: { errors: string[] }) => r.errors.length);
    expect(bad.errors[0]).toMatch(/more than billed/);
    batchId = checked.id;

    const done = (
      await accountant.post(`/api/imports/batches/${batchId}/run`).expect(200)
    ).body;
    expect(done.summary).toMatchObject({ imported: 1, failed: 0 });

    const l = await ledger(a.id);
    expect(l.totals).toMatchObject({
      gross: '12000.00',
      paid: '4500.50',
      pending: '7499.50',
    });
    const pay = l.payments[0];
    expect(pay).toMatchObject({
      amount: '4500.50',
      mode: 'UPI',
      reference: 'old 101-104',
      paidOn: `${Y0}-09-10`,
    });
    // The receipt is in the series of the year it was paid in.
    expect(pay.receiptNo.startsWith(`${YEAR.name}/`)).toBe(true);
    const invoice = await prisma.feeInvoice.findFirstOrThrow({
      where: { studentId: a.id },
    });
    expect(invoice.importBatchId).toBe(batchId);
    expect(invoice.kind).toBe('FEE_STRUCTURE');
  });

  it('shows what is already recorded, skips it on a second upload, and never pays twice', async () => {
    const wb = await downloadXlsx(
      accountant,
      `/api/imports/fees/template?academicYearId=${yearId}`,
    );
    const ws = wb.getWorksheet(YEAR.name)!;
    const keys = ws.getRow(1).values as unknown[];
    const r = [3, 4, 5].find(
      (n) => ws.getRow(n).getCell(1).value === students[0].admissionNo,
    )!;
    expect(ws.getRow(r).getCell(keys.indexOf('billed')).value).toBe(12000);
    expect(ws.getRow(r).getCell(keys.indexOf('paid')).value).toBe(4500.5);

    const same = (
      await uploadXlsx(accountant, '/api/imports/fees/check', wb, 201)
    ).body;
    expect(same.summary).toMatchObject({
      ready: 0,
      unchanged: 3,
      withErrors: 0,
    });

    ws.getRow(r).getCell(keys.indexOf('paid')).value = 6000;
    const more = (
      await uploadXlsx(accountant, '/api/imports/fees/check', wb, 201)
    ).body;
    expect(more.summary.withErrors).toBe(1);
    expect(
      more.rows.find((x: { errors: string[] }) => x.errors.length).errors[0],
    ).toMatch(/already recorded/);
  });

  it("takes one student's year typed in by hand, by the same rules", async () => {
    const c = students[2];
    await accountant
      .post('/api/imports/fees/single')
      .send({
        studentId: c.id,
        academicYearId: nextId,
        billed: '3000',
        paid: '3000',
        paidOn: `${Y0 + 1}-07-01`,
        mode: 'CASH',
      })
      .expect(201);
    await accountant
      .post('/api/imports/fees/single')
      .send({
        studentId: c.id,
        academicYearId: nextId,
        billed: '3000',
        paid: '3000',
      })
      .expect(400); // already recorded
    await accountant
      .post('/api/imports/fees/single')
      .send({
        studentId: c.id,
        academicYearId: yearId,
        billed: '100',
        paid: '200',
      })
      .expect(400);
    const l = await ledger(c.id);
    expect(l.totals).toMatchObject({
      gross: '3000.00',
      paid: '3000.00',
      pending: '0.00',
    });
  });

  it('carries earlier dues forward: both years of a student add up', async () => {
    const wb = await downloadXlsx(
      accountant,
      '/api/imports/fees/template?academicYearId=all',
    );
    expect(wb.getWorksheet(YEAR.name)).toBeTruthy();
    expect(wb.getWorksheet(NEXT.name)).toBeTruthy();
    const ws = wb.getWorksheet(NEXT.name)!;
    const r = [3, 4, 5].find(
      (n) => ws.getRow(n).getCell(1).value === students[0].admissionNo,
    )!;
    fillSheet(wb, NEXT.name, [{ billed: 13000 }], r);
    const checked = (
      await uploadXlsx(accountant, '/api/imports/fees/check', wb, 201)
    ).body;
    expect(checked.summary.ready).toBe(1);
    await accountant.post(`/api/imports/batches/${checked.id}/run`).expect(200);
    const l = await ledger(students[0].id);
    expect(l.totals).toMatchObject({
      gross: '25000.00',
      paid: '4500.50',
      pending: '20499.50',
    });
  });

  it('refuses another kind of template', async () => {
    const wb = await downloadXlsx(admin, '/api/imports/admissions/template');
    const res = await uploadXlsx(
      accountant,
      '/api/imports/fees/check',
      wb,
      400,
    );
    expect(res.body.message).toMatch(/admissions template/);
  });
});
