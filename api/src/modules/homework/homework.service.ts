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
import {
  addDays,
  isIsoDate,
  toDate,
  toIso,
  todayInIndia,
} from '../attendance/attendance-rules.js';
import { FilesService } from '../files/files.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  SUBMISSION_INCLUDE,
  fileView,
  submissionView,
  type SubmissionView,
} from './submission-view.js';
import {
  CreateHomeworkDto,
  ListHomeworkQueryDto,
  UpdateHomeworkDto,
} from './dto/homework.dto.js';

const ATTACHMENT_PURPOSE = 'homework-attachment';

const INCLUDE = {
  attachments: {
    include: {
      file: {
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
  createdBy: { select: { id: true, fullName: true } },
  subject: { select: { id: true, name: true } },
  targets: {
    include: {
      division: {
        select: {
          id: true,
          name: true,
          class: { select: { name: true } },
        },
      },
      student: {
        select: { id: true, firstName: true, surname: true },
      },
    },
  },
} satisfies Prisma.HomeworkInclude;
type Row = Prisma.HomeworkGetPayload<{ include: typeof INCLUDE }>;

interface Child {
  studentId: string;
  divisionId: string;
  name: string;
}

@Injectable()
export class HomeworkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly files: FilesService,
  ) {}

  private can = (auth: AuthContext, p: string) => auth.permissions.includes(p);

  async currentYear(schoolId: string) {
    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      select: { id: true },
    });
    if (!year) {
      throw new BadRequestException(
        'There is no current academic year. Set one in Academic setup.',
      );
    }
    return year.id;
  }

  /** Divisions the person teaches this year (class teacher or subject teacher). */
  async taught(auth: AuthContext, yearId: string): Promise<Set<string>> {
    const where = {
      schoolId: auth.schoolId,
      academicYearId: yearId,
      staff: { userId: auth.userId, status: 'ACTIVE' as const },
    };
    const [a, b] = await Promise.all([
      this.prisma.classTeacher.findMany({
        where,
        select: { divisionId: true },
      }),
      this.prisma.subjectTeacher.findMany({
        where,
        select: { divisionId: true },
      }),
    ]);
    return new Set([...a, ...b].map((r) => r.divisionId));
  }

  /** The signed-in person's children (or themselves, for a student) with their division this year. */
  async children(auth: AuthContext, yearId: string): Promise<Child[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: {
        schoolId: auth.schoolId,
        academicYearId: yearId,
        student: {
          status: 'ACTIVE',
          OR: [
            { userId: auth.userId },
            { guardians: { some: { guardian: { userId: auth.userId } } } },
          ],
        },
      },
      select: {
        divisionId: true,
        student: { select: { id: true, firstName: true, surname: true } },
      },
    });
    return rows.map((r) => ({
      studentId: r.student.id,
      divisionId: r.divisionId,
      name: `${r.student.firstName} ${r.student.surname}`,
    }));
  }

  /** What this person may see: their own, everything for an administrator, and what is set for their children. */
  async visible(
    auth: AuthContext,
    yearId: string,
    kids: Child[],
  ): Promise<Prisma.HomeworkWhereInput> {
    const base = { schoolId: auth.schoolId, archivedAt: null };
    if (this.can(auth, 'homework.manage_all')) return base;
    const or: Prisma.HomeworkWhereInput[] = [];
    if (this.can(auth, 'homework.manage'))
      or.push({ createdById: auth.userId });
    if (this.can(auth, 'homework.read') && kids.length) {
      or.push({
        academicYearId: yearId,
        targets: {
          some: {
            OR: [
              { divisionId: { in: kids.map((k) => k.divisionId) } },
              { studentId: { in: kids.map((k) => k.studentId) } },
            ],
          },
        },
      });
    }
    // Someone with neither right sees nothing at all.
    return or.length ? { ...base, OR: or } : { ...base, id: { in: [] } };
  }

  async audiences(auth: AuthContext) {
    const yearId = await this.currentYear(auth.schoolId);
    const mine = this.can(auth, 'homework.manage_all')
      ? null
      : await this.taught(auth, yearId);
    const divisions = await this.prisma.division.findMany({
      where: {
        schoolId: auth.schoolId,
        ...(mine ? { id: { in: [...mine] } } : {}),
      },
      select: {
        id: true,
        name: true,
        class: { select: { id: true, name: true, sortOrder: true } },
      },
    });
    divisions.sort(
      (a, b) =>
        a.class.sortOrder - b.class.sortOrder || a.name.localeCompare(b.name),
    );
    return {
      divisions: divisions.map((d) => ({
        id: d.id,
        classId: d.class.id,
        label: `${d.class.name}-${d.name}`,
      })),
    };
  }

  async create(auth: AuthContext, dto: CreateHomeworkDto, ip?: string) {
    const divisionIds = [...new Set(dto.divisionIds ?? [])];
    const studentIds = [...new Set(dto.studentIds ?? [])];
    if (divisionIds.length + studentIds.length === 0) {
      throw new BadRequestException(
        'Choose who it is for: one or more divisions, or individual students',
      );
    }
    if (dto.dueOn && !isIsoDate(dto.dueOn)) {
      throw new BadRequestException('The due day is not a real date');
    }
    if (dto.dueOn && dto.dueOn < todayInIndia()) {
      throw new BadRequestException('The due day cannot be in the past');
    }
    const yearId = await this.currentYear(auth.schoolId);

    const divisions = divisionIds.length
      ? await this.prisma.division.count({
          where: { schoolId: auth.schoolId, id: { in: divisionIds } },
        })
      : 0;
    if (divisions !== divisionIds.length) {
      throw new BadRequestException('A chosen division does not exist');
    }
    const enrolled = studentIds.length
      ? await this.prisma.enrollment.findMany({
          where: {
            schoolId: auth.schoolId,
            academicYearId: yearId,
            studentId: { in: studentIds },
            student: { status: 'ACTIVE' },
          },
          select: { studentId: true, divisionId: true },
        })
      : [];
    if (enrolled.length !== studentIds.length) {
      throw new BadRequestException(
        'A chosen student is not a current student this year',
      );
    }
    // A teacher sets homework only for the divisions they teach, and for students in them.
    if (!this.can(auth, 'homework.manage_all')) {
      const mine = await this.taught(auth, yearId);
      if (
        divisionIds.some((d) => !mine.has(d)) ||
        enrolled.some((e) => !mine.has(e.divisionId))
      ) {
        throw new ForbiddenException(
          'You can set homework only for the divisions you teach',
        );
      }
    }
    if (dto.subjectId) {
      const s = await this.prisma.subject.count({
        where: { id: dto.subjectId, schoolId: auth.schoolId },
      });
      if (!s) throw new BadRequestException('That subject does not exist');
    }

    const attachmentIds = await this.checkAttachments(
      auth,
      dto.attachmentFileIds,
    );
    if (dto.maxMarks !== undefined && !dto.handIn) {
      throw new BadRequestException(
        'Marks can be given only when students hand work in',
      );
    }

    const created = await this.prisma.homework.create({
      data: {
        handIn: dto.handIn ?? false,
        maxMarks: dto.maxMarks ?? null,
        attachments: {
          create: attachmentIds.map((fileId) => ({ fileId })),
        },
        schoolId: auth.schoolId,
        academicYearId: yearId,
        title: dto.title,
        instructions: dto.instructions,
        subjectId: dto.subjectId ?? null,
        dueOn: dto.dueOn ? toDate(dto.dueOn) : null,
        createdById: auth.userId,
        targets: {
          create: [
            ...divisionIds.map((divisionId) => ({ divisionId })),
            ...studentIds.map((studentId) => ({ studentId })),
          ],
        },
      },
      include: INCLUDE,
    });
    await this.record(auth, 'homework.created', created.id, ip, {
      divisions: divisionIds.length,
      students: studentIds.length,
    });
    await this.tellFamilies(
      auth.schoolId,
      yearId,
      created,
      divisionIds,
      studentIds,
    );
    return this.view(auth, created, [], new Map());
  }

  /** For each student the homework reaches: the logins to tell (parents and the student). */
  private async recipients(
    schoolId: string,
    yearId: string,
    divisionIds: string[],
    studentIds: string[],
  ): Promise<Map<string, string[]>> {
    const fromDivisions = divisionIds.length
      ? await this.prisma.enrollment.findMany({
          where: {
            schoolId,
            academicYearId: yearId,
            divisionId: { in: divisionIds },
            student: { status: 'ACTIVE' },
          },
          select: { studentId: true },
        })
      : [];
    const ids = [
      ...new Set([...studentIds, ...fromDivisions.map((e) => e.studentId)]),
    ];
    if (ids.length === 0) return new Map();
    const students = await this.prisma.student.findMany({
      where: { id: { in: ids }, status: 'ACTIVE' },
      select: {
        id: true,
        userId: true,
        guardians: { select: { guardian: { select: { userId: true } } } },
      },
    });
    return new Map(
      students.map((st) => [
        st.id,
        [st.userId, ...st.guardians.map((g) => g.guardian.userId)].filter(
          (u): u is string => !!u,
        ),
      ]),
    );
  }

  /** Tells the parents and the students themselves, in the app. */
  private async tellFamilies(
    schoolId: string,
    yearId: string,
    h: Row,
    divisionIds: string[],
    studentIds: string[],
  ) {
    const map = await this.recipients(
      schoolId,
      yearId,
      divisionIds,
      studentIds,
    );
    await this.notifications.notify(schoolId, [...map.values()].flat(), {
      type: 'homework.assigned',
      title: `New homework: ${h.title}${h.subject ? ` (${h.subject.name})` : ''}`,
      body: h.dueOn ? `Due ${toIso(h.dueOn)}` : undefined,
      link: '/portal/homework',
    });
  }

  /**
   * The "due tomorrow" reminder. Run once a day (npm run homework:remind). Each homework is reminded
   * once; when students hand work in, only the ones who have not done so are reminded.
   */
  async sendDueReminders(now: Date = new Date()): Promise<number> {
    const tomorrow = addDays(todayInIndia(now), 1);
    const due = await this.prisma.homework.findMany({
      where: {
        dueOn: toDate(tomorrow),
        archivedAt: null,
        reminderSentAt: null,
      },
      include: { ...INCLUDE, submissions: { select: { studentId: true } } },
    });
    for (const h of due) {
      // Claim it first, so two runs at once cannot both send.
      const claimed = await this.prisma.homework.updateMany({
        where: { id: h.id, reminderSentAt: null },
        data: { reminderSentAt: new Date() },
      });
      if (claimed.count === 0) continue;
      const map = await this.recipients(
        h.schoolId,
        h.academicYearId,
        h.targets.flatMap((t) => (t.divisionId ? [t.divisionId] : [])),
        h.targets.flatMap((t) => (t.studentId ? [t.studentId] : [])),
      );
      const done = new Set(h.submissions.map((x) => x.studentId));
      const users = [...map.entries()]
        .filter(([studentId]) => !h.handIn || !done.has(studentId))
        .flatMap(([, u]) => u);
      await this.notifications.notify(h.schoolId, users, {
        type: 'homework.due_tomorrow',
        title: `Due tomorrow: ${h.title}${h.subject ? ` (${h.subject.name})` : ''}`,
        body: h.handIn ? 'Not handed in yet' : undefined,
        link: '/portal/homework',
      });
    }
    return due.length;
  }

  /** The hand-ins of these children for these homeworks, keyed "homeworkId:studentId". */
  private async submissionsFor(
    homeworkIds: string[],
    kids: Child[],
    dueByHomework: Map<string, Date | null>,
  ): Promise<Map<string, SubmissionView>> {
    if (homeworkIds.length === 0 || kids.length === 0) return new Map();
    const rows = await this.prisma.homeworkSubmission.findMany({
      where: {
        homeworkId: { in: homeworkIds },
        studentId: { in: kids.map((k) => k.studentId) },
      },
      include: SUBMISSION_INCLUDE,
    });
    return new Map(
      rows.map((r) => [
        `${r.homeworkId}:${r.studentId}`,
        submissionView(r, dueByHomework.get(r.homeworkId) ?? null),
      ]),
    );
  }

  /** Checks that these are the caller's own uploads for homework attachments. */
  private async checkAttachments(auth: AuthContext, ids?: string[]) {
    const unique = [...new Set(ids ?? [])];
    const own = await this.files.ownUploads(
      auth.schoolId,
      auth.userId,
      ATTACHMENT_PURPOSE,
      unique,
    );
    if (own.size !== unique.length) {
      throw new BadRequestException('An attached file is not valid');
    }
    // A file can be attached only once.
    const taken = unique.length
      ? await this.prisma.homeworkAttachment.count({
          where: { fileId: { in: unique } },
        })
      : 0;
    if (taken > 0)
      throw new BadRequestException('An attached file is already in use');
    return unique;
  }

  async list(
    auth: AuthContext,
    q: ListHomeworkQueryDto,
  ): Promise<Page<ReturnType<HomeworkService['view']>>> {
    const yearId = await this.currentYear(auth.schoolId);
    const kids = await this.children(auth, yearId);
    const today = toDate(todayInIndia());
    const where: Prisma.HomeworkWhereInput = {
      AND: [
        await this.visible(auth, yearId, kids),
        { academicYearId: yearId },
        (q.status ?? 'open') === 'open'
          ? { OR: [{ dueOn: null }, { dueOn: { gte: today } }] }
          : {},
        q.subjectId ? { subjectId: q.subjectId } : {},
        q.divisionId ? { targets: { some: { divisionId: q.divisionId } } } : {},
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.homework.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.homework.count({ where }),
    ]);
    const subs = await this.submissionsFor(
      rows.map((r) => r.id),
      kids,
      new Map(rows.map((r) => [r.id, r.dueOn])),
    );
    return {
      items: rows.map((r) => this.view(auth, r, kids, subs)),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async one(auth: AuthContext, id: string) {
    const yearId = await this.currentYear(auth.schoolId);
    const kids = await this.children(auth, yearId);
    const row = await this.prisma.homework.findFirst({
      where: { AND: [{ id }, await this.visible(auth, yearId, kids)] },
      include: INCLUDE,
    });
    if (!row) throw new NotFoundException('Homework not found');
    const subs = await this.submissionsFor(
      [row.id],
      kids,
      new Map([[row.id, row.dueOn]]),
    );
    return this.view(auth, row, kids, subs);
  }

  async update(
    auth: AuthContext,
    id: string,
    dto: UpdateHomeworkDto,
    ip?: string,
  ) {
    const row = await this.mayChange(auth, id);
    if (dto.dueOn && !isIsoDate(dto.dueOn)) {
      throw new BadRequestException('The due day is not a real date');
    }
    if (dto.subjectId) {
      const s = await this.prisma.subject.count({
        where: { id: dto.subjectId, schoolId: auth.schoolId },
      });
      if (!s) throw new BadRequestException('That subject does not exist');
    }
    const current = await this.prisma.homework.findUniqueOrThrow({
      where: { id },
      select: {
        handIn: true,
        maxMarks: true,
        attachments: { select: { id: true, fileId: true } },
      },
    });
    const marked = await this.prisma.homeworkSubmission.count({
      where: { homeworkId: id, marks: { not: null } },
    });
    const sameMax =
      dto.maxMarks !== undefined &&
      current.maxMarks !== null &&
      Number(current.maxMarks) === dto.maxMarks;
    if (dto.maxMarks !== undefined && !sameMax && marked > 0) {
      throw new BadRequestException(
        'Marks have already been given, so the maximum cannot change',
      );
    }
    if (
      dto.handIn === false &&
      (await this.prisma.homeworkSubmission.count({
        where: { homeworkId: id },
      })) > 0
    ) {
      throw new BadRequestException(
        'Students have already handed work in, so hand-in cannot be switched off',
      );
    }
    if (dto.maxMarks !== undefined && !(dto.handIn ?? current.handIn)) {
      throw new BadRequestException(
        'Marks can be given only when students hand work in',
      );
    }
    // The attachment list, when sent, is the full new list.
    let removedFiles: string[] = [];
    if (dto.attachmentFileIds !== undefined) {
      const keep = new Set(dto.attachmentFileIds);
      const existing = new Set(current.attachments.map((a) => a.fileId));
      const added = await this.checkAttachments(
        auth,
        [...keep].filter((f) => !existing.has(f)),
      );
      removedFiles = current.attachments
        .filter((a) => !keep.has(a.fileId))
        .map((a) => a.fileId);
      if (existing.size - removedFiles.length + added.length > 5) {
        throw new BadRequestException('At most 5 files can be attached');
      }
      await this.prisma.$transaction([
        this.prisma.homeworkAttachment.deleteMany({
          where: { homeworkId: id, fileId: { in: removedFiles } },
        }),
        this.prisma.homeworkAttachment.createMany({
          data: added.map((fileId) => ({ homeworkId: id, fileId })),
        }),
      ]);
      for (const f of removedFiles) await this.files.remove(auth.schoolId, f);
    }
    await this.prisma.homework.update({
      where: { id: row.id },
      data: {
        ...(dto.handIn !== undefined ? { handIn: dto.handIn } : {}),
        ...(dto.maxMarks !== undefined ? { maxMarks: dto.maxMarks } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.instructions !== undefined
          ? { instructions: dto.instructions }
          : {}),
        ...(dto.subjectId !== undefined ? { subjectId: dto.subjectId } : {}),
        ...(dto.dueOn !== undefined
          ? { dueOn: dto.dueOn ? toDate(dto.dueOn) : null }
          : {}),
      },
    });
    await this.record(auth, 'homework.updated', id, ip, {
      fields: Object.keys(dto).join(','),
    });
    return this.one(auth, id);
  }

  /** Takes homework down. It is kept, never deleted. */
  async archive(auth: AuthContext, id: string, ip?: string) {
    await this.mayChange(auth, id);
    await this.prisma.homework.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    await this.record(auth, 'homework.archived', id, ip);
  }

  /** The author or an administrator; someone who cannot even see it gets "not found". */
  async mayChange(auth: AuthContext, id: string) {
    const row = await this.prisma.homework.findFirst({
      where: { id, schoolId: auth.schoolId, archivedAt: null },
      select: { id: true, createdById: true },
    });
    if (!row) throw new NotFoundException('Homework not found');
    if (
      row.createdById !== auth.userId &&
      !this.can(auth, 'homework.manage_all')
    ) {
      await this.one(auth, id); // 404 when they cannot see it either
      throw new ForbiddenException(
        'Only the author or an administrator can change homework',
      );
    }
    return row;
  }

  private view(
    auth: AuthContext,
    r: Row,
    kids: Child[],
    subs: Map<string, SubmissionView>,
  ) {
    const divisionIds = new Set(
      r.targets.flatMap((t) => (t.divisionId ? [t.divisionId] : [])),
    );
    const studentIds = new Set(
      r.targets.flatMap((t) => (t.studentId ? [t.studentId] : [])),
    );
    const today = todayInIndia();
    const due = r.dueOn ? toIso(r.dueOn) : null;
    return {
      id: r.id,
      title: r.title,
      instructions: r.instructions,
      subject: r.subject,
      dueOn: due,
      overdue: due !== null && due < today,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
      divisions: r.targets.flatMap((t) =>
        t.division
          ? [
              {
                id: t.division.id,
                label: `${t.division.class.name}-${t.division.name}`,
              },
            ]
          : [],
      ),
      students: r.targets.flatMap((t) =>
        t.student
          ? [
              {
                id: t.student.id,
                name: `${t.student.firstName} ${t.student.surname}`,
              },
            ]
          : [],
      ),
      handIn: r.handIn,
      maxMarks: r.maxMarks === null ? null : r.maxMarks.toString(),
      attachments: r.attachments.map((a) => fileView(a.file)),
      /** For a parent or student: each of their children it is for, with the hand-in so far. */
      children: kids
        .filter(
          (k) => divisionIds.has(k.divisionId) || studentIds.has(k.studentId),
        )
        .map((k) => ({
          studentId: k.studentId,
          name: k.name,
          submission: subs.get(`${r.id}:${k.studentId}`) ?? null,
        })),
      /** For a parent or student: which of their children this is for. */
      forChildren: kids
        .filter(
          (k) => divisionIds.has(k.divisionId) || studentIds.has(k.studentId),
        )
        .map((k) => k.name),
      canChange:
        r.createdById === auth.userId || this.can(auth, 'homework.manage_all'),
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
      entityType: 'homework',
      entityId,
      metadata,
      ip,
    });
  }
}
