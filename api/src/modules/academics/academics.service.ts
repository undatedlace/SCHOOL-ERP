import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { dateOnly } from '../../common/dates.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  CreateAcademicYearDto,
  CreateClassDto,
  CreateDivisionDto,
  CreateSubjectDto,
  UpdateAcademicYearDto,
  UpdateClassDto,
  UpdateDivisionDto,
  UpdateSubjectDto,
} from './dto/academics.dto.js';

/**
 * Academic setup: years, classes (standards), divisions and subjects.
 * Every query is scoped to the caller's school; ids from the client are only
 * ever matched together with school_id.
 */
@Injectable()
export class AcademicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Academic years ----------

  listYears(schoolId: string) {
    return this.prisma.academicYear.findMany({
      where: { schoolId },
      orderBy: { startDate: 'desc' },
    });
  }

  async createYear(auth: AuthContext, dto: CreateAcademicYearDto) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    this.assertValidRange(startDate, endDate);

    const year = await this.prisma.$transaction(async (tx) => {
      if (dto.isCurrent) {
        await tx.academicYear.updateMany({
          where: { schoolId: auth.schoolId },
          data: { isCurrent: false },
        });
      }
      return tx.academicYear.create({
        data: {
          schoolId: auth.schoolId,
          name: dto.name,
          startDate,
          endDate,
          isCurrent: dto.isCurrent ?? false,
          ageCutoffDate: dto.ageCutoffDate ? dateOnly(dto.ageCutoffDate) : null,
        },
      });
    });
    await this.record(auth, 'academic_year.created', 'academic_year', year.id);
    return year;
  }

  async updateYear(auth: AuthContext, id: string, dto: UpdateAcademicYearDto) {
    const existing = await this.prisma.academicYear.findFirst({
      where: { id, schoolId: auth.schoolId },
    });
    if (!existing) throw new NotFoundException('Academic year not found');

    const startDate = dto.startDate
      ? new Date(dto.startDate)
      : existing.startDate;
    const endDate = dto.endDate ? new Date(dto.endDate) : existing.endDate;
    this.assertValidRange(startDate, endDate);

    const year = await this.prisma.$transaction(async (tx) => {
      if (dto.isCurrent) {
        await tx.academicYear.updateMany({
          where: { schoolId: auth.schoolId, id: { not: id } },
          data: { isCurrent: false },
        });
      }
      return tx.academicYear.update({
        where: { id },
        data: {
          name: dto.name,
          startDate,
          endDate,
          isCurrent: dto.isCurrent,
          // undefined leaves it alone; null clears it.
          ageCutoffDate:
            dto.ageCutoffDate === undefined
              ? undefined
              : dto.ageCutoffDate === null
                ? null
                : dateOnly(dto.ageCutoffDate),
        },
      });
    });
    await this.record(auth, 'academic_year.updated', 'academic_year', id);
    return year;
  }

  /** Exactly one year is current per school; this switches it atomically. */
  async setCurrentYear(auth: AuthContext, id: string) {
    const existing = await this.prisma.academicYear.findFirst({
      where: { id, schoolId: auth.schoolId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Academic year not found');

    const [, year] = await this.prisma.$transaction([
      this.prisma.academicYear.updateMany({
        where: { schoolId: auth.schoolId },
        data: { isCurrent: false },
      }),
      this.prisma.academicYear.update({
        where: { id },
        data: { isCurrent: true },
      }),
    ]);
    await this.record(auth, 'academic_year.set_current', 'academic_year', id);
    return year;
  }

  // ---------- Classes ----------

  listClasses(schoolId: string) {
    return this.prisma.schoolClass.findMany({
      where: { schoolId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        divisions: {
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        },
      },
    });
  }

  async createClass(auth: AuthContext, dto: CreateClassDto) {
    let sortOrder = dto.sortOrder;
    if (sortOrder === undefined) {
      const last = await this.prisma.schoolClass.aggregate({
        where: { schoolId: auth.schoolId },
        _max: { sortOrder: true },
      });
      sortOrder = (last._max.sortOrder ?? 0) + 1;
    }
    const created = await this.prisma.schoolClass.create({
      data: {
        schoolId: auth.schoolId,
        name: dto.name,
        sortOrder,
        minAgeYears: dto.minAgeYears ?? null,
        admissionsOpen: dto.admissionsOpen ?? true,
      },
    });
    await this.record(auth, 'class.created', 'class', created.id);
    return created;
  }

  async updateClass(auth: AuthContext, id: string, dto: UpdateClassDto) {
    const updated = await this.prisma.schoolClass.update({
      where: { id, schoolId: auth.schoolId },
      data: dto,
    });
    await this.record(auth, 'class.updated', 'class', id);
    return updated;
  }

  async deleteClass(auth: AuthContext, id: string) {
    await this.prisma.schoolClass.delete({
      where: { id, schoolId: auth.schoolId },
    });
    await this.record(auth, 'class.deleted', 'class', id);
  }

  // ---------- Divisions ----------

  async createDivision(
    auth: AuthContext,
    classId: string,
    dto: CreateDivisionDto,
  ) {
    const cls = await this.prisma.schoolClass.findFirst({
      where: { id: classId, schoolId: auth.schoolId },
      select: { id: true },
    });
    if (!cls) throw new NotFoundException('Class not found');

    const created = await this.prisma.division.create({
      data: { schoolId: auth.schoolId, classId, name: dto.name },
    });
    await this.record(auth, 'division.created', 'division', created.id);
    return created;
  }

  async updateDivision(auth: AuthContext, id: string, dto: UpdateDivisionDto) {
    const updated = await this.prisma.division.update({
      where: { id, schoolId: auth.schoolId },
      data: { name: dto.name },
    });
    await this.record(auth, 'division.updated', 'division', id);
    return updated;
  }

  async deleteDivision(auth: AuthContext, id: string) {
    await this.prisma.division.delete({
      where: { id, schoolId: auth.schoolId },
    });
    await this.record(auth, 'division.deleted', 'division', id);
  }

  // ---------- Subjects ----------

  listSubjects(schoolId: string) {
    return this.prisma.subject.findMany({
      where: { schoolId },
      orderBy: { name: 'asc' },
    });
  }

  async createSubject(auth: AuthContext, dto: CreateSubjectDto) {
    const created = await this.prisma.subject.create({
      data: { schoolId: auth.schoolId, name: dto.name, code: dto.code },
    });
    await this.record(auth, 'subject.created', 'subject', created.id);
    return created;
  }

  async updateSubject(auth: AuthContext, id: string, dto: UpdateSubjectDto) {
    const updated = await this.prisma.subject.update({
      where: { id, schoolId: auth.schoolId },
      data: dto,
    });
    await this.record(auth, 'subject.updated', 'subject', id);
    return updated;
  }

  async deleteSubject(auth: AuthContext, id: string) {
    await this.prisma.subject.delete({
      where: { id, schoolId: auth.schoolId },
    });
    await this.record(auth, 'subject.deleted', 'subject', id);
  }

  // ---------- helpers ----------

  private assertValidRange(start: Date, end: Date) {
    if (end <= start)
      throw new BadRequestException('endDate must be after startDate');
  }

  private record(
    auth: AuthContext,
    action: string,
    entityType: string,
    entityId: string,
  ) {
    return this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action,
      entityType,
      entityId,
    });
  }
}
