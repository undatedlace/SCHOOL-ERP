import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { Page, skipTake } from '../../common/dto/page-query.dto.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { isIsoDate, toDate, toIso } from '../attendance/attendance-rules.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { StudentsService } from '../students/students.service.js';
import { markProblem, percentOf, statsOf } from './assessment-rules.js';
import {
  CreateAssessmentDto,
  ListAssessmentsQueryDto,
  SaveMarksDto,
  UpdateAssessmentDto,
} from './dto/assessments.dto.js';

const INCLUDE = {
  subject: { select: { id: true, name: true } },
  division: {
    select: { id: true, name: true, class: { select: { name: true } } },
  },
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.AssessmentInclude;
type Row = Prisma.AssessmentGetPayload<{ include: typeof INCLUDE }>;

const num = (d: Prisma.Decimal | null | undefined) =>
  d === null || d === undefined ? null : Number(d.toString());

/** Tests and results: teachers set a test and enter marks, then publish so families can see. */
@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly students: StudentsService,
  ) {}

  private can = (auth: AuthContext, p: string) => auth.permissions.includes(p);
  /** Administrators hold results.publish and work on any test. */
  private all = (auth: AuthContext) => this.can(auth, 'results.publish');

  private async currentYear(schoolId: string) {
    const y = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      select: { id: true },
    });
    if (!y) {
      throw new BadRequestException(
        'There is no current academic year. Set one in Academic setup.',
      );
    }
    return y.id;
  }

  /** Whether this person may run tests for a subject in a division: its class teacher, or the subject's teacher there. */
  private async mayWork(
    auth: AuthContext,
    divisionId: string,
    subjectId: string,
    yearId: string,
  ): Promise<boolean> {
    if (this.all(auth)) return true;
    const staff = { userId: auth.userId, status: 'ACTIVE' as const };
    const [classTeacher, subjectTeacher] = await Promise.all([
      this.prisma.classTeacher.count({
        where: {
          schoolId: auth.schoolId,
          academicYearId: yearId,
          divisionId,
          staff,
        },
      }),
      this.prisma.subjectTeacher.count({
        where: {
          schoolId: auth.schoolId,
          academicYearId: yearId,
          divisionId,
          subjectId,
          staff,
        },
      }),
    ]);
    return classTeacher + subjectTeacher > 0;
  }

  /** The divisions (and subjects) a person may set tests for. */
  async options(auth: AuthContext) {
    const yearId = await this.currentYear(auth.schoolId);
    const wide = this.all(auth);
    const staff = { userId: auth.userId, status: 'ACTIVE' as const };
    const where = { schoolId: auth.schoolId, academicYearId: yearId, staff };
    const [ct, st, divisions, subjects] = await Promise.all([
      wide
        ? []
        : this.prisma.classTeacher.findMany({
            where,
            select: { divisionId: true },
          }),
      wide
        ? []
        : this.prisma.subjectTeacher.findMany({
            where,
            select: { divisionId: true, subjectId: true },
          }),
      this.prisma.division.findMany({
        where: { schoolId: auth.schoolId },
        select: {
          id: true,
          name: true,
          class: { select: { name: true, sortOrder: true } },
        },
      }),
      this.prisma.subject.findMany({
        where: { schoolId: auth.schoolId },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
    ]);
    const classTeacherOf = new Set(ct.map((r) => r.divisionId));
    const subjectsIn = new Map<string, Set<string>>();
    for (const r of st) {
      subjectsIn.set(
        r.divisionId,
        (subjectsIn.get(r.divisionId) ?? new Set()).add(r.subjectId),
      );
    }
    const mine = divisions.filter(
      (d) => wide || classTeacherOf.has(d.id) || subjectsIn.has(d.id),
    );
    mine.sort(
      (a, b) =>
        a.class.sortOrder - b.class.sortOrder || a.name.localeCompare(b.name),
    );
    return {
      divisions: mine.map((d) => ({
        id: d.id,
        label: `${d.class.name}-${d.name}`,
        /** Every subject (class teacher or administrator), or only the ones this person teaches there. */
        subjectIds:
          wide || classTeacherOf.has(d.id)
            ? subjects.map((s) => s.id)
            : [...(subjectsIn.get(d.id) ?? [])],
      })),
      subjects,
    };
  }

  async create(auth: AuthContext, dto: CreateAssessmentDto, ip?: string) {
    if (!isIsoDate(dto.conductedOn)) {
      throw new BadRequestException('The date is not a real date');
    }
    const yearId = await this.currentYear(auth.schoolId);
    const [division, subject] = await Promise.all([
      this.prisma.division.count({
        where: { id: dto.divisionId, schoolId: auth.schoolId },
      }),
      this.prisma.subject.count({
        where: { id: dto.subjectId, schoolId: auth.schoolId },
      }),
    ]);
    if (!division)
      throw new BadRequestException('That division does not exist');
    if (!subject) throw new BadRequestException('That subject does not exist');
    if (!(await this.mayWork(auth, dto.divisionId, dto.subjectId, yearId))) {
      throw new ForbiddenException(
        'You can set tests only for the subjects and divisions you teach',
      );
    }
    const created = await this.prisma.assessment.create({
      data: {
        schoolId: auth.schoolId,
        academicYearId: yearId,
        name: dto.name,
        kind: dto.kind ?? 'OTHER',
        subjectId: dto.subjectId,
        divisionId: dto.divisionId,
        maxMarks: dto.maxMarks,
        conductedOn: toDate(dto.conductedOn),
        createdById: auth.userId,
      },
      include: INCLUDE,
    });
    await this.record(auth, 'assessment.created', created.id, ip);
    return this.summary(created);
  }

  async list(
    auth: AuthContext,
    q: ListAssessmentsQueryDto,
  ): Promise<Page<Awaited<ReturnType<AssessmentsService['summary']>>>> {
    const yearId = await this.currentYear(auth.schoolId);
    const status = q.status ?? 'all';
    const where: Prisma.AssessmentWhereInput = {
      schoolId: auth.schoolId,
      academicYearId: yearId,
      archivedAt: null,
      ...(this.all(auth) ? {} : { createdById: auth.userId }),
      ...(q.divisionId ? { divisionId: q.divisionId } : {}),
      ...(q.subjectId ? { subjectId: q.subjectId } : {}),
      ...(status === 'draft' ? { publishedAt: null } : {}),
      ...(status === 'published' ? { publishedAt: { not: null } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.assessment.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ conductedOn: 'desc' }, { createdAt: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.assessment.count({ where }),
    ]);
    return {
      items: await Promise.all(rows.map((r) => this.summary(r))),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  /** A test with every student of the division and their marks. */
  async one(auth: AuthContext, id: string) {
    const a = await this.find(auth, id);
    const [enrolled, marks] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: {
          schoolId: auth.schoolId,
          academicYearId: a.academicYearId,
          divisionId: a.divisionId,
          student: { status: 'ACTIVE' },
        },
        select: {
          rollNo: true,
          student: {
            select: {
              id: true,
              admissionNo: true,
              firstName: true,
              surname: true,
            },
          },
        },
      }),
      this.prisma.assessmentMark.findMany({ where: { assessmentId: id } }),
    ]);
    const byStudent = new Map(marks.map((m) => [m.studentId, m]));
    const max = num(a.maxMarks)!;
    const students = enrolled
      .map((e) => {
        const m = byStudent.get(e.student.id);
        return {
          studentId: e.student.id,
          admissionNo: e.student.admissionNo,
          name: `${e.student.firstName} ${e.student.surname}`,
          rollNo: e.rollNo,
          marks: num(m?.marks),
          absent: m?.absent ?? false,
          remark: m?.remark ?? null,
          percent: percentOf(num(m?.marks), max),
        };
      })
      .sort(
        (x, y) =>
          (x.rollNo ?? 9999) - (y.rollNo ?? 9999) ||
          x.name.localeCompare(y.name),
      );
    return {
      ...(await this.summary(a)),
      stats: statsOf(
        students.map((s) => ({ marks: s.marks, absent: s.absent })),
      ),
      students,
    };
  }

  async update(
    auth: AuthContext,
    id: string,
    dto: UpdateAssessmentDto,
    ip?: string,
  ) {
    const a = await this.mayChange(auth, id);
    if (dto.conductedOn && !isIsoDate(dto.conductedOn)) {
      throw new BadRequestException('The date is not a real date');
    }
    if (dto.maxMarks !== undefined) {
      const top = await this.prisma.assessmentMark.aggregate({
        where: { assessmentId: id },
        _max: { marks: true },
      });
      const highest = num(top._max.marks);
      if (highest !== null && dto.maxMarks < highest) {
        throw new BadRequestException(
          `A student already has ${highest}, so the maximum cannot be below that`,
        );
      }
    }
    await this.prisma.assessment.update({
      where: { id: a.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.maxMarks !== undefined ? { maxMarks: dto.maxMarks } : {}),
        ...(dto.conductedOn !== undefined
          ? { conductedOn: toDate(dto.conductedOn) }
          : {}),
      },
    });
    await this.record(auth, 'assessment.updated', id, ip, {
      fields: Object.keys(dto).join(','),
    });
    return this.one(auth, id);
  }

  /** Saves marks for the students sent; sending a student again changes their mark. */
  async saveMarks(
    auth: AuthContext,
    id: string,
    dto: SaveMarksDto,
    ip?: string,
  ) {
    const a = await this.mayChange(auth, id);
    const max = num(a.maxMarks)!;
    const ids = dto.entries.map((e) => e.studentId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('A student appears more than once');
    }
    const roster = new Set(
      (
        await this.prisma.enrollment.findMany({
          where: {
            schoolId: auth.schoolId,
            academicYearId: a.academicYearId,
            divisionId: a.divisionId,
            studentId: { in: ids },
            student: { status: 'ACTIVE' },
          },
          select: { studentId: true },
        })
      ).map((e) => e.studentId),
    );
    if (ids.some((s) => !roster.has(s))) {
      throw new BadRequestException('Some students are not in this division');
    }
    for (const e of dto.entries) {
      const problem = markProblem(e, max);
      if (problem) throw new BadRequestException(problem);
    }
    await this.prisma.$transaction(
      dto.entries.map((e) => {
        const absent = e.absent === true;
        const data = {
          marks: absent ? null : (e.marks ?? null),
          absent,
          remark: e.remark?.trim() || null,
          enteredById: auth.userId,
        };
        return this.prisma.assessmentMark.upsert({
          where: {
            assessmentId_studentId: {
              assessmentId: id,
              studentId: e.studentId,
            },
          },
          create: { assessmentId: id, studentId: e.studentId, ...data },
          update: data,
        });
      }),
    );
    // Changing marks after families can see them is worth a separate line in the log.
    await this.record(
      auth,
      a.publishedAt
        ? 'assessment.marks_changed_after_publish'
        : 'assessment.marks_entered',
      id,
      ip,
      { students: ids.length },
    );
    return this.one(auth, id);
  }

  /** Makes the results visible to the families of the division, and tells them. */
  async publish(auth: AuthContext, id: string, ip?: string) {
    const a = await this.mayChange(auth, id);
    if (a.publishedAt) return this.one(auth, id);
    const entered = await this.prisma.assessmentMark.count({
      where: { assessmentId: id },
    });
    if (entered === 0) {
      throw new BadRequestException('Enter some marks before publishing');
    }
    await this.prisma.assessment.update({
      where: { id },
      data: { publishedAt: new Date(), publishedById: auth.userId },
    });
    await this.record(auth, 'assessment.published', id, ip, { entered });
    const students = await this.prisma.student.findMany({
      where: {
        schoolId: auth.schoolId,
        status: 'ACTIVE',
        enrollments: {
          some: { academicYearId: a.academicYearId, divisionId: a.divisionId },
        },
      },
      select: {
        userId: true,
        guardians: { select: { guardian: { select: { userId: true } } } },
      },
    });
    await this.notifications.notify(
      auth.schoolId,
      students.flatMap((s) => [
        s.userId,
        ...s.guardians.map((g) => g.guardian.userId),
      ]),
      {
        type: 'result.published',
        title: `Result published: ${a.name} (${a.subject.name})`,
        body: `${a.division.class.name}-${a.division.name}`,
        link: '/portal/results',
      },
    );
    return this.one(auth, id);
  }

  /** Takes the results back from families (for example to correct them). Marks are kept. */
  async unpublish(auth: AuthContext, id: string, ip?: string) {
    await this.mayChange(auth, id);
    await this.prisma.assessment.update({
      where: { id },
      data: { publishedAt: null, publishedById: null },
    });
    await this.record(auth, 'assessment.unpublished', id, ip);
    return this.one(auth, id);
  }

  async archive(auth: AuthContext, id: string, ip?: string) {
    await this.mayChange(auth, id);
    await this.prisma.assessment.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    await this.record(auth, 'assessment.archived', id, ip);
  }

  /**
   * Published results for one student. A parent or student sees their own child; a teacher the students
   * of the divisions they teach; an administrator any. Only published tests are ever shown.
   */
  async forStudent(auth: AuthContext, studentId: string) {
    if (this.all(auth)) await this.students.assertVisible(auth, studentId);
    else await this.students.assertInScope(auth, studentId);
    const yearId = await this.currentYear(auth.schoolId);
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId, academicYearId: yearId },
      select: { divisionId: true },
    });
    const student = await this.prisma.student.findFirstOrThrow({
      where: { id: studentId, schoolId: auth.schoolId },
      select: { id: true, firstName: true, surname: true },
    });
    if (!enrollment) {
      return {
        student: {
          id: student.id,
          name: `${student.firstName} ${student.surname}`,
        },
        results: [],
      };
    }
    const mine = await this.prisma.assessmentMark.findMany({
      where: {
        studentId,
        assessment: {
          schoolId: auth.schoolId,
          academicYearId: yearId,
          archivedAt: null,
          publishedAt: { not: null },
        },
      },
      include: { assessment: { include: INCLUDE } },
      orderBy: { assessment: { conductedOn: 'desc' } },
    });
    const everyone = mine.length
      ? await this.prisma.assessmentMark.findMany({
          where: { assessmentId: { in: mine.map((m) => m.assessmentId) } },
          select: { assessmentId: true, marks: true, absent: true },
        })
      : [];
    return {
      student: {
        id: student.id,
        name: `${student.firstName} ${student.surname}`,
      },
      results: mine.map((m) => {
        const max = num(m.assessment.maxMarks)!;
        const stats = statsOf(
          everyone
            .filter((e) => e.assessmentId === m.assessmentId)
            .map((e) => ({ marks: num(e.marks), absent: e.absent })),
        );
        return {
          assessment: {
            id: m.assessment.id,
            name: m.assessment.name,
            kind: m.assessment.kind,
            subject: m.assessment.subject,
            conductedOn: toIso(m.assessment.conductedOn),
            maxMarks: max,
          },
          marks: num(m.marks),
          absent: m.absent,
          remark: m.remark,
          percent: percentOf(num(m.marks), max),
          classAverage: stats.average,
          classHighest: stats.highest,
        };
      }),
    };
  }

  // ---------- helpers ----------

  private async find(auth: AuthContext, id: string): Promise<Row> {
    const a = await this.prisma.assessment.findFirst({
      where: {
        id,
        schoolId: auth.schoolId,
        archivedAt: null,
        ...(this.all(auth) ? {} : { createdById: auth.userId }),
      },
      include: INCLUDE,
    });
    // A test that is not yours looks like one that does not exist.
    if (!a) throw new NotFoundException('Test not found');
    return a;
  }

  /** The person who set the test, or an administrator. */
  private async mayChange(auth: AuthContext, id: string): Promise<Row> {
    return this.find(auth, id);
  }

  private async summary(a: Row) {
    const [entered, total] = await Promise.all([
      this.prisma.assessmentMark.count({ where: { assessmentId: a.id } }),
      this.prisma.enrollment.count({
        where: {
          academicYearId: a.academicYearId,
          divisionId: a.divisionId,
          student: { status: 'ACTIVE' },
        },
      }),
    ]);
    return {
      id: a.id,
      name: a.name,
      kind: a.kind,
      subject: a.subject,
      division: {
        id: a.division.id,
        label: `${a.division.class.name}-${a.division.name}`,
      },
      maxMarks: num(a.maxMarks)!,
      conductedOn: toIso(a.conductedOn),
      published: a.publishedAt !== null,
      publishedAt: a.publishedAt,
      createdBy: a.createdBy,
      entered,
      students: total,
    };
  }

  private record(
    auth: AuthContext,
    action: string,
    entityId: string,
    ip?: string,
    metadata?: Prisma.InputJsonObject,
  ) {
    return this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action,
      entityType: 'assessment',
      entityId,
      metadata,
      ip,
    });
  }
}
