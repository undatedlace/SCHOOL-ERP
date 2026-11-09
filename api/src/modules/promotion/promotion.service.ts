import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { suggestion } from './promotion-rules.js';
import {
  PlanQueryDto,
  PromotionAction,
  RunPromotionDto,
  YearsQueryDto,
} from './dto/promotion.dto.js';

const label = (d: { name: string; class: { name: string } }) =>
  `${d.class.name}-${d.name}`;

@Injectable()
export class PromotionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- helpers ----------

  /** The two years, checked: both exist and the new one comes later. */
  private async years(schoolId: string, q: YearsQueryDto) {
    const [from, to] = await Promise.all([
      this.prisma.academicYear.findFirst({
        where: { id: q.fromAcademicYearId, schoolId },
      }),
      this.prisma.academicYear.findFirst({
        where: { id: q.toAcademicYearId, schoolId },
      }),
    ]);
    if (!from || !to) throw new NotFoundException('Academic year not found');
    if (to.startDate <= from.startDate) {
      throw new BadRequestException(
        'The year students move into must start after the year they move from',
      );
    }
    return { from, to };
  }

  private async division(schoolId: string, id: string) {
    const d = await this.prisma.division.findFirst({
      where: { id, schoolId },
      include: { class: true },
    });
    if (!d) throw new NotFoundException('Division not found');
    return d;
  }

  /** Students of a division in the old year, and which of them are already dealt with. */
  private async roster(
    schoolId: string,
    fromYearId: string,
    toYearId: string,
    divisionId: string,
  ) {
    const [enrolled, inNewYear] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { schoolId, academicYearId: fromYearId, divisionId },
        include: { student: true },
      }),
      this.prisma.enrollment.findMany({
        where: { schoolId, academicYearId: toYearId },
        select: { studentId: true },
      }),
    ]);
    const moved = new Set(inNewYear.map((e) => e.studentId));
    return enrolled
      .map((e) => ({
        studentId: e.student.id,
        admissionNo: e.student.admissionNo,
        name: `${e.student.firstName} ${e.student.surname}`,
        rollNo: e.rollNo,
        left: e.student.status === 'LEFT',
        moved: moved.has(e.student.id),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The class one step above, by list order; null for the last class. */
  private async nextClass(schoolId: string, sortOrder: number) {
    return this.prisma.schoolClass.findFirst({
      where: { schoolId, sortOrder: { gt: sortOrder } },
      orderBy: { sortOrder: 'asc' },
      include: { divisions: { orderBy: { name: 'asc' } } },
    });
  }

  // ---------- progress ----------

  /** For every division: how many students it had, and how many are dealt with. */
  async status(auth: AuthContext, q: YearsQueryDto) {
    const { from, to } = await this.years(auth.schoolId, q);
    const divisions = await this.prisma.division.findMany({
      where: { schoolId: auth.schoolId },
      include: { class: true },
    });
    const rows = await Promise.all(
      divisions.map(async (d) => {
        const roster = await this.roster(auth.schoolId, from.id, to.id, d.id);
        const total = roster.length;
        const done = roster.filter((s) => s.moved || s.left).length;
        return { d, total, done };
      }),
    );
    return {
      from: { id: from.id, name: from.name },
      to: { id: to.id, name: to.name },
      divisions: rows
        .filter((r) => r.total > 0)
        .sort(
          (a, b) =>
            a.d.class.sortOrder - b.d.class.sortOrder ||
            a.d.name.localeCompare(b.d.name),
        )
        .map(({ d, total, done }) => ({
          id: d.id,
          name: d.name,
          class: { id: d.class.id, name: d.class.name },
          total,
          done,
          remaining: total - done,
        })),
    };
  }

  // ---------- the plan for one division ----------

  /** The students still to be dealt with, with a suggested action for each. */
  async plan(auth: AuthContext, q: PlanQueryDto) {
    const { from, to } = await this.years(auth.schoolId, q);
    const division = await this.division(auth.schoolId, q.divisionId);
    const [roster, next, sameClass] = await Promise.all([
      this.roster(auth.schoolId, from.id, to.id, division.id),
      this.nextClass(auth.schoolId, division.class.sortOrder),
      this.prisma.division.findMany({
        where: { schoolId: auth.schoolId, classId: division.classId },
        orderBy: { name: 'asc' },
      }),
    ]);
    return {
      from: { id: from.id, name: from.name },
      to: { id: to.id, name: to.name },
      division: {
        id: division.id,
        name: division.name,
        class: { id: division.class.id, name: division.class.name },
      },
      nextClass: next
        ? {
            id: next.id,
            name: next.name,
            divisions: next.divisions.map((d) => ({ id: d.id, name: d.name })),
          }
        : null,
      sameClassDivisions: sameClass.map((d) => ({ id: d.id, name: d.name })),
      students: roster
        .filter((s) => !s.moved && !s.left)
        .map((s) => ({
          studentId: s.studentId,
          admissionNo: s.admissionNo,
          name: s.name,
          rollNo: s.rollNo,
          suggested: suggestion(next, division.name),
        })),
      alreadyDone: roster.filter((s) => s.moved || s.left).length,
    };
  }

  // ---------- doing it ----------

  /**
   * Moves students into the new year in one transaction (all or nothing). Old enrolments are
   * kept and closed on the last day of the old year; new ones are added. Running it again for
   * students already moved skips them, so nothing is ever doubled.
   */
  async run(auth: AuthContext, dto: RunPromotionDto, ip?: string) {
    const { from, to } = await this.years(auth.schoolId, dto);
    const division = await this.division(auth.schoolId, dto.divisionId);

    const ids = dto.entries.map((e) => e.studentId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('A student appears more than once');
    }
    const roster = await this.roster(
      auth.schoolId,
      from.id,
      to.id,
      division.id,
    );
    const inDivision = new Map(roster.map((s) => [s.studentId, s]));
    if (ids.some((id) => !inDivision.has(id))) {
      throw new BadRequestException(
        `Some students were not in ${label(division)} in ${from.name}`,
      );
    }

    // Every chosen division must exist and suit the action.
    const targetIds = [
      ...new Set(
        dto.entries.flatMap((e) => (e.divisionId ? [e.divisionId] : [])),
      ),
    ];
    const targets = await this.prisma.division.findMany({
      where: { schoolId: auth.schoolId, id: { in: targetIds } },
      include: { class: true },
    });
    const target = new Map(targets.map((d) => [d.id, d]));
    for (const e of dto.entries) {
      if (e.action === PromotionAction.LEFT) continue;
      const t = e.divisionId ? target.get(e.divisionId) : undefined;
      if (!t) {
        throw new BadRequestException(
          'Choose the division each promoted or repeating student goes to',
        );
      }
      if (
        e.action === PromotionAction.PROMOTE &&
        t.class.sortOrder <= division.class.sortOrder
      ) {
        throw new BadRequestException(
          `${label(t)} is not a higher class than ${label(division)}. Choose "Stays in class" to repeat a year.`,
        );
      }
      if (
        e.action === PromotionAction.REPEAT &&
        t.classId !== division.classId
      ) {
        throw new BadRequestException(
          `A student who repeats stays in ${division.class.name}`,
        );
      }
    }

    const result = {
      promoted: 0,
      repeated: 0,
      left: 0,
      skipped: [] as { studentId: string; name: string; reason: string }[],
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`promotion:${auth.schoolId}:${to.id}`}))`;
      for (const e of dto.entries) {
        const s = inDivision.get(e.studentId)!;
        const skip = (reason: string) =>
          result.skipped.push({ studentId: s.studentId, name: s.name, reason });
        // Looked at again inside the lock, so two people promoting at once cannot double up.
        const already = await tx.enrollment.findFirst({
          where: {
            studentId: s.studentId,
            academicYearId: to.id,
          },
          select: { id: true },
        });
        if (already) {
          skip(`Already in ${to.name}`);
          continue;
        }
        const student = await tx.student.findUniqueOrThrow({
          where: { id: s.studentId },
          select: { status: true, userId: true },
        });
        if (student.status === 'LEFT') {
          skip('Has left the school');
          continue;
        }

        // Close the old enrolment on the last day of the old year.
        await tx.enrollment.updateMany({
          where: {
            studentId: s.studentId,
            academicYearId: from.id,
            endedOn: null,
          },
          data: { endedOn: from.endDate },
        });

        if (e.action === PromotionAction.LEFT) {
          await tx.student.update({
            where: { id: s.studentId },
            data: { status: 'LEFT', leftOn: from.endDate },
          });
          if (student.userId) {
            await tx.user.update({
              where: { id: student.userId },
              data: { status: 'DISABLED' },
            });
            await tx.session.deleteMany({ where: { userId: student.userId } });
          }
          result.left++;
          continue;
        }
        await tx.enrollment.create({
          data: {
            schoolId: auth.schoolId,
            studentId: s.studentId,
            academicYearId: to.id,
            divisionId: e.divisionId!,
            startedOn: to.startDate,
          },
        });
        if (e.action === PromotionAction.PROMOTE) result.promoted++;
        else result.repeated++;
      }
    });

    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'students.promoted',
      entityType: 'division',
      entityId: division.id,
      metadata: {
        from: from.name,
        to: to.name,
        promoted: result.promoted,
        repeated: result.repeated,
        left: result.left,
        skipped: result.skipped.length,
      },
      ip,
    });
    return result;
  }
}
