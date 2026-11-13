import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { Page, skipTake } from '../../common/dto/page-query.dto.js';
import { Eligibility, checkEligibility } from '../../common/age.js';
import { dateOnly, todayIso } from '../../common/dates.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { ApplicationStatus } from '../../generated/prisma/enums.js';
import { AuditService } from '../audit/audit.service.js';
import {
  FormSchema,
  photoIds,
  systemValue,
  validateAnswers,
} from '../forms/form-schema.js';
import { FilesService } from '../files/files.service.js';
import { StudentsService } from '../students/students.service.js';
import type { GuardianInputDto } from '../students/dto/students.dto.js';
import { suggestGuardians } from './guardian-suggestions.js';
import { GENDER_VALUES } from '../forms/form-schema.js';
import { FormsService } from '../forms/forms.service.js';
import {
  AdmitDto,
  CreateApplicationDto,
  Decision,
  DecisionDto,
  ListApplicationsQueryDto,
  UpdateApplicationDto,
} from './dto/admissions.dto.js';

const FORM_KEY = 'admission';

/** One application from an Excel import, already checked and converted. */
export interface ImportedApplication {
  academicYearId: string;
  formNo: string | null;
  receivedOn: string;
  status: ApplicationStatus;
  decidedOn: string | null;
  decisionNote: string | null;
  answers: Record<string, unknown>;
  studentName: string;
  dateOfBirth: string | null;
  classId: string | null;
  /** Set when the child was admitted. */
  enrol: null | {
    admissionNo: string | null;
    student: {
      firstName: string;
      fatherName: string | null;
      surname: string;
      gender: 'MALE' | 'FEMALE' | 'OTHER';
      dateOfBirth: string;
    };
    guardians: GuardianInputDto[];
    /** First the admission year, then each later year studied here, in order. */
    years: {
      academicYearId: string;
      divisionId: string;
      startedOn: string;
      endedOn: string | null;
    }[];
    leftOn: string | null;
  };
}

/** Where an application may go next. A granted application is final (it becomes a student later). */
const TRANSITIONS: Record<ApplicationStatus, Decision[]> = {
  RECEIVED: ['UNDER_REVIEW', 'GRANTED', 'REFUSED', 'WITHDRAWN'],
  UNDER_REVIEW: ['GRANTED', 'REFUSED', 'WITHDRAWN'],
  GRANTED: [],
  REFUSED: ['UNDER_REVIEW'],
  WITHDRAWN: ['UNDER_REVIEW'],
};
const EDITABLE: ApplicationStatus[] = ['RECEIVED', 'UNDER_REVIEW'];

const LIST_INCLUDE = {
  appliedClass: {
    select: { id: true, name: true, minAgeYears: true, admissionsOpen: true },
  },
  academicYear: { select: { id: true, name: true, ageCutoffDate: true } },
} satisfies Prisma.ApplicationInclude;

type ListRow = Prisma.ApplicationGetPayload<{ include: typeof LIST_INCLUDE }>;

const listItem = (a: ListRow) => ({
  id: a.id,
  formNo: a.formNo,
  seq: a.seq,
  status: a.status,
  studentName: a.studentName,
  dateOfBirth: a.dateOfBirth,
  receivedOn: a.receivedOn,
  class: a.appliedClass
    ? { id: a.appliedClass.id, name: a.appliedClass.name }
    : null,
  academicYear: { id: a.academicYear.id, name: a.academicYear.name },
});

