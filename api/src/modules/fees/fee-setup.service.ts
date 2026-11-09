import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { dateOnly } from '../../common/dates.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import {
  CopyStructuresDto,
  CreateFeeHeadDto,
  SaveStructureDto,
  UpdateFeeHeadDto,
} from './dto/fees.dto.js';
import { shiftYears } from './fee-dates.js';
import { LedgerError, money2, toPaise } from './ledger.js';

/** Fee heads (kinds of charge) and fee structures (what each class pays, and when). */
@Injectable()
export class FeeSetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- fee heads ----------

  listHeads(schoolId: string) {
    return this.prisma.feeHead.findMany({
      where: { schoolId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, isActive: true, sortOrder: true },
    });
  }

  async createHead(auth: AuthContext, dto: CreateFeeHeadDto, ip?: string) {
    try {
      const head = await this.prisma.feeHead.create({
        data: {
          schoolId: auth.schoolId,
          name: dto.name,
          sortOrder: dto.sortOrder ?? 0,
        },
        select: { id: true, name: true, isActive: true, sortOrder: true },
      });
      await this.audit.log({
        schoolId: auth.schoolId,
        actorUserId: auth.userId,
        action: 'fees.head_created',
        entityType: 'fee_head',
        entityId: head.id,
        ip,
      });
      return head;
    } catch (error) {
      throw this.nameTaken(error);
    }
  }

  async updateHead(
    auth: AuthContext,
    id: string,
    dto: UpdateFeeHeadDto,
    ip?: string,
  ) {
    const found = await this.prisma.feeHead.findFirst({
      where: { id, schoolId: auth.schoolId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Fee head not found');
    try {
      const head = await this.prisma.feeHead.update({
        where: { id },
        data: dto,
        select: { id: true, name: true, isActive: true, sortOrder: true },
      });
      await this.audit.log({
        schoolId: auth.schoolId,
        actorUserId: auth.userId,
        action: 'fees.head_updated',
        entityType: 'fee_head',
        entityId: id,
        metadata: { fields: Object.keys(dto).join(',') },
        ip,
      });
      return head;
    } catch (error) {
      throw this.nameTaken(error);
    }
  }

  // ---------- fee structures ----------

  async listStructures(schoolId: string, academicYearId?: string) {
    const rows = await this.prisma.feeStructure.findMany({
      where: { schoolId, ...(academicYearId ? { academicYearId } : {}) },
      include: {
        class: { select: { id: true, name: true, sortOrder: true } },
        academicYear: { select: { id: true, name: true } },
        items: { include: { feeHead: { select: { id: true, name: true } } } },
        instalments: { orderBy: { seq: 'asc' } },
        _count: { select: { invoices: true } },
      },
    });
    return rows
      .sort((a, b) => a.class.sortOrder - b.class.sortOrder)
      .map((s) => ({
        id: s.id,
        academicYear: s.academicYear,
        class: { id: s.class.id, name: s.class.name },
        total: sumItems(s.items.map((i) => i.amount.toString())),
        items: s.items
          .sort((a, b) => a.feeHead.name.localeCompare(b.feeHead.name))
          .map((i) => ({
            feeHeadId: i.feeHead.id,
            feeHead: i.feeHead.name,
            amount: money2(i.amount),
          })),
        instalments: s.instalments.map((i) => ({
          seq: i.seq,
          label: i.label,
          dueDate: i.dueDate,
          percent: i.percentBp / 100,
        })),
        invoices: s._count.invoices,
      }));
  }

  /** Creates or replaces the structure for one class in one year. Invoices already made are not touched. */
  async saveStructure(auth: AuthContext, dto: SaveStructureDto, ip?: string) {
    const [year, cls] = await Promise.all([
      this.prisma.academicYear.findFirst({
        where: { id: dto.academicYearId, schoolId: auth.schoolId },
        select: { id: true },
      }),
      this.prisma.schoolClass.findFirst({
        where: { id: dto.classId, schoolId: auth.schoolId },
        select: { id: true },
      }),
    ]);
    if (!year) throw new BadRequestException('Unknown academic year');
    if (!cls) throw new BadRequestException('Unknown class');

    const headIds = dto.items.map((i) => i.feeHeadId);
    if (new Set(headIds).size !== headIds.length)
      throw new BadRequestException('A fee head is listed twice');
    const heads = await this.prisma.feeHead.findMany({
      where: { schoolId: auth.schoolId, id: { in: headIds } },
      select: { id: true, isActive: true },
    });
    if (heads.length !== headIds.length)
      throw new BadRequestException('Unknown fee head');
    const existing = await this.prisma.feeStructureItem.findMany({
      where: {
        structure: { academicYearId: dto.academicYearId, classId: dto.classId },
      },
      select: { feeHeadId: true },
    });
    const kept = new Set(existing.map((e) => e.feeHeadId));
    const retired = heads.filter((h) => !h.isActive && !kept.has(h.id));
    if (retired.length)
      throw new BadRequestException(
        'A fee head that is switched off cannot be added',
      );

    let total = 0;
    for (const item of dto.items) {
      try {
        const paise = toPaise(item.amount);
        if (paise <= 0)
          throw new LedgerError('Each amount must be more than zero');
        total += paise;
      } catch (error) {
        if (error instanceof LedgerError)
          throw new BadRequestException(error.message);
        throw error;
      }
    }

    const basisPoints = dto.instalments.map((i) => Math.round(i.percent * 100));
    if (basisPoints.reduce((a, b) => a + b, 0) !== 10000) {
      throw new BadRequestException(
        'The instalment shares must add up to 100%',
      );
    }
    const dates = dto.instalments.map((i) => i.dueDate.slice(0, 10));
    if (dates.some((d, i) => i > 0 && d < dates[i - 1])) {
      throw new BadRequestException('List the instalments in date order');
    }

    const structure = await this.prisma.$transaction(async (tx) => {
      const s = await tx.feeStructure.upsert({
        where: {
          academicYearId_classId: {
            academicYearId: dto.academicYearId,
            classId: dto.classId,
          },
        },
        create: {
          schoolId: auth.schoolId,
          academicYearId: dto.academicYearId,
          classId: dto.classId,
        },
        update: {},
      });
      await tx.feeStructureItem.deleteMany({ where: { structureId: s.id } });
      await tx.feeStructureInstalment.deleteMany({
        where: { structureId: s.id },
      });
      await tx.feeStructureItem.createMany({
        data: dto.items.map((i) => ({
          structureId: s.id,
          feeHeadId: i.feeHeadId,
          amount: i.amount,
        })),
      });
      await tx.feeStructureInstalment.createMany({
        data: dto.instalments.map((i, n) => ({
          structureId: s.id,
          seq: n + 1,
          label: i.label,
          dueDate: dateOnly(i.dueDate.slice(0, 10)),
          percentBp: basisPoints[n],
        })),
      });
      return s;
    });

    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'fees.structure_saved',
      entityType: 'fee_structure',
      entityId: structure.id,
      metadata: { total: String(total / 100) },
      ip,
    });
    return (await this.listStructures(auth.schoolId, dto.academicYearId)).find(
      (s) => s.id === structure.id,
    );
  }

  /**
   * Starts a new year from an old one: each class's fee structure is copied, and the due dates
   * move on by the number of years between the two. A class that already has a structure in the
   * new year is left as it is. Fee heads that have been switched off are not carried over.
   */
  async copyStructures(auth: AuthContext, dto: CopyStructuresDto, ip?: string) {
    if (dto.fromAcademicYearId === dto.toAcademicYearId) {
      throw new BadRequestException('Choose two different years');
    }
    const [from, to] = await Promise.all([
      this.prisma.academicYear.findFirst({
        where: { id: dto.fromAcademicYearId, schoolId: auth.schoolId },
      }),
      this.prisma.academicYear.findFirst({
        where: { id: dto.toAcademicYearId, schoolId: auth.schoolId },
      }),
    ]);
    if (!from || !to) throw new BadRequestException('Unknown academic year');
    const shift =
      to.startDate.getUTCFullYear() - from.startDate.getUTCFullYear();

    const [sources, targets] = await Promise.all([
      this.prisma.feeStructure.findMany({
        where: {
          schoolId: auth.schoolId,
          academicYearId: from.id,
          ...(dto.classIds ? { classId: { in: dto.classIds } } : {}),
        },
        include: {
          class: { select: { name: true, sortOrder: true } },
          items: { include: { feeHead: { select: { isActive: true } } } },
          instalments: { orderBy: { seq: 'asc' } },
        },
      }),
      this.prisma.feeStructure.findMany({
        where: { schoolId: auth.schoolId, academicYearId: to.id },
        select: { classId: true },
      }),
    ]);
    const has = new Set(targets.map((t) => t.classId));
    const copied: string[] = [];
    const skipped: { class: string; reason: string }[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const src of sources.sort(
        (a, b) => a.class.sortOrder - b.class.sortOrder,
      )) {
        if (has.has(src.classId)) {
          skipped.push({
            class: src.class.name,
            reason: `Already has fees for ${to.name}`,
          });
          continue;
        }
        const items = src.items.filter((i) => i.feeHead.isActive);
        if (items.length === 0) {
          skipped.push({
            class: src.class.name,
            reason: 'Every kind of fee in it has been switched off',
          });
          continue;
        }
        const created = await tx.feeStructure.create({
          data: {
            schoolId: auth.schoolId,
            academicYearId: to.id,
            classId: src.classId,
          },
        });
        await tx.feeStructureItem.createMany({
          data: items.map((i) => ({
            structureId: created.id,
            feeHeadId: i.feeHeadId,
            amount: i.amount,
          })),
        });
        await tx.feeStructureInstalment.createMany({
          data: src.instalments.map((i) => ({
            structureId: created.id,
            seq: i.seq,
            label: i.label,
            dueDate: dateOnly(shiftYears(i.dueDate.toISOString(), shift)),
            percentBp: i.percentBp,
          })),
        });
        copied.push(src.class.name);
      }
    });

    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'fees.structures_copied',
      entityType: 'academic_year',
      entityId: to.id,
      metadata: {
        from: from.name,
        to: to.name,
        copied: copied.length,
        skipped: skipped.length,
      },
      ip,
    });
    return { from: from.name, to: to.name, copied, skipped };
  }

  private nameTaken(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException('A fee head with that name already exists');
    }
    return error;
  }
}

const sumItems = (amounts: string[]) =>
  (amounts.reduce((a, b) => a + toPaise(b), 0) / 100).toFixed(2);
