import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { Page, skipTake } from '../../common/dto/page-query.dto.js';
import { dateOnly, todayIso } from '../../common/dates.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { ApplicationStatus } from '../../generated/prisma/enums.js';
import { AuditService } from '../audit/audit.service.js';
import {
  FormSchema,
  systemValue,
  validateAnswers,
} from '../forms/form-schema.js';
import { FormsService } from '../forms/forms.service.js';
import {
  CreateApplicationDto,
  Decision,
  DecisionDto,
  ListApplicationsQueryDto,
  UpdateApplicationDto,
} from './dto/admissions.dto.js';

const FORM_KEY = 'admission';

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
  appliedClass: { select: { id: true, name: true } },
  academicYear: { select: { id: true, name: true } },
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
  class: a.appliedClass,
  academicYear: a.academicYear,
});

@Injectable()
export class AdmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly forms: FormsService,
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
      allowedDecisions: TRANSITIONS[app.status],
      editable: EDITABLE.includes(app.status),
      createdAt: app.createdAt,
    };
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
        // One save at a time per school and year, so two people saving together
        // can never be given the same number. The lock is released when the
        // transaction ends.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`applications:${auth.schoolId}:${yearId}`}))`;

        const last = await tx.application.aggregate({
          where: { schoolId: auth.schoolId, academicYearId: yearId },
          _max: { seq: true },
        });
        const seq = (last._max.seq ?? 0) + 1;

        // Unless the office typed the number from the paper form, use the sequence
        // number, skipping any that was already typed in by hand.
        let formNo = dto.formNo;
        if (!formNo) {
          let candidate = seq;
          while (
            await tx.application.findFirst({
              where: {
                schoolId: auth.schoolId,
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
    await this.prisma.application.update({
      where: { id },
      data: {
        status: dto.decision,
        decidedAt: reopening ? null : new Date(),
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

  // ---------- helpers ----------

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
    const { answers, errors } = validateAnswers(schema, raw, {
      classIds: new Set(classes.map((c) => c.id)),
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