const iso = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class AdmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly forms: FormsService,
    private readonly files: FilesService,
    private readonly students: StudentsService,
  ) {}

  /** The published admission form the office fills in. */
  async getForm(schoolId: string) {
    const form = await this.forms.getPublished(schoolId, FORM_KEY);
    return {
      id: form.id,
      version: form.version,
      name: form.name,
      schema: form.schema as unknown as FormSchema,
    };
  }

  async list(
    schoolId: string,
    q: ListApplicationsQueryDto,
  ): Promise<Page<ReturnType<typeof listItem>>> {
    const yearId = q.academicYearId ?? (await this.currentYearId(schoolId));
    const where: Prisma.ApplicationWhereInput = {
      schoolId,
      ...(yearId ? { academicYearId: yearId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.classId ? { classId: q.classId } : {}),
      ...(q.receivedFrom || q.receivedTo
        ? {
            receivedOn: {
              ...(q.receivedFrom ? { gte: dateOnly(q.receivedFrom) } : {}),
              ...(q.receivedTo ? { lte: dateOnly(q.receivedTo) } : {}),
            },
          }
        : {}),
      ...(q.admitted === undefined
        ? {}
        : { studentId: q.admitted ? { not: null } : null }),
      ...(q.search
        ? {
            OR: [
              { studentName: { contains: q.search, mode: 'insensitive' } },
              { formNo: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.application.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: [{ receivedOn: 'desc' }, { seq: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.application.count({ where }),
    ]);
    return {
      items: rows.map(listItem),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  /** Counts by status for one academic year (the current one by default). */
  async summary(schoolId: string, academicYearId?: string) {
    const yearId = academicYearId ?? (await this.currentYearId(schoolId));
    const counts = Object.fromEntries(
      (
        ['RECEIVED', 'UNDER_REVIEW', 'GRANTED', 'REFUSED', 'WITHDRAWN'] as const
      ).map((s) => [s, 0]),
    ) as Record<ApplicationStatus, number>;
    if (!yearId) return { academicYearId: null, total: 0, counts };

    const groups = await this.prisma.application.groupBy({
      by: ['status'],
      where: { schoolId, academicYearId: yearId },
      _count: { _all: true },
    });
    for (const g of groups) counts[g.status] = g._count._all;
    return {
      academicYearId: yearId,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      counts,
    };
  }

  async findOne(schoolId: string, id: string) {
    const app = await this.prisma.application.findFirst({
      where: { id, schoolId },
      include: {
        ...LIST_INCLUDE,
        form: { select: { id: true, version: true, name: true, schema: true } },
        grantedClass: { select: { id: true, name: true } },
        grantedDivision: { select: { id: true, name: true } },
      },
    });
    if (!app) throw new NotFoundException('Application not found');
    return {
      ...listItem(app),
      answers: app.answers as Record<string, unknown>,
      form: {
        id: app.form.id,
        version: app.form.version,
        name: app.form.name,
        schema: app.form.schema as unknown as FormSchema,
      },
      decision: {
        decidedAt: app.decidedAt,
        note: app.decisionNote,
        grantedClass: app.grantedClass,
        grantedDivision: app.grantedDivision,
      },
      eligibility: app.appliedClass
        ? checkEligibility({
            className: app.appliedClass.name,
            dateOfBirth: app.dateOfBirth ? iso(app.dateOfBirth) : null,
            asOn: iso(app.academicYear.ageCutoffDate ?? app.receivedOn),
            minAgeYears: app.appliedClass.minAgeYears,
            admissionsOpen: app.appliedClass.admissionsOpen,
          })
        : null,
      allowedDecisions: TRANSITIONS[app.status],
      editable: EDITABLE.includes(app.status),
      createdAt: app.createdAt,
      studentId: app.studentId,
      admittedAt: app.admittedAt,
      // A starting point for the guardians, offered only while the application can still be admitted.
      suggestedGuardians:
        app.status === 'GRANTED' && !app.studentId
          ? suggestGuardians(app.answers as Record<string, unknown>)
          : [],
    };
  }

  /**
   * Turns a granted application into a student, with guardians and the first
   * enrollment. All or nothing: if anything fails, nothing is created.
   */
  async admit(auth: AuthContext, id: string, dto: AdmitDto, ip?: string) {
    const app = await this.prisma.application.findFirst({
      where: { id, schoolId: auth.schoolId },
      include: { form: { select: { schema: true } } },
    });
    if (!app) throw new NotFoundException('Application not found');
    if (app.studentId)
      throw new ConflictException('This application has already been admitted');
    if (app.status !== 'GRANTED') {
      throw new BadRequestException(
        'Only a granted application can be admitted',
      );
    }

    const classId = app.grantedClassId ?? app.classId;
    const division = await this.prisma.division.findFirst({
      where: {
        id: dto.divisionId,
        schoolId: auth.schoolId,
        ...(classId ? { classId } : {}),
      },
      select: { id: true },
    });
    if (!division) {
      throw new BadRequestException(
        'Choose a division of the class the student was granted',
      );
    }

    const schema = app.form.schema as unknown as FormSchema;
    const answers = app.answers as Record<string, unknown>;
    const text = (key: Parameters<typeof systemValue>[2]) => {
      const v = systemValue(schema, answers, key);
      return typeof v === 'string' ? v : '';
    };
    const gender = text('student.gender');
    if (!GENDER_VALUES.includes(gender) || !app.dateOfBirth) {
      throw new BadRequestException(
        'The application is missing the gender or date of birth',
      );
    }

    const student = await this.prisma.$transaction(async (tx) => {
      const created = await this.students.createInTransaction(
        tx,
        auth.schoolId,
        {
          firstName: text('student.firstName'),
          fatherName: text('student.fatherName') || null,
          surname: text('student.surname'),
          gender: gender as 'MALE' | 'FEMALE' | 'OTHER',
          dateOfBirth: app.dateOfBirth!.toISOString().slice(0, 10),
          photoFileId: text('student.photo') || null,
          admissionNo: dto.admissionNo,
          joinedOn: dto.joinedOn,
          academicYearId: app.academicYearId,
          divisionId: division.id,
          guardians: dto.guardians,
        },
      );
      // Guards against two people admitting the same application at the same moment.
      const claimed = await tx.application.updateMany({
        where: { id, studentId: null },
        data: {
          studentId: created.id,
          admittedAt: new Date(),
          grantedDivisionId: division.id,
        },
      });
      if (claimed.count !== 1)
        throw new ConflictException(
          'This application has already been admitted',
        );
      return created;
    });

    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'admissions.admitted',
      entityType: 'application',
      entityId: id,
      metadata: { studentId: student.id, admissionNo: student.admissionNo },
      ip,
    });
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'students.created',
      entityType: 'student',
      entityId: student.id,
      ip,
    });
    return { studentId: student.id, admissionNo: student.admissionNo };
  }

  /**
   * Is a child of this age eligible for this class? Advice for the office while an
   * application is being filled in: it never blocks saving.
   */
  async eligibility(
    schoolId: string,
    classId: string,
    dateOfBirth: string,
    receivedOn?: string,
  ): Promise<Eligibility> {
    const cls = await this.prisma.schoolClass.findFirst({
      where: { id: classId, schoolId },
      select: { name: true, minAgeYears: true, admissionsOpen: true },
    });
    if (!cls) throw new NotFoundException('Class not found');
    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      select: { ageCutoffDate: true },
    });
    return checkEligibility({
      className: cls.name,
      dateOfBirth,
      asOn: year?.ageCutoffDate
        ? iso(year.ageCutoffDate)
        : (receivedOn ?? todayIso()),
      minAgeYears: cls.minAgeYears,
      admissionsOpen: cls.admissionsOpen,
    });
  }

  async create(auth: AuthContext, dto: CreateApplicationDto, ip?: string) {
    const yearId =
      dto.academicYearId ?? (await this.currentYearId(auth.schoolId));
    if (!yearId)
      throw new BadRequestException(
        'Set a current academic year before taking applications',
      );
    const year = await this.prisma.academicYear.findFirst({
      where: { id: yearId, schoolId: auth.schoolId },
      select: { id: true },
    });
    if (!year) throw new NotFoundException('Academic year not found');

    const form = await this.forms.getPublished(auth.schoolId, FORM_KEY);
    const schema = form.schema as unknown as FormSchema;
    const answers = await this.checkAnswers(auth.schoolId, schema, dto.answers);
    const derived = this.derive(schema, answers);

    if (dto.formNo)
      await this.assertFormNoFree(auth.schoolId, yearId, dto.formNo);

    let created;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const { seq, formNo } = await this.nextNumber(
          tx,
          auth.schoolId,
          yearId,
          dto.formNo,
        );

        return tx.application.create({
          data: {
            schoolId: auth.schoolId,
            academicYearId: yearId,
            formId: form.id,
            seq,
            formNo,
            receivedOn: dateOnly(dto.receivedOn ?? todayIso()),
            answers: answers as Prisma.InputJsonObject,
            createdById: auth.userId,
            ...derived,
          },
        });
      });
    } catch (error) {
      // Only reachable if the same paper number is typed twice at the same moment.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Form number ${dto.formNo ?? ''} is already used this year`.trim(),
        );
      }
      throw error;
    }

    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'admissions.created',
      entityType: 'application',
      entityId: created.id,
      metadata: { formNo: created.formNo },
      ip,
    });
    return this.findOne(auth.schoolId, created.id);
  }

  async update(
    auth: AuthContext,
    id: string,
    dto: UpdateApplicationDto,
    ip?: string,
  ) {
    const app = await this.prisma.application.findFirst({
      where: { id, schoolId: auth.schoolId },
      include: { form: { select: { schema: true } } },
    });
    if (!app) throw new NotFoundException('Application not found');
    if (!EDITABLE.includes(app.status)) {
      throw new BadRequestException(
        'A granted application can no longer be edited',
      );
    }
    if (dto.formNo && dto.formNo !== app.formNo) {
      await this.assertFormNoFree(
        auth.schoolId,
        app.academicYearId,
        dto.formNo,
      );
    }

    let derived: ReturnType<AdmissionsService['derive']> | undefined;
    let answers: Record<string, unknown> | undefined;
    if (dto.answers) {
      // Checked against the version this application was filled in with, not the newest one.
      const schema = app.form.schema as unknown as FormSchema;
      answers = await this.checkAnswers(auth.schoolId, schema, dto.answers);
      derived = this.derive(schema, answers);
    }

    await this.prisma.application.update({
      where: { id },
      data: {
        ...(dto.formNo ? { formNo: dto.formNo } : {}),
        ...(dto.receivedOn ? { receivedOn: dateOnly(dto.receivedOn) } : {}),
        ...(answers
          ? { answers: answers as Prisma.InputJsonObject, ...derived }
          : {}),
      },
    });
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'admissions.updated',
      entityType: 'application',
      entityId: id,
      ip,
    });
    return this.findOne(auth.schoolId, id);
  }

  async decide(auth: AuthContext, id: string, dto: DecisionDto, ip?: string) {
    const app = await this.prisma.application.findFirst({
      where: { id, schoolId: auth.schoolId },
    });
    if (!app) throw new NotFoundException('Application not found');
    if (!TRANSITIONS[app.status].includes(dto.decision)) {
      throw new BadRequestException(
        `An application that is ${app.status} cannot become ${dto.decision}`,
      );
    }

    let granted: {
      grantedClassId: string | null;
      grantedDivisionId: string | null;
    } = {
      grantedClassId: null,
      grantedDivisionId: null,
    };
    if (dto.decision === 'GRANTED') {
      const classId = dto.classId ?? app.classId;
      if (!classId)
        throw new BadRequestException(
          'Choose the class the student is admitted to',
        );
      const cls = await this.prisma.schoolClass.findFirst({
        where: { id: classId, schoolId: auth.schoolId },
        select: { id: true },
      });
      if (!cls) throw new BadRequestException('That class does not exist');
      if (dto.divisionId) {
        const division = await this.prisma.division.findFirst({
          where: { id: dto.divisionId, schoolId: auth.schoolId, classId },
          select: { id: true },
        });
        if (!division)
          throw new BadRequestException(
            'That division does not belong to the chosen class',
          );
      }
      granted = {
        grantedClassId: classId,
        grantedDivisionId: dto.divisionId ?? null,
      };
    }

    const reopening = dto.decision === 'UNDER_REVIEW';
    // A decision taken on paper earlier can carry its real date (never later than today).
    if (dto.decidedOn) {
      if (dto.decidedOn > todayIso())
        throw new BadRequestException(
          'The decision date cannot be in the future',
        );
      if (dto.decidedOn < iso(app.receivedOn))
        throw new BadRequestException(
          'The decision date cannot be before the form was received',
        );
    }
    await this.prisma.application.update({
      where: { id },
      data: {
        status: dto.decision,
        decidedAt: reopening
          ? null
          : dto.decidedOn
            ? dateOnly(dto.decidedOn)
            : new Date(),
        decidedById: reopening ? null : auth.userId,
        decisionNote: dto.note || null,
        ...granted,
      },
    });
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'admissions.decided',
      entityType: 'application',
      entityId: id,
      metadata: { from: app.status, to: dto.decision },
      ip,
    });
    return this.findOne(auth.schoolId, id);
  }

  /**
   * Brings in one application from an Excel import, already checked: with its status and
   * decision date, and, when the child was admitted, the student, guardians and an enrolment
   * for every year they studied here. All of it or none of it.
   */
  async importOne(
    auth: AuthContext,
    batchId: string,
    formId: string,
    row: ImportedApplication,
  ): Promise<{ applicationId: string; studentId: string | null }> {
    const decided = ['GRANTED', 'REFUSED', 'WITHDRAWN'].includes(row.status);
    const result = await this.prisma.$transaction(async (tx) => {
      const { seq, formNo } = await this.nextNumber(
        tx,
        auth.schoolId,
        row.academicYearId,
        row.formNo ?? undefined,
      );
      const app = await tx.application.create({
        data: {
          schoolId: auth.schoolId,
          academicYearId: row.academicYearId,
          formId,
          seq,
          formNo,
          status: row.status,
          receivedOn: dateOnly(row.receivedOn),
          answers: row.answers as Prisma.InputJsonObject,
          studentName: row.studentName,
          dateOfBirth: row.dateOfBirth ? dateOnly(row.dateOfBirth) : null,
          classId: row.classId,
          grantedClassId: row.status === 'GRANTED' ? row.classId : null,
          grantedDivisionId: row.enrol?.years[0]?.divisionId ?? null,
          decidedAt: decided && row.decidedOn ? dateOnly(row.decidedOn) : null,
          decidedById: decided ? auth.userId : null,
          decisionNote: row.decisionNote,
          importBatchId: batchId,
          createdById: auth.userId,
        },
      });
      if (!row.enrol) return { applicationId: app.id, studentId: null };

      const e = row.enrol;
      const [first, ...later] = e.years;
      const student = await this.students.createInTransaction(
        tx,
        auth.schoolId,
        {
          ...e.student,
          photoFileId: null,
          admissionNo: e.admissionNo ?? undefined,
          joinedOn: first.startedOn,
          academicYearId: first.academicYearId,
          divisionId: first.divisionId,
          guardians: e.guardians,
        },
      );
      if (first.endedOn) {
        await tx.enrollment.updateMany({
          where: {
            studentId: student.id,
            academicYearId: first.academicYearId,
          },
          data: { endedOn: dateOnly(first.endedOn) },
        });
      }
      // Each later year, the same way year-end promotion writes it.
      for (const y of later) {
        await tx.enrollment.create({
          data: {
            schoolId: auth.schoolId,
            studentId: student.id,
            academicYearId: y.academicYearId,
            divisionId: y.divisionId,
            startedOn: dateOnly(y.startedOn),
            endedOn: y.endedOn ? dateOnly(y.endedOn) : null,
          },
        });
      }
      if (e.leftOn) {
        await tx.student.update({
          where: { id: student.id },
          data: { status: 'LEFT', leftOn: dateOnly(e.leftOn) },
        });
      }
      await tx.application.update({
        where: { id: app.id },
        data: { studentId: student.id, admittedAt: dateOnly(first.startedOn) },
      });
      return { applicationId: app.id, studentId: student.id };
    });

    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'admissions.imported',
      entityType: 'application',
      entityId: result.applicationId,
      metadata: { importBatchId: batchId, studentId: result.studentId },
    });
    if (result.studentId) {
      await this.audit.log({
        schoolId: auth.schoolId,
        actorUserId: auth.userId,
        action: 'students.created',
        entityType: 'student',
        entityId: result.studentId,
        metadata: { importBatchId: batchId },
      });
    }
    return result;
  }

  // ---------- helpers ----------

  /**
   * The next sequence number and form number for a year. One save at a time per school and year,
   * so two people saving together can never be given the same number; the lock is released when
   * the transaction ends. Unless a number was typed from the paper form, the sequence number is
   * used, skipping any that was already typed in by hand.
   */
  private async nextNumber(
    tx: Prisma.TransactionClient,
    schoolId: string,
    yearId: string,
    typed?: string,
  ) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`applications:${schoolId}:${yearId}`}))`;
    const last = await tx.application.aggregate({
      where: { schoolId, academicYearId: yearId },
      _max: { seq: true },
    });
    const seq = (last._max.seq ?? 0) + 1;
    let formNo = typed;
    if (!formNo) {
      let candidate = seq;
      while (
        await tx.application.findFirst({
          where: {
            schoolId,
            academicYearId: yearId,
            formNo: String(candidate),
          },
          select: { id: true },
        })
      ) {
        candidate++;
      }
      formNo = String(candidate);
    }
    return { seq, formNo };
  }

  private async currentYearId(schoolId: string): Promise<string | null> {
    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      select: { id: true },
    });
    return year?.id ?? null;
  }

  private async checkAnswers(
    schoolId: string,
    schema: FormSchema,
    raw: unknown,
  ) {
    const classes = await this.prisma.schoolClass.findMany({
      where: { schoolId },
      select: { id: true },
    });
    const fileIds = await this.files.existing(
      schoolId,
      'application-photo',
      photoIds(schema, raw),
    );
    const { answers, errors } = validateAnswers(schema, raw, {
      classIds: new Set(classes.map((c) => c.id)),
      fileIds,
    });
    if (Object.keys(errors).length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Some answers are not valid',
        errors,
      });
    }
    return answers;
  }

  /** Copies the values lists need out of the answers. */
  private derive(schema: FormSchema, answers: Record<string, unknown>) {
    const text = (key: Parameters<typeof systemValue>[2]) => {
      const v = systemValue(schema, answers, key);
      return typeof v === 'string' ? v : '';
    };
    const dob = text('student.dateOfBirth');
    const classId = text('student.class');
    return {
      studentName: [
        text('student.firstName'),
        text('student.fatherName'),
        text('student.surname'),
      ]
        .filter(Boolean)
        .join(' '),
      dateOfBirth: dob ? dateOnly(dob) : null,
      classId: classId || null,
    };
  }

  private async assertFormNoFree(
    schoolId: string,
    academicYearId: string,
    formNo: string,
  ) {
    const clash = await this.prisma.application.findFirst({
      where: { schoolId, academicYearId, formNo },
      select: { id: true },
    });
    if (clash)
      throw new ConflictException(
        `Form number ${formNo} is already used this year`,
      );
  }
}
