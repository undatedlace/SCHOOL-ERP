import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { FilesService } from '../files/files.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { HomeworkService } from './homework.service.js';
import { ReviewHomeworkDto, SubmitHomeworkDto } from './dto/homework.dto.js';
import { SUBMISSION_INCLUDE, submissionView } from './submission-view.js';

const SUBMISSION_PURPOSE = 'homework-submission';
const ATTACHMENT_PURPOSE = 'homework-attachment';

/**
 * Students (or their parents) hand work in; the teacher who set it, or an administrator, marks it.
 * Every route here looks the homework up through the same visibility rules as the homework itself,
 * so something you may not see looks like it does not exist.
 */
@Injectable()
export class HomeworkSubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly homework: HomeworkService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** The homework, if the caller may see it; with its targets. */
  private async visibleHomework(auth: AuthContext, id: string) {
    const yearId = await this.homework.currentYear(auth.schoolId);
    const kids = await this.homework.children(auth, yearId);
    const row = await this.prisma.homework.findFirst({
      where: { AND: [{ id }, await this.homework.visible(auth, yearId, kids)] },
      include: { targets: true, createdBy: { select: { id: true } } },
    });
    if (!row) throw new NotFoundException('Homework not found');
    return { row, kids, yearId };
  }

  /** One of the caller's own children who this homework is for; otherwise "not found". */
  private async ownTarget(auth: AuthContext, id: string, studentId: string) {
    const { row, kids } = await this.visibleHomework(auth, id);
    const kid = kids.find((k) => k.studentId === studentId);
    const reaches =
      kid &&
      row.targets.some(
        (t) => t.studentId === kid.studentId || t.divisionId === kid.divisionId,
      );
    if (!kid || !reaches) throw new NotFoundException('Homework not found');
    return { row, kid };
  }

  async submit(
    auth: AuthContext,
    id: string,
    studentId: string,
    dto: SubmitHomeworkDto,
    ip?: string,
  ) {
    const { row, kid } = await this.ownTarget(auth, id, studentId);
    if (row.archivedAt) throw new NotFoundException('Homework not found');
    if (!row.handIn) {
      throw new BadRequestException(
        'This homework is not handed in through the app',
      );
    }
    const fileIds = [...new Set(dto.fileIds ?? [])];
    if (!dto.note && fileIds.length === 0) {
      throw new BadRequestException('Add a note or attach a file');
    }
    const existing = await this.prisma.homeworkSubmission.findUnique({
      where: { homeworkId_studentId: { homeworkId: id, studentId } },
      include: { files: true },
    });
    if (existing?.status === 'REVIEWED') {
      throw new BadRequestException(
        'This has been marked already. Ask the teacher if it should be done again',
      );
    }
    // Files already on this hand-in may stay (someone else in the family may have added them);
    // new ones must be the caller's own uploads.
    const kept = new Set(existing?.files.map((f) => f.fileId));
    const fresh = fileIds.filter((f) => !kept.has(f));
    const own = await this.files.ownUploads(
      auth.schoolId,
      auth.userId,
      SUBMISSION_PURPOSE,
      fresh,
    );
    if (own.size !== fresh.length) {
      throw new BadRequestException('An attached file is not valid');
    }
    // A file may belong to one hand-in only (the one being replaced may keep its own).
    const own2 = new Set(existing?.files.map((f) => f.fileId));
    const taken = fileIds.length
      ? await this.prisma.homeworkSubmissionFile.findMany({
          where: { fileId: { in: fileIds } },
          select: { fileId: true },
        })
      : [];
    if (taken.some((t) => !own2.has(t.fileId))) {
      throw new BadRequestException('An attached file is already in use');
    }

    const removed = (existing?.files ?? [])
      .map((f) => f.fileId)
      .filter((f) => !fileIds.includes(f));
    const saved = await this.prisma.$transaction(async (tx) => {
      const sub = await tx.homeworkSubmission.upsert({
        where: { homeworkId_studentId: { homeworkId: id, studentId } },
        create: {
          schoolId: auth.schoolId,
          homeworkId: id,
          studentId,
          submittedById: auth.userId,
          note: dto.note || null,
        },
        update: {
          submittedById: auth.userId,
          note: dto.note || null,
          submittedAt: new Date(),
          status: 'SUBMITTED',
          marks: null,
          feedback: null,
          reviewedById: null,
          reviewedAt: null,
        },
      });
      await tx.homeworkSubmissionFile.deleteMany({
        where: { submissionId: sub.id, fileId: { in: removed } },
      });
      const keep = new Set(existing?.files.map((f) => f.fileId));
      await tx.homeworkSubmissionFile.createMany({
        data: fileIds
          .filter((f) => !keep.has(f))
          .map((fileId) => ({ submissionId: sub.id, fileId })),
      });
      return tx.homeworkSubmission.findUniqueOrThrow({
        where: { id: sub.id },
        include: SUBMISSION_INCLUDE,
      });
    });
    for (const f of removed) await this.files.remove(auth.schoolId, f);

    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'homework.handed_in',
      entityType: 'homework',
      entityId: id,
      metadata: { studentId, files: fileIds.length },
      ip,
    });
    await this.notifications.notify(auth.schoolId, [row.createdById], {
      type: 'homework.handed_in',
      title: `${kid.name} handed in: ${row.title}`,
      link: `/app/homework`,
    });
    return submissionView(saved, row.dueOn);
  }

  /** The family takes a hand-in back, as long as it has not been marked. */
  async withdraw(
    auth: AuthContext,
    id: string,
    studentId: string,
    ip?: string,
  ) {
    const { row } = await this.ownTarget(auth, id, studentId);
    const sub = await this.prisma.homeworkSubmission.findUnique({
      where: { homeworkId_studentId: { homeworkId: id, studentId } },
      include: { files: true },
    });
    if (!sub) throw new NotFoundException('Nothing was handed in');
    if (sub.status === 'REVIEWED') {
      throw new BadRequestException(
        'This has been marked, so it cannot be taken back',
      );
    }
    await this.prisma.homeworkSubmission.delete({ where: { id: sub.id } });
    for (const f of sub.files) await this.files.remove(auth.schoolId, f.fileId);
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'homework.hand_in_withdrawn',
      entityType: 'homework',
      entityId: row.id,
      metadata: { studentId },
      ip,
    });
  }

  /** Everyone the homework reaches, with their hand-in. Only the author or an administrator. */
  async roster(auth: AuthContext, id: string) {
    await this.homework.mayChange(auth, id);
    const h = await this.prisma.homework.findUniqueOrThrow({
      where: { id },
      include: { targets: true },
    });
    const divisionIds = h.targets.flatMap((t) =>
      t.divisionId ? [t.divisionId] : [],
    );
    const studentIds = h.targets.flatMap((t) =>
      t.studentId ? [t.studentId] : [],
    );
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        schoolId: auth.schoolId,
        academicYearId: h.academicYearId,
        student: { status: 'ACTIVE' },
        OR: [
          ...(divisionIds.length ? [{ divisionId: { in: divisionIds } }] : []),
          ...(studentIds.length ? [{ studentId: { in: studentIds } }] : []),
        ],
      },
      select: {
        student: {
          select: {
            id: true,
            firstName: true,
            surname: true,
            admissionNo: true,
          },
        },
        division: { select: { name: true, class: { select: { name: true } } } },
      },
    });
    const subs = await this.prisma.homeworkSubmission.findMany({
      where: { homeworkId: id },
      include: SUBMISSION_INCLUDE,
    });
    const byStudent = new Map(
      subs.map((s) => [s.studentId, submissionView(s, h.dueOn)]),
    );
    const students = enrollments
      .map((e) => ({
        studentId: e.student.id,
        name: `${e.student.firstName} ${e.student.surname}`,
        admissionNo: e.student.admissionNo,
        division: `${e.division.class.name}-${e.division.name}`,
        submission: byStudent.get(e.student.id) ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      handIn: h.handIn,
      maxMarks: h.maxMarks === null ? null : h.maxMarks.toString(),
      counts: {
        students: students.length,
        handedIn: students.filter((s) => s.submission).length,
        marked: students.filter((s) => s.submission?.status === 'REVIEWED')
          .length,
      },
      students,
    };
  }

  async review(
    auth: AuthContext,
    id: string,
    studentId: string,
    dto: ReviewHomeworkDto,
    ip?: string,
  ) {
    await this.homework.mayChange(auth, id);
    const h = await this.prisma.homework.findUniqueOrThrow({ where: { id } });
    const sub = await this.prisma.homeworkSubmission.findUnique({
      where: { homeworkId_studentId: { homeworkId: id, studentId } },
    });
    if (!sub) throw new NotFoundException('Nothing was handed in');
    if (dto.marks !== undefined) {
      if (dto.status !== 'REVIEWED') {
        throw new BadRequestException(
          'Marks are given when the work is marked, not when it is sent back',
        );
      }
      if (h.maxMarks === null) {
        throw new BadRequestException('This homework has no marks');
      }
      if (dto.marks > Number(h.maxMarks)) {
        throw new BadRequestException(
          `Marks cannot be more than ${h.maxMarks.toString()}`,
        );
      }
    }
    if (dto.status === 'REDO' && !dto.feedback) {
      throw new BadRequestException('Say what should be done again');
    }
    const saved = await this.prisma.homeworkSubmission.update({
      where: { id: sub.id },
      data: {
        status: dto.status,
        marks: dto.status === 'REVIEWED' ? (dto.marks ?? null) : null,
        feedback: dto.feedback || null,
        reviewedById: auth.userId,
        reviewedAt: new Date(),
      },
      include: SUBMISSION_INCLUDE,
    });
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'homework.hand_in_reviewed',
      entityType: 'homework',
      entityId: id,
      metadata: { studentId, status: dto.status },
      ip,
    });
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        userId: true,
        guardians: { select: { guardian: { select: { userId: true } } } },
      },
    });
    await this.notifications.notify(
      auth.schoolId,
      [
        student?.userId,
        ...(student?.guardians.map((g) => g.guardian.userId) ?? []),
      ],
      {
        type: 'homework.reviewed',
        title:
          dto.status === 'REDO'
            ? `Please do again: ${h.title}`
            : `Marked: ${h.title}`,
        body: dto.feedback,
        link: '/portal/homework',
      },
    );
    return submissionView(saved, h.dueOn);
  }

  /**
   * A file of this homework: the teacher's attachment (anyone who may see the homework) or a
   * hand-in file (the teacher who set it, an administrator, or that student's own family).
   */
  async openFile(auth: AuthContext, id: string, fileId: string) {
    const { row, kids } = await this.visibleHomework(auth, id);
    const attachment = await this.prisma.homeworkAttachment.findFirst({
      where: { homeworkId: id, fileId },
    });
    if (attachment) {
      return this.files.openScoped(auth.schoolId, fileId, ATTACHMENT_PURPOSE);
    }
    const handIn = await this.prisma.homeworkSubmissionFile.findFirst({
      where: { fileId, submission: { homeworkId: id } },
      select: { submission: { select: { studentId: true } } },
    });
    if (!handIn) throw new NotFoundException('File not found');
    const staff =
      row.createdById === auth.userId ||
      auth.permissions.includes('homework.manage_all');
    const family = kids.some(
      (k) => k.studentId === handIn.submission.studentId,
    );
    if (!staff && !family) throw new NotFoundException('File not found');
    return this.files.openScoped(auth.schoolId, fileId, SUBMISSION_PURPOSE);
  }
}
