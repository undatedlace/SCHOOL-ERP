import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/database/prisma.service.js';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
  unique,
} from './helpers.js';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('copying fee structures to a new year (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Agent;
  let accountant: Agent;
  let office: Agent;
  let teacher: Agent;
  let oldYear: string;
  let newYear: string;
  let classA: string;
  let classB: string;
  let classC: string;
  let names: Record<string, string>;
  let tuition: string;
  let exam: string;
  let retired: string;

  const copy = (
    who: Agent,
    body: Record<string, unknown> = {},
    from = oldYear,
    to = newYear,
  ) =>
    who
      .post('/api/fee-structures/copy')
      .send({ fromAcademicYearId: from, toAcademicYearId: to, ...body });
  const structures = async (year: string) =>
    (await admin.get(`/api/fee-structures?academicYearId=${year}`).expect(200))
      .body as {
      class: { id: string };
      total: string;
      items: { feeHeadId: string; amount: string }[];
      instalments: { label: string; dueDate: string; percent: number }[];
    }[];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await adminAgent(app);
    accountant = (await createSettledUser(app, admin, 'ACCOUNTANT')).agent;
    office = (await createSettledUser(app, admin, 'OFFICE_STAFF')).agent;
    teacher = (await createSettledUser(app, admin, 'TEACHER')).agent;
    const schoolId = (
      await prisma.school.findFirstOrThrow({ orderBy: { createdAt: 'asc' } })
    ).id;

    // Two years far from anything else in the shared test database.
    const year = async (name: string, start: string, end: string) =>
      (
        await prisma.academicYear.create({
          data: {
            schoolId,
            name: unique(name),
            startDate: day(start),
            endDate: day(end),
          },
        })
      ).id;
    oldYear = await year('OLDFEE', '2036-04-01', '2037-03-31');
    newYear = await year('NEWFEE', '2037-04-01', '2038-03-31');

    const cls = async (name: string) =>
      (
        await admin
          .post('/api/classes')
          .send({ name: unique(name) })
          .expect(201)
      ).body as { id: string; name: string };
    const a = await cls('CopyA');
    const b = await cls('CopyB');
    const c = await cls('CopyC');
    [classA, classB, classC] = [a.id, b.id, c.id];
    names = { [a.id]: a.name, [b.id]: b.name, [c.id]: c.name };

    const head = async (name: string) =>
      (
        await accountant
          .post('/api/fee-heads')
          .send({ name: unique(name) })
          .expect(201)
      ).body.id as string;
    tuition = await head('Tuition');
    exam = await head('Exam');
    retired = await head('Retired');

    const save = (classId: string, year: string, items: object[]) =>
      accountant
        .put('/api/fee-structures')
        .send({
          academicYearId: year,
          classId,
          items,
          instalments: [
            { label: 'Term 1', dueDate: '2036-06-10', percent: 40 },
            { label: 'Term 2', dueDate: '2036-10-10', percent: 30 },
            { label: 'Term 3', dueDate: '2037-02-10', percent: 30 },
          ],
        })
        .expect(200);
    await save(classA, oldYear, [
      { feeHeadId: tuition, amount: '30000' },
      { feeHeadId: exam, amount: '1200.50' },
    ]);
    await save(classB, oldYear, [{ feeHeadId: retired, amount: '500' }]);
    await save(classC, oldYear, [{ feeHeadId: tuition, amount: '1000' }]);
    // Class C already has its own fees for the new year.
    await accountant
      .put('/api/fee-structures')
      .send({
        academicYearId: newYear,
        classId: classC,
        items: [{ feeHeadId: tuition, amount: '2222' }],
        instalments: [{ label: 'Full', dueDate: '2037-06-01', percent: 100 }],
      })
      .expect(200);
    await accountant
      .patch(`/api/fee-heads/${retired}`)
      .send({ isActive: false })
      .expect(200);
  });
  afterAll(() => app.close());

  it('copies a class, moves the due dates on a year, and leaves the old year alone', async () => {
    const res = (await copy(accountant, { classIds: [classA] }).expect(200))
      .body;
    expect(res.copied).toEqual([names[classA]]);
    expect(res.skipped).toEqual([]);

    const [fresh] = (await structures(newYear)).filter(
      (s) => s.class.id === classA,
    );
    expect(fresh.total).toBe('31200.50');
    expect(
      fresh.items
        .map((i) => [i.feeHeadId, i.amount])
        .sort((a, b) => a[0].localeCompare(b[0])),
    ).toEqual(
      [
        [tuition, '30000.00'],
        [exam, '1200.50'],
      ].sort((a, b) => a[0].localeCompare(b[0])),
    );
    expect(
      fresh.instalments.map((i) => [
        i.label,
        i.dueDate.slice(0, 10),
        i.percent,
      ]),
    ).toEqual([
      ['Term 1', '2037-06-10', 40],
      ['Term 2', '2037-10-10', 30],
      ['Term 3', '2038-02-10', 30],
    ]);
    const old = (await structures(oldYear)).find((s) => s.class.id === classA)!;
    expect(old.instalments[0].dueDate.slice(0, 10)).toBe('2036-06-10');
  });

  it('never overwrites a class that already has fees, and skips switched-off kinds of fee', async () => {
    const res = (await copy(admin).expect(200)).body;
    const skipped = Object.fromEntries(
      res.skipped.map((s: { class: string; reason: string }) => [
        s.class,
        s.reason,
      ]),
    );
    expect(skipped[names[classA]]).toMatch(/Already has fees/); // copied in the test above
    expect(skipped[names[classB]]).toMatch(/switched off/);
    expect(skipped[names[classC]]).toMatch(/Already has fees/);
    expect(res.copied).not.toContain(names[classA]);

    const c = (await structures(newYear)).find((s) => s.class.id === classC)!;
    expect(c.total).toBe('2222.00'); // its own, untouched
    expect((await structures(newYear)).some((s) => s.class.id === classB)).toBe(
      false,
    );
  });

  it('creates no invoices', async () => {
    expect(
      await prisma.feeInvoice.count({ where: { academicYearId: newYear } }),
    ).toBe(0);
  });

  it('refuses the same year twice and unknown years', async () => {
    await copy(admin, {}, oldYear, oldYear).expect(400);
    await copy(admin, {}, randomUUID(), newYear).expect(400);
    await copy(admin, {}, oldYear, randomUUID()).expect(400);
    await copy(admin, { classIds: ['nope'] }).expect(400);
  });

  it('is for the accountant and admin only', async () => {
    await copy(office).expect(403);
    await copy(teacher).expect(403);
  });

  it('is written to the audit log', async () => {
    const rows = await prisma.auditLog.findMany({
      where: { action: 'fees.structures_copied', entityId: newYear },
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
