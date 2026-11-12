import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service.js';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
  loginAndSettle,
  unique,
} from './helpers.js';

const PAST = '2020-01-10';
const FUTURE = '2099-01-10';
const mobile = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;

describe('fees (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Agent;
  let accountant: Agent;
  let office: Agent;
  let teacher: Agent;

  let yearId: string;
  let classId: string;
  let divisionId: string;
  let bareClassId: string; // a class with no fee structure
  let bareDivisionId: string;
  let tuition: string;
  let exam: string;

  async function admitInto(
    division: string,
    cls: string,
    guardianMobile = mobile(),
    surname = unique('Fee'),
    gender: 'MALE' | 'FEMALE' = 'FEMALE',
  ) {
    const created = (
      await office
        .post('/api/admissions/applications')
        .send({
          answers: {
            classApplied: cls,
            surname,
            firstName: 'Noor',
            gender,
            dateOfBirth: '2021-06-15',
            undertakingReceived: true,
          },
        })
        .expect(201)
    ).body.id;
    await office
      .post(`/api/admissions/applications/${created}/decision`)
      .send({ decision: 'GRANTED' })
      .expect(200);
    const studentId = (
      await office
        .post(`/api/admissions/applications/${created}/admit`)
        .send({
          divisionId: division,
          guardians: [
            {
              fullName: 'Fee Parent',
              relationship: 'FATHER',
              mobile: guardianMobile,
              isPrimary: true,
            },
          ],
        })
        .expect(201)
    ).body.studentId as string;
    return { studentId, mobile: guardianMobile, surname };
  }

  /** A student with this year's invoice generated. */
  async function billedStudent() {
    const s = await admitInto(divisionId, classId);
    await accountant
      .post('/api/fee-invoices/generate')
      .send({ studentIds: [s.studentId] })
      .expect(200);
    return s;
  }
  const fees = (id: string, who: Agent = accountant) =>
    who.get(`/api/students/${id}/fees`);
  const pay = (
    id: string,
    body: Record<string, unknown>,
    who: Agent = accountant,
  ) => who.post(`/api/students/${id}/payments`).send({ mode: 'CASH', ...body });

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await adminAgent(app);
    accountant = (await createSettledUser(app, admin, 'ACCOUNTANT')).agent;
    office = (await createSettledUser(app, admin, 'OFFICE_STAFF')).agent;
    teacher = (await createSettledUser(app, admin, 'TEACHER')).agent;

    const years = (await admin.get('/api/academic-years').expect(200)).body as {
      id: string;
      isCurrent: boolean;
    }[];
    yearId =
      years.find((y) => y.isCurrent)?.id ??
      (
        await admin
          .post('/api/academic-years')
          .send({
            name: unique('AY'),
            startDate: '2026-04-01',
            endDate: '2027-03-31',
            isCurrent: true,
          })
          .expect(201)
      ).body.id;

    const cls = async (name: string) =>
      (await admin.post('/api/classes').send({ name }).expect(201)).body
        .id as string;
    const div = async (c: string) =>
      (
        await admin
          .post(`/api/classes/${c}/divisions`)
          .send({ name: 'A' })
          .expect(201)
      ).body.id as string;
    classId = await cls(unique('Fees-Class'));
    divisionId = await div(classId);
    bareClassId = await cls(unique('Bare-Class'));
    bareDivisionId = await div(bareClassId);

    tuition = (
      await accountant
        .post('/api/fee-heads')
        .send({ name: unique('Tuition') })
        .expect(201)
    ).body.id;
    exam = (
      await accountant
        .post('/api/fee-heads')
        .send({ name: unique('Exam') })
        .expect(201)
    ).body.id;
    await accountant
      .put('/api/fee-structures')
      .send({
        academicYearId: yearId,
        classId,
        items: [
          { feeHeadId: tuition, amount: '30000' },
          { feeHeadId: exam, amount: '1200.50' },
        ],
        instalments: [
          { label: 'Term 1', dueDate: PAST, percent: 40 },
          { label: 'Term 2', dueDate: FUTURE, percent: 30 },
          { label: 'Term 3', dueDate: FUTURE, percent: 30 },
        ],
      })
      .expect(200);
  });
  afterAll(() => app.close());

  describe('who may do what', () => {
    it('only the accountant and admin can see or change fee setup and payments', async () => {
      for (const who of [teacher, office]) {
        await who.get('/api/fee-heads').expect(403);
        await who.get('/api/fee-structures').expect(403);
        await who.post('/api/fee-heads').send({ name: 'x' }).expect(403);
        await who.get('/api/payments').expect(403);
        await who.get('/api/fees/dues').expect(403);
        await who.post('/api/fee-invoices/generate').send({}).expect(403);
      }
      await accountant.get('/api/fee-heads').expect(200);
      await accountant.get('/api/payments').expect(200);
    });

    it('the accountant cannot reverse a payment or give a concession; the admin can', async () => {
      const s = await billedStudent();
      const p = (await pay(s.studentId, { amount: '100' }).expect(201)).body;
      await accountant
        .post(`/api/payments/${p.id}/reverse`)
        .send({ reason: 'wrong entry' })
        .expect(403);
      const inv = (await fees(s.studentId)).body.invoices[0].id;
      await accountant
        .post(`/api/fee-invoices/${inv}/concessions`)
        .send({ amount: '10', reason: 'sibling' })
        .expect(403);
      await admin
        .post(`/api/fee-invoices/${inv}/concessions`)
        .send({ amount: '10', reason: 'sibling' })
        .expect(201);
      await admin
        .post(`/api/payments/${p.id}/reverse`)
        .send({ reason: 'wrong entry' })
        .expect(200);
    });

    it('requires a login', async () => {
      const { default: request } = await import('supertest');
      await request(app.getHttpServer()).get('/api/fee-heads').expect(401);
    });
  });

  describe('fee heads and structures', () => {
    it('heads have unique names and are switched off, not deleted', async () => {
      const name = unique('Lab');
      const head = (
        await accountant.post('/api/fee-heads').send({ name }).expect(201)
      ).body;
      await accountant.post('/api/fee-heads').send({ name }).expect(409);
      await accountant
        .patch(`/api/fee-heads/${head.id}`)
        .send({ isActive: false })
        .expect(200);
      expect(
        (
          (await accountant.get('/api/fee-heads')).body as {
            id: string;
            isActive: boolean;
          }[]
        ).find((h) => h.id === head.id)?.isActive,
      ).toBe(false);

      const otherClass = (
        await admin
          .post('/api/classes')
          .send({ name: unique('X') })
          .expect(201)
      ).body.id;
      await accountant
        .put('/api/fee-structures')
        .send({
          academicYearId: yearId,
          classId: otherClass,
          items: [{ feeHeadId: head.id, amount: '10' }],
          instalments: [{ label: 'All', dueDate: FUTURE, percent: 100 }],
        })
        .expect(400);
    });

    it('checks the structure and shows the total', async () => {
      const list = (
        await accountant
          .get(`/api/fee-structures?academicYearId=${yearId}`)
          .expect(200)
      ).body;
      const s = list.find(
        (x: { class: { id: string } }) => x.class.id === classId,
      );
      expect(s.total).toBe('31200.50');
      expect(s.instalments.map((i: { percent: number }) => i.percent)).toEqual([
        40, 30, 30,
      ]);

      const base = { academicYearId: yearId, classId: bareClassId };
      const item = { feeHeadId: tuition, amount: '100' };
      const inst = (percent: number) => ({
        label: 'T',
        dueDate: FUTURE,
        percent,
      });
      const bad: Record<string, unknown>[] = [
        { ...base, items: [item], instalments: [inst(50), inst(40)] }, // not 100
        { ...base, items: [item, item], instalments: [inst(100)] }, // head twice
        {
          ...base,
          items: [{ feeHeadId: tuition, amount: '10.123' }],
          instalments: [inst(100)],
        },
        {
          ...base,
          items: [{ feeHeadId: tuition, amount: '0' }],
          instalments: [inst(100)],
        },
        {
          ...base,
          items: [{ feeHeadId: tuition, amount: '-5' }],
          instalments: [inst(100)],
        },
        { ...base, items: [], instalments: [inst(100)] },
        { ...base, items: [item], instalments: [] },
        {
          ...base,
          items: [item],
          instalments: [
            { label: 'a', dueDate: FUTURE, percent: 50 },
            { label: 'b', dueDate: PAST, percent: 50 },
          ],
        }, // order
        {
          ...base,
          classId: '00000000-0000-4000-8000-000000000000',
          items: [item],
          instalments: [inst(100)],
        },
      ];
      for (const body of bad) {
        await accountant.put('/api/fee-structures').send(body).expect(400);
      }
    });

    it('thirds add up exactly', async () => {
      const c = (
        await admin
          .post('/api/classes')
          .send({ name: unique('Thirds') })
          .expect(201)
      ).body.id;
      const d = (
        await admin
          .post(`/api/classes/${c}/divisions`)
          .send({ name: 'A' })
          .expect(201)
      ).body.id;
      await accountant
        .put('/api/fee-structures')
        .send({
          academicYearId: yearId,
          classId: c,
          items: [{ feeHeadId: tuition, amount: '100' }],
          instalments: [
            { label: 'a', dueDate: FUTURE, percent: 33.33 },
            { label: 'b', dueDate: FUTURE, percent: 33.33 },
            { label: 'c', dueDate: FUTURE, percent: 33.34 },
          ],
        })
        .expect(200);
      const s = await admitInto(d, c);
      await accountant
        .post('/api/fee-invoices/generate')
        .send({ studentIds: [s.studentId] })
        .expect(200);
      const inv = (await fees(s.studentId)).body.invoices[0];
      expect(inv.instalments.map((i: { due: string }) => i.due)).toEqual([
        '33.33',
        '33.33',
        '33.34',
      ]);
    });
  });

  describe('invoices', () => {
    it('are made once per student from the class structure, and reported when a class has none', async () => {
      const a = await admitInto(divisionId, classId);
      const b = await admitInto(bareDivisionId, bareClassId);
      const first = (
        await accountant
          .post('/api/fee-invoices/generate')
          .send({ studentIds: [a.studentId, b.studentId] })
          .expect(200)
      ).body;
      expect(first.created).toBe(1);
      expect(first.noStructure).toEqual([
        expect.objectContaining({ classId: bareClassId, students: 1 }),
      ]);
      const again = (
        await accountant
          .post('/api/fee-invoices/generate')
          .send({ studentIds: [a.studentId, b.studentId] })
          .expect(200)
      ).body;
      expect(again.created).toBe(0);
      expect(again.alreadyHad).toBe(1);

      const ledger = (await fees(a.studentId).expect(200)).body;
      expect(ledger.invoices).toHaveLength(1);
      expect(ledger.totals).toMatchObject({
        gross: '31200.50',
        concessions: '0.00',
        paid: '0.00',
        pending: '31200.50',
      });
      const inst = ledger.invoices[0].instalments;
      expect(inst.map((i: { due: string }) => i.due)).toEqual([
        '12480.20',
        '9360.15',
        '9360.15',
      ]);
      expect(inst[0].overdue).toBe(true);
      expect(inst[1].overdue).toBe(false);
    });

    it('do not change when the structure is edited later', async () => {
      const s = await billedStudent();
      const c2 = (
        await admin
          .post('/api/classes')
          .send({ name: unique('Edit') })
          .expect(201)
      ).body.id;
      void c2;
      await accountant
        .put('/api/fee-structures')
        .send({
          academicYearId: yearId,
          classId,
          items: [{ feeHeadId: tuition, amount: '99999' }],
          instalments: [{ label: 'All', dueDate: FUTURE, percent: 100 }],
        })
        .expect(200);
      expect((await fees(s.studentId)).body.totals.gross).toBe('31200.50');
      // put it back for the other tests
      await accountant
        .put('/api/fee-structures')
        .send({
          academicYearId: yearId,
          classId,
          items: [
            { feeHeadId: tuition, amount: '30000' },
            { feeHeadId: exam, amount: '1200.50' },
          ],
          instalments: [
            { label: 'Term 1', dueDate: PAST, percent: 40 },
            { label: 'Term 2', dueDate: FUTURE, percent: 30 },
            { label: 'Term 3', dueDate: FUTURE, percent: 30 },
          ],
        })
        .expect(200);
    });
  });

  describe('payments', () => {
    it('a part payment gives a receipt and the right balance', async () => {
      const s = await billedStudent();
      const p = (
        await pay(s.studentId, { amount: '5000', paidOn: '2026-11-01' }).expect(
          201,
        )
      ).body;
      expect(p.receiptNo).toMatch(/^.+\/\d{5}$/);
      expect(p.amount).toBe('5000.00');
      expect(p.allocations).toHaveLength(1);

      const ledger = (await fees(s.studentId)).body;
      expect(ledger.totals.paid).toBe('5000.00');
      expect(ledger.totals.pending).toBe('26200.50');
      const [t1, t2] = ledger.invoices[0].instalments;
      expect(t1).toMatchObject({
        due: '12480.20',
        paid: '5000.00',
        pending: '7480.20',
      });
      expect(t2.pending).toBe('9360.15');
    });

    it('a bigger payment covers several instalments, and clears the invoice at the end', async () => {
      const s = await billedStudent();
      await pay(s.studentId, { amount: '20000' }).expect(201);
      const mid = (await fees(s.studentId)).body.invoices[0].instalments;
      expect(mid.map((i: { pending: string }) => i.pending)).toEqual([
        '0.00',
        '1840.35',
        '9360.15',
      ]);
      await pay(s.studentId, {
        amount: '11200.50',
        mode: 'UPI',
        reference: 'UTR123',
      }).expect(201);
      const done = (await fees(s.studentId)).body;
      expect(done.totals.pending).toBe('0.00');
      await pay(s.studentId, { amount: '1' }).expect(400); // nothing owed
    });

    it('refuses a payment that is more than owed, or badly formed', async () => {
      const s = await billedStudent();
      const bad: Record<string, unknown>[] = [
        { amount: '31200.51' },
        { amount: '0' },
        { amount: '-5' },
        { amount: '10.999' },
        { amount: 'ten' },
        { amount: 100, mode: 'CASH' }, // a number, not text
        { amount: '100', mode: 'CHEQUE' }, // cheque number missing
        { amount: '100', mode: 'UPI' },
        { amount: '100', mode: 'ONLINE' },
        { amount: '100', mode: 'BITCOIN' },
        { amount: '100', paidOn: FUTURE },
      ];
      for (const body of bad) {
        await pay(s.studentId, body).expect(400);
      }
      expect((await fees(s.studentId)).body.totals.paid).toBe('0.00');
      await pay(s.studentId, {
        amount: '100',
        mode: 'CHEQUE',
        reference: '000123',
        bank: 'SBI',
      }).expect(201);
    });

    it('receipt numbers are sequential and never repeat, even for simultaneous payments', async () => {
      const s = await billedStudent();
      const results = await Promise.all(
        Array.from({ length: 8 }, () => pay(s.studentId, { amount: '100' })),
      );
      expect(results.map((r) => r.status)).toEqual(Array(8).fill(201));
      const seqs = results
        .map((r) => Number((r.body.receiptNo as string).split('/').pop()))
        .sort((a, b) => a - b);
      expect(new Set(seqs).size).toBe(8);
      expect(seqs[7] - seqs[0]).toBe(7); // consecutive
      expect((await fees(s.studentId)).body.totals.paid).toBe('800.00');
    });

    it('two cashiers cannot both pay off the same dues', async () => {
      const s = await billedStudent();
      await pay(s.studentId, { amount: '30200.50' }).expect(201); // 1000.00 left
      const [a, b] = await Promise.all([
        pay(s.studentId, { amount: '800' }),
        pay(s.studentId, { amount: '800' }),
      ]);
      expect([a.status, b.status].sort((x, y) => x - y)).toEqual([201, 400]);
      expect((await fees(s.studentId)).body.totals.pending).toBe('200.00');
    });

    it('can be split over chosen invoices, and must add up', async () => {
      const s = await billedStudent();
      const inv = (await fees(s.studentId)).body.invoices[0].id;
      await pay(s.studentId, {
        amount: '500',
        allocations: [{ invoiceId: inv, amount: '400' }],
      }).expect(400);
      await pay(s.studentId, {
        amount: '500',
        allocations: [
          { invoiceId: inv, amount: '300' },
          { invoiceId: inv, amount: '200' },
        ],
      }).expect(400);
      await pay(s.studentId, {
        amount: '500',
        allocations: [
          { invoiceId: '00000000-0000-4000-8000-000000000000', amount: '500' },
        ],
      }).expect(400);
      await pay(s.studentId, {
        amount: '500',
        allocations: [{ invoiceId: inv, amount: '500' }],
      }).expect(201);
    });

    it('records nothing for a student that does not exist', async () => {
      await pay('00000000-0000-4000-8000-000000000000', {
        amount: '10',
      }).expect(404);
    });

    it('cannot be edited or deleted: there is no such route', async () => {
      const s = await billedStudent();
      const p = (await pay(s.studentId, { amount: '10' }).expect(201)).body;
      await admin
        .patch(`/api/payments/${p.id}`)
        .send({ amount: '1' })
        .expect(404);
      await admin
        .put(`/api/payments/${p.id}`)
        .send({ amount: '1' })
        .expect(404);
      await admin.delete(`/api/payments/${p.id}`).expect(404);
    });
  });

  describe('reversals', () => {
    it('restore the balance, need a reason, and happen once', async () => {
      const s = await billedStudent();
      const p = (
        await pay(s.studentId, {
          amount: '5000',
          mode: 'CHEQUE',
          reference: '778899',
        }).expect(201)
      ).body;
      expect((await fees(s.studentId)).body.totals.pending).toBe('26200.50');

      await admin.post(`/api/payments/${p.id}/reverse`).send({}).expect(400);
      await admin
        .post(`/api/payments/${p.id}/reverse`)
        .send({ reason: 'x' })
        .expect(400);
      const r = (
        await admin
          .post(`/api/payments/${p.id}/reverse`)
          .send({ reason: 'Cheque bounced' })
          .expect(200)
      ).body;
      expect(r.reversed).toMatchObject({ reason: 'Cheque bounced' });
      await admin
        .post(`/api/payments/${p.id}/reverse`)
        .send({ reason: 'again' })
        .expect(409);

      const ledger = (await fees(s.studentId)).body;
      expect(ledger.totals).toMatchObject({
        paid: '0.00',
        pending: '31200.50',
      });
      expect(ledger.payments[0].reversed).toMatchObject({
        reason: 'Cheque bounced',
      });
      // The history stays: the payment is still listed, marked reversed.
      expect(ledger.payments).toHaveLength(1);
      // And the dues can now be paid again.
      await pay(s.studentId, { amount: '31200.50' }).expect(201);
    });

    it('404 for a payment that does not exist', async () => {
      await admin
        .post('/api/payments/00000000-0000-4000-8000-000000000000/reverse')
        .send({ reason: 'none' })
        .expect(404);
    });
  });

  describe('concessions', () => {
    it('lower what is owed, in proportion across the instalments, and can be taken back', async () => {
      const s = await billedStudent();
      const inv = (await fees(s.studentId)).body.invoices[0].id;
      const c = (
        await admin
          .post(`/api/fee-invoices/${inv}/concessions`)
          .send({ amount: '1200.50', reason: 'Staff child' })
          .expect(201)
      ).body;
      const ledger = (await fees(s.studentId)).body;
      expect(ledger.totals).toMatchObject({
        gross: '31200.50',
        concessions: '1200.50',
        pending: '30000.00',
      });
      expect(
        ledger.invoices[0].instalments.map((i: { due: string }) => i.due),
      ).toEqual(['12000.00', '9000.00', '9000.00']);

      await admin
        .delete(`/api/concessions/${c.id}`)
        .send({ reason: 'Approved by mistake' })
        .expect(204);
      await admin
        .delete(`/api/concessions/${c.id}`)
        .send({ reason: 'again' })
        .expect(409);
      const after = (await fees(s.studentId)).body;
      expect(after.totals.pending).toBe('31200.50');
      expect(after.invoices[0].concessions[0]).toMatchObject({
        revoked: true,
        revokedReason: 'Approved by mistake',
      });
    });

    it('cannot be more than what is still unpaid', async () => {
      const s = await billedStudent();
      const inv = (await fees(s.studentId)).body.invoices[0].id;
      await pay(s.studentId, { amount: '30000' }).expect(201); // 1200.50 left
      await admin
        .post(`/api/fee-invoices/${inv}/concessions`)
        .send({ amount: '1200.51', reason: 'too much' })
        .expect(400);
      await admin
        .post(`/api/fee-invoices/${inv}/concessions`)
        .send({ amount: '1200.50', reason: 'exactly the rest' })
        .expect(201);
      expect((await fees(s.studentId)).body.totals.pending).toBe('0.00');
      await admin
        .post(`/api/fee-invoices/${inv}/concessions`)
        .send({ amount: '1', reason: 'nothing left' })
        .expect(400);
      await admin
        .post(`/api/fee-invoices/${inv}/concessions`)
        .send({ amount: '5', reason: '' })
        .expect(400);
    });
  });

  describe('dues from an earlier year', () => {
    it('are paid first, stay visible, and show in the dues report', async () => {
      const prevYear = (
        await admin
          .post('/api/academic-years')
          .send({
            name: unique('Prev'),
            startDate: '2019-04-01',
            endDate: '2020-03-31',
          })
          .expect(201)
      ).body.id;
      const s = await billedStudent();
      await accountant
        .post('/api/fee-invoices/opening-balance')
        .send({
          studentId: s.studentId,
          academicYearId: prevYear,
          amount: '2000',
          dueDate: PAST,
          note: 'From the old register',
        })
        .expect(201);
      await accountant
        .post('/api/fee-invoices/opening-balance')
        .send({
          studentId: s.studentId,
          academicYearId: prevYear,
          amount: '5',
          dueDate: PAST,
        })
        .expect(409);

      let ledger = (await fees(s.studentId)).body;
      expect(ledger.invoices.map((i: { kind: string }) => i.kind)).toEqual([
        'OPENING_BALANCE',
        'FEE_STRUCTURE',
      ]);
      expect(ledger.totals.pending).toBe('33200.50');

      const p = (await pay(s.studentId, { amount: '2500' }).expect(201)).body;
      expect(p.allocations.map((a: { amount: string }) => a.amount)).toEqual([
        '2000.00',
        '500.00',
      ]);
      ledger = (await fees(s.studentId)).body;
      expect(ledger.invoices[0].pending).toBe('0.00');
      expect(ledger.invoices[1].pending).toBe('30700.50');

      // Report: the student is in the list, with their earlier-year dues called out.
      await pay(s.studentId, { amount: '100' }).expect(201);
      const s2 = await billedStudent();
      await accountant
        .post('/api/fee-invoices/opening-balance')
        .send({
          studentId: s2.studentId,
          academicYearId: prevYear,
          amount: '700',
          dueDate: PAST,
        })
        .expect(201);
      const row = (
        await accountant
          .get(`/api/fees/dues?pageSize=100&search=${s2.surname}`)
          .expect(200)
      ).body.students.items[0];
      expect(row.previousYearsPending).toBe('700.00');
      expect(row.pending).toBe('31900.50');
      expect(row.overdue).toBe('13180.20'); // 700.00 + the first instalment, 12480.20
    });
  });

  describe('dues report', () => {
    it('adds up by student, division and class, and counts only what is owed', async () => {
      const c = (
        await admin
          .post('/api/classes')
          .send({ name: unique('Dues') })
          .expect(201)
      ).body.id;
      const d = (
        await admin
          .post(`/api/classes/${c}/divisions`)
          .send({ name: 'A' })
          .expect(201)
      ).body.id;
      await accountant
        .put('/api/fee-structures')
        .send({
          academicYearId: yearId,
          classId: c,
          items: [{ feeHeadId: tuition, amount: '1000' }],
          instalments: [{ label: 'All', dueDate: PAST, percent: 100 }],
        })
        .expect(200);
      const students = [];
      for (let i = 0; i < 3; i++) students.push(await admitInto(d, c));
      await accountant
        .post('/api/fee-invoices/generate')
        .send({ classId: c })
        .expect(200);
      await pay(students[0].studentId, { amount: '1000' }).expect(201); // fully paid
      await pay(students[1].studentId, { amount: '250.50' }).expect(201); // part paid

      const report = (
        await accountant
          .get(`/api/fees/dues?classId=${c}&pageSize=100`)
          .expect(200)
      ).body;
      expect(report.totals).toMatchObject({
        students: 3,
        owing: 2,
        billed: '3000.00',
        collected: '1250.50',
        pending: '1749.50',
        overdue: '1749.50',
      });
      expect(report.byClass).toEqual([
        expect.objectContaining({ students: 3, owing: 2, pending: '1749.50' }),
      ]);
      expect(report.byDivision).toHaveLength(1);
      expect(
        report.students.items.map((i: { pending: string }) => i.pending),
      ).toEqual(['1000.00', '749.50', '0.00']);

      const owing = (
        await accountant
          .get(`/api/fees/dues?classId=${c}&onlyOwing=true`)
          .expect(200)
      ).body;
      expect(owing.students.total).toBe(2);

      // Each student's standing, the count on every tab, and who has waited longest.
      expect(report.counts).toEqual({
        PAID: 1,
        PARTIAL: 0,
        UNPAID: 0,
        OVERDUE: 2,
        NONE: 0,
      });
      const byId = new Map(
        report.students.items.map(
          (i: { studentId: string }) => [i.studentId, i] as const,
        ),
      );
      expect(byId.get(students[0].studentId)).toMatchObject({
        status: 'PAID',
        oldestOverdueOn: null,
        lastPaidOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
      expect(byId.get(students[1].studentId)).toMatchObject({
        status: 'OVERDUE',
        oldestOverdueOn: PAST,
      });
      expect(byId.get(students[2].studentId)).toMatchObject({
        status: 'OVERDUE',
        lastPaidOn: null,
      });
      expect(
        report.longestOverdue.map((i: { studentId: string }) => i.studentId),
      ).toEqual(
        expect.arrayContaining([students[1].studentId, students[2].studentId]),
      );
      expect(report.longestOverdue).toHaveLength(2);

      const paidOnly = (
        await accountant
          .get(`/api/fees/dues?classId=${c}&status=PAID`)
          .expect(200)
      ).body;
      expect(
        paidOnly.students.items.map((i: { studentId: string }) => i.studentId),
      ).toEqual([students[0].studentId]);
      expect(paidOnly.counts.OVERDUE).toBe(2); // counts ignore the tab chosen
      await accountant.get('/api/fees/dues?status=LATE').expect(400);
    });

    it('splits dues and collection between boys and girls, and filters by either', async () => {
      const c = (
        await admin
          .post('/api/classes')
          .send({ name: unique('Gender') })
          .expect(201)
      ).body.id;
      const d = (
        await admin
          .post(`/api/classes/${c}/divisions`)
          .send({ name: 'A' })
          .expect(201)
      ).body.id;
      await accountant
        .put('/api/fee-structures')
        .send({
          academicYearId: yearId,
          classId: c,
          items: [{ feeHeadId: tuition, amount: '1000' }],
          instalments: [{ label: 'All', dueDate: PAST, percent: 100 }],
        })
        .expect(200);
      const boy = await admitInto(d, c, mobile(), unique('Boy'), 'MALE');
      const girl1 = await admitInto(d, c);
      const girl2 = await admitInto(d, c);
      await accountant
        .post('/api/fee-invoices/generate')
        .send({ classId: c })
        .expect(200);
      const day = '2026-02-03';
      await pay(boy.studentId, { amount: '400', paidOn: day }).expect(201);
      await pay(girl1.studentId, { amount: '1000', paidOn: day }).expect(201);

      const report = (
        await accountant
          .get(`/api/fees/dues?classId=${c}&pageSize=100`)
          .expect(200)
      ).body;
      expect(report.byGender).toEqual([
        expect.objectContaining({
          gender: 'MALE',
          students: 1,
          owing: 1,
          billed: '1000.00',
          collected: '400.00',
          pending: '600.00',
        }),
        expect.objectContaining({
          gender: 'FEMALE',
          students: 2,
          owing: 1,
          billed: '2000.00',
          collected: '1000.00',
          pending: '1000.00',
        }),
      ]);
      const girls = (
        await accountant
          .get(`/api/fees/dues?classId=${c}&gender=FEMALE&pageSize=100`)
          .expect(200)
      ).body;
      expect(girls.totals).toMatchObject({ students: 2, collected: '1000.00' });
      expect(girls.counts).toMatchObject({ PAID: 1, OVERDUE: 1 });
      expect(girls.byGender).toHaveLength(2); // the split stays whole
      await accountant.get('/api/fees/dues?gender=BOY').expect(400);

      const all = (
        await accountant
          .get(`/api/payments/collection?from=${day}&to=${day}`)
          .expect(200)
      ).body;
      const sex = (g: string) =>
        all.byGender.find((x: { gender: string }) => x.gender === g);
      expect(Number(sex('MALE').total)).toBeGreaterThanOrEqual(400);
      expect(Number(sex('FEMALE').total)).toBeGreaterThanOrEqual(1000);
      const boysOnly = (
        await accountant
          .get(`/api/payments/collection?from=${day}&to=${day}&gender=MALE`)
          .expect(200)
      ).body;
      expect(boysOnly.gender).toBe('MALE');
      expect(boysOnly.total).toBe(sex('MALE').total);
      expect(boysOnly.byGender).toEqual(all.byGender);
      const boyPayments = (
        await accountant
          .get(`/api/payments?from=${day}&to=${day}&gender=MALE&pageSize=100`)
          .expect(200)
      ).body;
      expect(
        boyPayments.items.map((i: { studentId: string }) => i.studentId),
      ).toContain(boy.studentId);
      expect(
        boyPayments.items.map((i: { studentId: string }) => i.studentId),
      ).not.toContain(girl1.studentId);
    });

    it('tells part paid from nothing paid while nothing is overdue yet', async () => {
      const c = (
        await admin
          .post('/api/classes')
          .send({ name: unique('Ahead') })
          .expect(201)
      ).body.id;
      const d = (
        await admin
          .post(`/api/classes/${c}/divisions`)
          .send({ name: 'A' })
          .expect(201)
      ).body.id;
      await accountant
        .put('/api/fee-structures')
        .send({
          academicYearId: yearId,
          classId: c,
          items: [{ feeHeadId: tuition, amount: '1000' }],
          instalments: [{ label: 'All', dueDate: FUTURE, percent: 100 }],
        })
        .expect(200);
      const a = await admitInto(d, c);
      const b = await admitInto(d, c);
      await accountant
        .post('/api/fee-invoices/generate')
        .send({ classId: c })
        .expect(200);
      await pay(a.studentId, { amount: '100' }).expect(201);
      const report = (
        await accountant
          .get(`/api/fees/dues?classId=${c}&pageSize=100`)
          .expect(200)
      ).body;
      expect(report.counts).toMatchObject({
        PARTIAL: 1,
        UNPAID: 1,
        OVERDUE: 0,
      });
      const row = report.students.items.find(
        (i: { studentId: string }) => i.studentId === b.studentId,
      );
      expect(row).toMatchObject({
        status: 'UNPAID',
        nextDueOn: FUTURE,
        oldestOverdueOn: null,
      });
      expect(report.longestOverdue).toEqual([]);
    });
  });

  describe('collection and receipts', () => {
    it('totals what was collected by mode and leaves out reversed payments', async () => {
      const s = await billedStudent();
      const day = '2026-02-02';
      await pay(s.studentId, { amount: '300', paidOn: day }).expect(201);
      await pay(s.studentId, {
        amount: '200',
        mode: 'UPI',
        reference: 'U1',
        paidOn: day,
      }).expect(201);
      const gone = (
        await pay(s.studentId, { amount: '999', paidOn: day }).expect(201)
      ).body;
      await admin
        .post(`/api/payments/${gone.id}/reverse`)
        .send({ reason: 'entered twice' })
        .expect(200);

      const all = (
        await accountant
          .get(`/api/payments/collection?from=${day}&to=${day}`)
          .expect(200)
      ).body;
      // other tests may also have paid on this day: ours must be included, and reversed money must not be.
      const byMode = Object.fromEntries(
        all.byMode.map((m: { mode: string; total: string }) => [
          m.mode,
          Number(m.total),
        ]),
      );
      expect(byMode.CASH).toBeGreaterThanOrEqual(300);
      expect(byMode.UPI).toBeGreaterThanOrEqual(200);
      const listed = (
        await accountant
          .get(`/api/payments?from=${day}&to=${day}&studentId=${s.studentId}`)
          .expect(200)
      ).body;
      expect(listed.total).toBe(3);
      expect(
        listed.items.filter((i: { reversed: boolean }) => i.reversed),
      ).toHaveLength(1);
    });

    it('a receipt is a PDF download', async () => {
      const s = await billedStudent();
      const p = (await pay(s.studentId, { amount: '123.45' }).expect(201)).body;
      const res = await accountant
        .get(`/api/payments/${p.id}/receipt`)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['content-type']).toMatch(/application\/pdf/);
      expect(res.headers['content-disposition']).toMatch(/attachment/);
      expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      await accountant
        .get('/api/payments/00000000-0000-4000-8000-000000000000/receipt')
        .expect(404);
    });
  });

  describe('parents and students', () => {
    it('see only their own child, can download their receipt, and cannot change anything', async () => {
      const m = mobile();
      const mine = await admitInto(divisionId, classId, m);
      const other = await admitInto(divisionId, classId);
      await accountant
        .post('/api/fee-invoices/generate')
        .send({ studentIds: [mine.studentId, other.studentId] })
        .expect(200);
      const guardianId = (
        await admin.get(`/api/students/${mine.studentId}`).expect(200)
      ).body.guardians[0].id;
      const login = (
        await office.post(`/api/guardians/${guardianId}/account`).expect(201)
      ).body;
      const parent = await loginAndSettle(
        app,
        m,
        login.temporaryPassword,
        'Parent-Pass-123',
      );

      const myPayment = (
        await pay(mine.studentId, { amount: '100' }).expect(201)
      ).body;
      const otherPayment = (
        await pay(other.studentId, { amount: '100' }).expect(201)
      ).body;

      const ledger = (await fees(mine.studentId, parent).expect(200)).body;
      expect(ledger.totals.paid).toBe('100.00');
      await fees(other.studentId, parent).expect(404);
      await parent.get(`/api/payments/${myPayment.id}`).expect(200);
      await parent.get(`/api/payments/${myPayment.id}/receipt`).expect(200);
      await parent.get(`/api/payments/${otherPayment.id}`).expect(404);
      await parent.get(`/api/payments/${otherPayment.id}/receipt`).expect(404);

      await pay(mine.studentId, { amount: '10' }, parent).expect(403);
      await parent.get('/api/payments').expect(403);
      await parent.get('/api/fees/dues').expect(403);
      await parent.get('/api/fee-heads').expect(403);
      await parent
        .post(`/api/payments/${myPayment.id}/reverse`)
        .send({ reason: 'sneaky' })
        .expect(403);
    });

    it('a student sees their own fees only', async () => {
      const mine = await admitInto(divisionId, classId);
      const other = await admitInto(divisionId, classId);
      await accountant
        .post('/api/fee-invoices/generate')
        .send({ studentIds: [mine.studentId, other.studentId] })
        .expect(200);
      const acct = (
        await office.post(`/api/students/${mine.studentId}/account`).expect(201)
      ).body;
      const detail = (
        await admin.get(`/api/students/${mine.studentId}`).expect(200)
      ).body;
      const student = await loginAndSettle(
        app,
        detail.admissionNo,
        acct.temporaryPassword,
        'Student-Pass-123',
      );
      await fees(mine.studentId, student).expect(200);
      await fees(other.studentId, student).expect(404);
    });
  });

  it('records the money movements in the audit log', async () => {
    for (const action of [
      'fees.payment_recorded',
      'fees.payment_reversed',
      'fees.concession_added',
      'fees.structure_saved',
      'fees.invoices_generated',
    ]) {
      const res = await admin
        .get(`/api/audit-logs?action=${action}`)
        .expect(200);
      expect(res.body.total, action).toBeGreaterThan(0);
    }
  });

  it('the stored amounts always agree with the ledger (no drift)', async () => {
    // Every active payment's allocations add up to its amount.
    const bad = await prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM payments p
      JOIN payment_allocations a ON a.payment_id = p.id
      GROUP BY p.id, p.amount HAVING SUM(a.amount) <> p.amount`;
    expect(bad).toEqual([]);
    // No invoice is overpaid or below zero.
    const over = await prisma.$queryRaw<{ id: string }[]>`
      SELECT i.id FROM fee_invoices i
      WHERE COALESCE((SELECT SUM(l.amount) FROM fee_invoice_lines l WHERE l.invoice_id = i.id), 0)
          - COALESCE((SELECT SUM(c.amount) FROM concessions c WHERE c.invoice_id = i.id AND c.revoked_at IS NULL), 0)
          - COALESCE((SELECT SUM(a.amount) FROM payment_allocations a JOIN payments p ON p.id = a.payment_id
                      WHERE a.invoice_id = i.id AND NOT EXISTS (SELECT 1 FROM payment_reversals r WHERE r.payment_id = p.id)), 0) < 0`;
    expect(over).toEqual([]);
    // Receipt numbers are unique per year.
    const dup = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM payments GROUP BY school_id, academic_year_id, receipt_seq HAVING COUNT(*) > 1`;
    expect(dup).toEqual([]);
  });
});
