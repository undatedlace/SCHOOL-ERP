import { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { todayIso } from '../src/common/dates.js';
import { PrismaService } from '../src/database/prisma.service.js';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
  unique,
} from './helpers.js';
import { downloadXlsx, fillSheet, uploadXlsx } from './xlsx-helpers.js';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const today = todayIso().split('-').reverse().join('/');

describe('admissions import from Excel (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Agent;
  let office: Agent;
  let teacher: Agent;
  let schoolId: string;

  // Two years long ago (somewhere no other suite or earlier run uses). No year here overlaps
  // today, so other suites that look for the year containing a date are not disturbed.
  const Y0 = 1700 + Math.floor(Math.random() * 120) * 2;
  const Y1 = {
    name: unique('Y1'),
    start: `${Y0}-04-01`,
    end: `${Y0 + 1}-03-31`,
  };
  const Y2 = {
    name: unique('Y2'),
    start: `${Y0 + 1}-04-01`,
    end: `${Y0 + 2}-03-31`,
  };
  // A year far ahead: a child admitted for it is still studying, with nothing after it.
  const Y9 = 2600 + Math.floor(Math.random() * 300) * 2;
  const Y3 = {
    name: unique('Y3'),
    start: `${Y9}-06-01`,
    end: `${Y9 + 1}-05-31`,
  };
  let y1: string;
  let y2: string;
  let y3: string;
  let s1: string;
  let s2: string;
  let s1Name: string;
  let s2Name: string;
  const fatherMobile = `9${Math.floor(100000000 + Math.random() * 899999999)}`;
  const surname = unique('Imp');

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await adminAgent(app);
    office = (await createSettledUser(app, admin, 'OFFICE_STAFF')).agent;
    teacher = (await createSettledUser(app, admin, 'TEACHER')).agent;
    schoolId = (
      await prisma.school.findFirstOrThrow({ orderBy: { createdAt: 'asc' } })
    ).id;
    const year = async (y: { name: string; start: string; end: string }) =>
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
    y1 = await year(Y1);
    y2 = await year(Y2);
    y3 = await year(Y3);
    const base = 5_000_000 + Math.floor(Math.random() * 100_000) * 2;
    s1Name = unique('ImpStd1');
    s2Name = unique('ImpStd2');
    s1 = (
      await prisma.schoolClass.create({
        data: { schoolId, name: s1Name, sortOrder: base },
      })
    ).id;
    s2 = (
      await prisma.schoolClass.create({
        data: { schoolId, name: s2Name, sortOrder: base + 1 },
      })
    ).id;
    for (const [classId, name] of [
      [s1, 'A'],
      [s1, 'B'],
      [s2, 'A'],
    ])
      await prisma.division.create({ data: { schoolId, classId, name } });
  });

  afterAll(async () => {
    await app.close();
  });

  const answers = (first: string, more: Record<string, unknown> = {}) => ({
    'f:classApplied': s1Name,
    'f:surname': surname,
    'f:firstName': first,
    'f:gender': 'Male',
    'f:dateOfBirth': `12/05/${Y0 - 5}`,
    'f:undertakingReceived': 'Yes',
    'f:fatherFullName': `Imran ${surname}`,
    'f:familyMobile': fatherMobile,
    ...more,
  });
  const yearCol = (id: string) => `y:${id}`;

  let batchId: string;

  it('gives the template only to people who may import admissions', async () => {
    await teacher.get('/api/imports/admissions/template').expect(403);
    const wb = await downloadXlsx(office, '/api/imports/admissions/template');
    expect(wb.getWorksheet('How to fill')).toBeTruthy();
    expect(wb.getWorksheet('About')?.state).toBe('veryHidden');
    const sheet = wb.getWorksheet('Applications')!;
    const keys = (sheet.getRow(1).values as unknown[]).filter(Boolean);
    expect(keys).toContain('receivedOn');
    expect(keys).toContain('f:dateOfBirth');
    expect(keys).toContain(yearCol(y1));
    expect(keys).not.toContain('f:childPhoto'); // photos are added later, not in Excel
    const headings = (sheet.getRow(2).values as unknown[]).map(String);
    expect(headings).toContain(`Class & division in ${Y2.name}`);
  });

  it('checks every row without saving anything, then imports the good ones', async () => {
    const wb = await downloadXlsx(office, '/api/imports/admissions/template');
    fillSheet(wb, 'Applications', [
      // A new form, just received.
      {
        receivedOn: today,
        year: Y3.name,
        ...answers('Arif'),
      },
      // An old form: granted, studied two years, left during the second.
      {
        formNo: 'OLD-1',
        receivedOn: `15/02/${Y0}`,
        year: Y1.name,
        status: 'Granted',
        decidedOn: `01/03/${Y0}`,
        ...answers('Bilal'),
        [yearCol(y1)]: `${s1Name} - A`,
        [yearCol(y2)]: `${s2Name} - A`,
        leftOn: `15/12/${Y0 + 1}`,
      },
      // Bilal's younger brother: the same father, joined the next year, left at its end.
      {
        formNo: 'OLD-2',
        receivedOn: `10/03/${Y0 + 1}`,
        year: Y2.name,
        status: 'Granted',
        ...answers('Danish'),
        [yearCol(y2)]: `${s1Name} - B`,
        leftOn: `31/03/${Y0 + 2}`,
      },
      // No date of birth.
      {
        receivedOn: `10/03/${Y0 + 1}`,
        year: Y2.name,
        ...answers('Faiz', { 'f:dateOfBirth': null }),
      },
      // Down a class in the second year.
      {
        receivedOn: `10/03/${Y0}`,
        year: Y1.name,
        status: 'Granted',
        ...answers('Hamza', { 'f:classApplied': s2Name }),
        [yearCol(y1)]: `${s2Name} - A`,
        [yearCol(y2)]: `${s1Name} - A`,
        leftOn: `01/03/${Y0 + 2}`,
      },
      // Granted for a year ahead: admitted, nothing after it to fill in.
      {
        receivedOn: today,
        year: Y3.name,
        status: 'Granted',
        ...answers('Junaid'),
        enrolled: 'Yes',
        [yearCol(y3)]: `${s1Name} - A`,
      },
    ]);

    const before = await prisma.application.count({ where: { schoolId } });
    const checked = (
      await uploadXlsx(office, '/api/imports/admissions/check', wb, 201)
    ).body;
    expect(await prisma.application.count({ where: { schoolId } })).toBe(
      before,
    );
    expect(checked.status).toBe('CHECKED');
    expect(checked.summary).toMatchObject({
      total: 6,
      ready: 4,
      withErrors: 2,
    });
    const byRow = (n: number) =>
      checked.rows.find((r: { rowNumber: number }) => r.rowNumber === n);
    expect(byRow(6).errors.join(' ')).toMatch(/Date of birth/);
    expect(byRow(7).errors.join(' ')).toMatch(/lower class/);
    expect(byRow(4).label).toContain('Bilal');
    batchId = checked.id;

    const done = (
      await office.post(`/api/imports/batches/${batchId}/run`).expect(200)
    ).body;
    expect(done.status).toBe('IMPORTED');
    expect(done.summary).toMatchObject({ imported: 4, failed: 0 });

    // The old, granted form became a student with two years of history and a leaving date.
    const bilal = await prisma.application.findFirstOrThrow({
      where: { schoolId, academicYearId: y1, formNo: 'OLD-1' },
      include: {
        student: {
          include: {
            enrollments: { orderBy: { startedOn: 'asc' } },
            guardians: true,
          },
        },
      },
    });
    expect(bilal.status).toBe('GRANTED');
    expect(iso(bilal.receivedOn)).toBe(`${Y0}-02-15`);
    expect(iso(bilal.decidedAt!)).toBe(`${Y0}-03-01`);
    expect(bilal.importBatchId).toBe(batchId);
    const st = bilal.student!;
    expect(st.status).toBe('LEFT');
    expect(iso(st.leftOn!)).toBe(`${Y0 + 1}-12-15`);
    expect(iso(st.joinedOn)).toBe(`${Y0}-04-01`);
    expect(
      st.enrollments.map((e) => [
        e.academicYearId,
        iso(e.startedOn),
        e.endedOn && iso(e.endedOn),
      ]),
    ).toEqual([
      [y1, `${Y0}-04-01`, `${Y0 + 1}-03-31`],
      [y2, `${Y0 + 1}-04-01`, `${Y0 + 1}-12-15`],
    ]);

    // Brothers share one father record (same name and mobile).
    const danish = await prisma.application.findFirstOrThrow({
      where: { schoolId, academicYearId: y2, formNo: 'OLD-2' },
      include: { student: { include: { guardians: true } } },
    });
    expect(danish.student!.guardians[0].guardianId).toBe(
      st.guardians[0].guardianId,
    );

    // Studying now: enrolled this year, no end date.
    const junaid = await prisma.student.findFirstOrThrow({
      where: { schoolId, surname, firstName: 'Junaid' },
      include: { enrollments: true },
    });
    expect(junaid.status).toBe('ACTIVE');
    expect(junaid.enrollments).toHaveLength(1);
    expect(junaid.enrollments[0].endedOn).toBeNull();

    // The plain new form is just received.
    const arif = await prisma.application.findFirstOrThrow({
      where: {
        schoolId,
        academicYearId: y3,
        studentName: { contains: 'Arif' },
      },
    });
    expect(arif.status).toBe('RECEIVED');
    expect(arif.studentId).toBeNull();
  });

  it('imports a file only once', async () => {
    await office.post(`/api/imports/batches/${batchId}/run`).expect(409);
  });

  it('hands back the rows that did not go in, ready to fix and upload again', async () => {
    const wb = await downloadXlsx(
      office,
      `/api/imports/batches/${batchId}/problems`,
    );
    const sheet = wb.getWorksheet('Applications')!;
    const lastHeading = sheet
      .getRow(2)
      .getCell(sheet.getRow(1).cellCount + 1).text;
    expect(lastHeading).toMatch(/Error/);
    // The two bad rows, in order, with their reasons.
    expect(
      sheet.getRow(3).getCell(sheet.getRow(1).cellCount + 1).value,
    ).toMatch(/Date of birth/);
    expect(sheet.getRow(5).getCell(1).value).toBeNull();

    // Fix the missing date of birth and upload the same file again.
    const keys = sheet.getRow(1).values as unknown[];
    sheet.getRow(3).getCell(keys.indexOf('f:dateOfBirth')).value =
      `01/01/${Y0 - 5}`;
    sheet.spliceRows(4, 1); // drop the other one
    const again = (
      await uploadXlsx(office, '/api/imports/admissions/check', wb, 201)
    ).body;
    expect(again.summary).toMatchObject({ total: 1, ready: 1, withErrors: 0 });
  });

  it('refuses files that are not this template', async () => {
    await office
      .post('/api/imports/admissions/check')
      .attach('file', Buffer.from('name,class\nA,1\n'), 'list.csv')
      .expect(400);
    const other = new ExcelJS.Workbook();
    other.addWorksheet('Sheet1').addRow(['hello']);
    await uploadXlsx(office, '/api/imports/admissions/check', other, 400);
  });

  it('keeps a batch to the people who may import that kind', async () => {
    await teacher.get(`/api/imports/batches/${batchId}`).expect(404);
    const list = (await office.get('/api/imports').expect(200)).body;
    expect(list.some((b: { id: string }) => b.id === batchId)).toBe(true);
  });

  it('records a decision taken earlier on paper with its real date', async () => {
    const created = (
      await office
        .post('/api/admissions/applications')
        .send({
          academicYearId: y2,
          receivedOn: `${Y0 + 1}-02-01`,
          answers: {
            classApplied: s1,
            surname,
            firstName: 'Kabir',
            gender: 'MALE',
            dateOfBirth: `${Y0 - 5}-06-15`,
            undertakingReceived: true,
          },
        })
        .expect(201)
    ).body;
    await office
      .post(`/api/admissions/applications/${created.id}/decision`)
      .send({
        decision: 'REFUSED',
        note: 'Class full',
        decidedOn: `${Y0 + 1}-01-01`,
      })
      .expect(400); // before it was received
    const res = await office
      .post(`/api/admissions/applications/${created.id}/decision`)
      .send({
        decision: 'REFUSED',
        note: 'Class full',
        decidedOn: `${Y0 + 1}-02-20`,
      })
      .expect(200);
    expect(res.body.decision.decidedAt.slice(0, 10)).toBe(`${Y0 + 1}-02-20`);
  });
});
