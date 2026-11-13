import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service.js';
import { addDays } from '../src/modules/attendance/attendance-rules.js';
import {
  Agent,
  adminAgent,
  createSettledUser,
  createTestApp,
  unique,
} from './helpers.js';
import { downloadXlsx, fillSheet, uploadXlsx } from './xlsx-helpers.js';

const at = (iso: string) => new Date(`${iso}T00:00:00Z`);
const isSunday = (iso: string) => at(iso).getUTCDay() === 0;
/** The first day on or after `iso` that is not a Sunday (leave never covers Sundays). */
const weekday = (iso: string) => {
  let d = iso;
  while (isSunday(d)) d = addDays(d, 1);
  return d;
};

describe('attendance import from Excel (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Agent;
  let teacher: Agent;
  let office: Agent;
  let schoolId: string;
  let adminUserId: string;

  // A year long ago that nothing else uses, so no other suite's "year containing this date" is
  // disturbed. Every day in it is far more than a week ago: only the admin may mark it.
  const Y0 = 1600 + Math.floor(Math.random() * 45) * 2;
  const START = `${Y0}-06-01`;
  const D = weekday(`${Y0}-07-10`);
  const MONTH = D.slice(0, 7);
  const STAFF_SURNAME = unique('Reg');
  let yearId: string;
  let divisionId: string;
  let otherDivisionId: string;
  let sheet: string;
  const kids: { id: string; admissionNo: string }[] = [];
  let lateKid: { id: string; admissionNo: string };
  let staffId: string;
  let staffNo: string;
  let leaveStaffId: string;
  let leaveStaffNo: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await adminAgent(app);
    office = (await createSettledUser(app, admin, 'OFFICE_STAFF')).agent;
    const t = await createSettledUser(app, admin, 'TEACHER');
    teacher = t.agent;
    schoolId = (
      await prisma.school.findFirstOrThrow({ orderBy: { createdAt: 'asc' } })
    ).id;
    adminUserId = (
      await prisma.user.findFirstOrThrow({
        where: { email: 'admin@test.local' },
      })
    ).id;

    yearId = (
      await prisma.academicYear.create({
        data: {
          schoolId,
          name: unique('AttY'),
          startDate: at(START),
          endDate: at(`${Y0 + 1}-05-31`),
        },
      })
    ).id;
    const className = unique('AttImp');
    const cls = await prisma.schoolClass.create({
      data: {
        schoolId,
        name: className,
        sortOrder: 8_000_000 + Math.floor(Math.random() * 100_000),
      },
    });
    divisionId = (
      await prisma.division.create({
        data: { schoolId, classId: cls.id, name: 'A' },
      })
    ).id;
    otherDivisionId = (
      await prisma.division.create({
        data: { schoolId, classId: cls.id, name: 'B' },
      })
    ).id;
    sheet = `${className} - A`.slice(0, 31);

    const last = await prisma.student.aggregate({
      where: { schoolId },
      _max: { seq: true },
    });
    const kid = async (i: number, startedOn: string) => {
      const s = await prisma.student.create({
        data: {
          schoolId,
          seq: (last._max.seq ?? 0) + i,
          admissionNo: unique('AI'),
          firstName: `Kid${i}`,
          surname: 'Register',
          gender: 'MALE',
          dateOfBirth: at('2018-01-01'),
          joinedOn: at(startedOn),
        },
      });
      await prisma.enrollment.create({
        data: {
          schoolId,
          studentId: s.id,
          academicYearId: yearId,
          divisionId,
          startedOn: at(startedOn),
        },
      });
      return { id: s.id, admissionNo: s.admissionNo };
    };
    kids.push(await kid(1, START), await kid(2, START));
    lateKid = await kid(3, addDays(D, 1)); // joins the day after D

    // The teacher is class teacher of division A that year.
    const lastStaff = await prisma.staff.aggregate({
      where: { schoolId },
      _max: { seq: true },
    });
    const staff = async (i: number, userId: string | null) =>
      prisma.staff.create({
        data: {
          schoolId,
          seq: (lastStaff._max.seq ?? 0) + i,
          employeeNo: unique('EA'),
          firstName: `Staff${i}`,
          surname: STAFF_SURNAME,
          gender: 'FEMALE',
          designation: 'Teacher',
          joinedOn: at(START),
          userId,
        },
      });
    const teacherStaff = await staff(1, t.id);
    staffId = teacherStaff.id;
    staffNo = teacherStaff.employeeNo;
    const onLeave = await staff(2, null);
    leaveStaffId = onLeave.id;
    leaveStaffNo = onLeave.employeeNo;
    await prisma.classTeacher.create({
      data: { schoolId, academicYearId: yearId, divisionId, staffId },
    });
    // Approved leave on D for the second person.
    const leaveType = await prisma.leaveType.create({
      data: { schoolId, name: unique('Casual') },
    });
    await prisma.leaveRequest.create({
      data: {
        schoolId,
        staffId: leaveStaffId,
        leaveTypeId: leaveType.id,
        academicYearId: yearId,
        startsOn: at(D),
        endsOn: at(D),
        halfDays: 2,
        reason: 'Family',
        status: 'APPROVED',
        requestedById: adminUserId,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const rowOf = (
    ws: { getRow(n: number): { getCell(n: number): { value: unknown } } },
    no: string,
  ) => {
    for (let r = 3; r < 400; r++)
      if (ws.getRow(r).getCell(1).value === no) return r;
    throw new Error(`no row for ${no}`);
  };
  const studentUrl = `/api/imports/student-attendance/template?month=${MONTH}&divisionId=`;

  describe('students', () => {
    let batchId: string;

    it('gives a register for one division and month, with the days that cannot be marked shaded', async () => {
      await office.get(`${studentUrl}${divisionId}`).expect(403); // office reads attendance, does not mark it
      const wb = await downloadXlsx(admin, `${studentUrl}${divisionId}`);
      const ws = wb.getWorksheet(sheet)!;
      const keys = ws.getRow(1).values as unknown[];
      expect(keys).toContain(`d:${MONTH}-01`);
      expect(keys).not.toContain(`d:${MONTH}-32`);
      const numbers = [3, 4, 5].map((r) => ws.getRow(r).getCell(1).value);
      expect(numbers).toEqual(
        expect.arrayContaining(kids.map((k) => k.admissionNo)),
      );
    });

    it('checks every box against the register, then saves the marks', async () => {
      const wb = await downloadXlsx(admin, `${studentUrl}${divisionId}`);
      const ws = wb.getWorksheet(sheet)!;
      fillSheet(
        wb,
        sheet,
        [{ [`d:${D}`]: 'P' }],
        rowOf(ws, kids[0].admissionNo),
      );
      fillSheet(
        wb,
        sheet,
        [{ [`d:${D}`]: 'a' }],
        rowOf(ws, kids[1].admissionNo),
      );
      // The late joiner is marked on a day before joining (added by hand if not on this month's sheet).
      let lateRow: number;
      try {
        lateRow = rowOf(ws, lateKid.admissionNo);
      } catch {
        lateRow = 10;
        fillSheet(wb, sheet, [{ admissionNo: lateKid.admissionNo }], lateRow);
      }
      fillSheet(wb, sheet, [{ [`d:${D}`]: 'P' }], lateRow);

      const checked = (
        await uploadXlsx(
          admin,
          '/api/imports/student-attendance/check',
          wb,
          201,
        )
      ).body;
      expect(checked.summary).toMatchObject({ ready: 2, withErrors: 1 });
      const bad = checked.rows.find(
        (r: { errors: string[] }) => r.errors.length,
      );
      expect(bad.errors[0]).toMatch(/was not in|is not in/);
      batchId = checked.id;

      await admin.post(`/api/imports/batches/${batchId}/run`).expect(200);
      const saved = await prisma.attendanceRecord.findMany({
        where: { studentId: { in: kids.map((k) => k.id) }, date: at(D) },
      });
      expect(saved.map((r) => r.status).sort()).toEqual(['ABSENT', 'PRESENT']);
    });

    it('fills in marks already saved, skips them, and never removes a mark for a blank box', async () => {
      const wb = await downloadXlsx(admin, `${studentUrl}${divisionId}`);
      const ws = wb.getWorksheet(sheet)!;
      const keys = ws.getRow(1).values as unknown[];
      const r = rowOf(ws, kids[0].admissionNo);
      expect(ws.getRow(r).getCell(keys.indexOf(`d:${D}`)).value).toBe('P');
      ws.getRow(r).getCell(keys.indexOf(`d:${D}`)).value = null; // cleared by hand
      const checked = (
        await uploadXlsx(
          admin,
          '/api/imports/student-attendance/check',
          wb,
          201,
        )
      ).body;
      expect(checked.summary.ready).toBe(0);
      expect(
        await prisma.attendanceRecord.count({
          where: { studentId: kids[0].id, date: at(D) },
        }),
      ).toBe(1);
    });

    it('holds a teacher to their own divisions and the last week', async () => {
      await teacher.get(`${studentUrl}${otherDivisionId}`).expect(404);
      const wb = await downloadXlsx(teacher, `${studentUrl}${divisionId}`);
      const ws = wb.getWorksheet(sheet)!;
      fillSheet(
        wb,
        sheet,
        [{ [`d:${D}`]: 'L' }],
        rowOf(ws, kids[0].admissionNo),
      );
      const checked = (
        await uploadXlsx(
          teacher,
          '/api/imports/student-attendance/check',
          wb,
          201,
        )
      ).body;
      expect(checked.summary.withErrors).toBe(1);
      expect(
        checked.rows.find((x: { errors: string[] }) => x.errors.length)
          .errors[0],
      ).toMatch(/only the school admin/);
    });

    it('hands back the rows to fix in their place on the register', async () => {
      const wb = await downloadXlsx(
        admin,
        `/api/imports/batches/${batchId}/problems`,
      );
      const ws = wb.getWorksheet(sheet)!;
      const lastCol = ws.getRow(1).cellCount + 1;
      expect(ws.getRow(2).getCell(lastCol).text).toMatch(/Error/);
      const problems = [];
      for (let r = 3; r < 50; r++)
        if (ws.getRow(r).getCell(lastCol).value) problems.push(r);
      expect(problems).toHaveLength(1);
    });
  });

  describe('staff', () => {
    const url = `/api/imports/staff-attendance/template?month=${MONTH}`;

    it('is for the school admin only', async () => {
      await office.get(url).expect(403);
      await teacher.get(url).expect(403);
    });

    it('shows approved leave as LV, keeps it when left alone, and warns when it is replaced', async () => {
      const wb = await downloadXlsx(admin, url);
      const ws = wb.getWorksheet('Staff')!;
      const keys = ws.getRow(1).values as unknown[];
      const leaveRow = rowOf(ws, leaveStaffNo);
      expect(ws.getRow(leaveRow).getCell(keys.indexOf(`d:${D}`)).value).toBe(
        'LV',
      );

      fillSheet(wb, 'Staff', [{ [`d:${D}`]: 'P' }], rowOf(ws, staffNo));
      const left = (
        await uploadXlsx(admin, '/api/imports/staff-attendance/check', wb, 201)
      ).body;
      const leaveLine = left.rows.find(
        (r: { label: string }) => r.label === `Staff2 ${STAFF_SURNAME}`,
      );
      expect(leaveLine.unchanged).toBe(true);

      fillSheet(wb, 'Staff', [{ [`d:${D}`]: 'P' }], leaveRow);
      const replaced = (
        await uploadXlsx(admin, '/api/imports/staff-attendance/check', wb, 201)
      ).body;
      const line = replaced.rows.find(
        (r: { label: string }) => r.label === `Staff2 ${STAFF_SURNAME}`,
      );
      expect(line.warnings[0]).toMatch(/replaces approved/);

      await admin.post(`/api/imports/batches/${replaced.id}/run`).expect(200);
      const rec = await prisma.staffAttendanceRecord.findUniqueOrThrow({
        where: { staffId_date: { staffId, date: at(D) } },
      });
      expect(rec).toMatchObject({ status: 'PRESENT', source: 'IMPORT' });
    });

    it('refuses marks before a person joined', async () => {
      const early = weekday(`${Y0}-05-10`); // before anyone here joined
      const wb = await downloadXlsx(
        admin,
        `/api/imports/staff-attendance/template?month=${early.slice(0, 7)}`,
      );
      const ws = wb.getWorksheet('Staff')!;
      let r: number;
      try {
        r = rowOf(ws, staffNo);
      } catch {
        r = 400;
        fillSheet(wb, 'Staff', [{ employeeNo: staffNo }], r);
      }
      fillSheet(wb, 'Staff', [{ [`d:${early}`]: 'P' }], r);
      const checked = (
        await uploadXlsx(admin, '/api/imports/staff-attendance/check', wb, 201)
      ).body;
      const line = checked.rows.find(
        (x: { errors: string[] }) => x.errors.length,
      );
      expect(line.errors[0]).toMatch(/not working here|did not work here/);
    });
  });
});
