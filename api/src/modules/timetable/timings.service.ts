import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import {
  CreateScheduleDto,
  GenerateSlotsDto,
  ReplaceSlotsDto,
  SetClassSchedulesDto,
  UpdateScheduleDto,
} from './dto/timetable.dto.js';
import { TimetableData } from './timetable-data.js';
import {
  checkGenerateInput,
  generateSlots,
  validateSlots,
  WEEKDAY_NAMES,
} from './timetable-rules.js';

const SLOT_ORDER = [
  { sortOrder: 'asc' as const },
  { startsAt: 'asc' as const },
];

/** The school-day timings: named schedules, their rows, and which classes follow which. */
@Injectable()
export class TimingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly data: TimetableData,
  ) {}

  /** Every schedule of a year with its rows and classes, and every class with the schedule it follows. */
  async list(auth: AuthContext, academicYearId?: string) {
    const year = academicYearId
      ? await this.data.yearById(auth.schoolId, academicYearId)
      : await this.data.currentYear(auth.schoolId);
    const [schedules, classes] = await Promise.all([
      this.prisma.bellSchedule.findMany({
        where: { schoolId: auth.schoolId, academicYearId: year.id },
        include: {
          slots: { orderBy: SLOT_ORDER },
          classes: { select: { classId: true } },
        },
        orderBy: [
          { archivedAt: { sort: 'asc', nulls: 'first' } },
          { name: 'asc' },
        ],
      }),
      this.prisma.schoolClass.findMany({
        where: { schoolId: auth.schoolId },
        select: {
          id: true,
          name: true,
          bellSchedules: {
            where: { academicYearId: year.id },
            select: { scheduleId: true },
          },
        },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);
    return {
      academicYear: year,
      schedules: schedules.map((s) => ({
        id: s.id,
        name: s.name,
        active: s.archivedAt === null,
        slots: s.slots.map(slotView),
        classIds: s.classes.map((c) => c.classId),
      })),
      classes: classes.map((c) => ({
        id: c.id,
        name: c.name,
        scheduleId: c.bellSchedules[0]?.scheduleId ?? null,
      })),
    };
  }

  /** Works out a school day from a few numbers, without saving it. */
  preview(dto: GenerateSlotsDto) {
    const errors = checkGenerateInput(dto);
    if (errors.length) throw new BadRequestException(errors);
    return { slots: generateSlots(dto) };
  }

  async create(auth: AuthContext, dto: CreateScheduleDto, ip?: string) {
    const year = await this.data.currentYear(auth.schoolId);
    const source = dto.copyFromId
      ? await this.prisma.bellSchedule.findFirst({
          where: { id: dto.copyFromId, schoolId: auth.schoolId },
          include: { slots: { orderBy: SLOT_ORDER } },
        })
      : null;
    if (dto.copyFromId && !source)
      throw new NotFoundException('Schedule to copy not found');
    try {
      const created = await this.prisma.bellSchedule.create({
        data: {
          schoolId: auth.schoolId,
          academicYearId: year.id,
          name: dto.name,
          slots: {
            create: (source?.slots ?? []).map((s, i) => ({
              schoolId: auth.schoolId,
              kind: s.kind,
              label: s.label,
              startsAt: s.startsAt,
              endsAt: s.endsAt,
              days: s.days,
              sortOrder: i,
            })),
          },
        },
      });
      await this.record(
        auth,
        'timetable.schedule_created',
        created.id,
        { name: dto.name },
        ip,
      );
      return this.one(auth.schoolId, created.id);
    } catch (e) {
      throw this.nameTaken(e, dto.name);
    }
  }

  async update(
    auth: AuthContext,
    id: string,
    dto: UpdateScheduleDto,
    ip?: string,
  ) {
    const current = await this.prisma.bellSchedule.findFirst({
      where: { id, schoolId: auth.schoolId },
      include: { classes: { select: { class: { select: { name: true } } } } },
    });
    if (!current) throw new NotFoundException('Schedule not found');
    if (dto.active === false && current.classes.length) {
      throw new ConflictException(
        `${current.classes.map((c) => c.class.name).join(', ')} still follow ${current.name}. Move them to other timings first.`,
      );
    }
    try {
      await this.prisma.bellSchedule.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.active !== undefined
            ? { archivedAt: dto.active ? null : new Date() }
            : {}),
        },
      });
    } catch (e) {
      throw this.nameTaken(e, dto.name ?? current.name);
    }
    await this.record(
      auth,
      'timetable.schedule_changed',
      id,
      {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
      ip,
    );
    return this.one(auth.schoolId, id);
  }

  /**
   * Deletes timings nobody uses: no Std follows them and no lesson or day change refers to their rows.
   * Anything in use is refused with the reason (switch it off instead, which keeps the history).
   */
  async remove(auth: AuthContext, id: string, ip?: string) {
    const schedule = await this.prisma.bellSchedule.findFirst({
      where: { id, schoolId: auth.schoolId },
      include: { classes: { select: { class: { select: { name: true } } } } },
    });
    if (!schedule) throw new NotFoundException('Schedule not found');
    await this.prisma.$transaction(async (tx) => {
      await this.data.lock(tx, auth.schoolId, schedule.academicYearId);
      if (schedule.classes.length)
        throw new ConflictException(
          `${schedule.classes.map((c) => c.class.name).join(', ')} still follow ${schedule.name}. Move them to other timings first.`,
        );
      const slotIds = (
        await tx.bellSlot.findMany({
          where: { scheduleId: id },
          select: { id: true },
        })
      ).map((x) => x.id);
      const [lessons, changes] = await Promise.all([
        tx.timetableEntry.count({ where: { slotId: { in: slotIds } } }),
        tx.timetableAdjustment.count({ where: { slotId: { in: slotIds } } }),
      ]);
      if (lessons)
        throw new ConflictException(
          `${schedule.name} has ${lessons} lesson${lessons === 1 ? '' : 's'} in a timetable. Clear those weeks first.`,
        );
      if (changes)
        throw new ConflictException(
          `${schedule.name} has day changes (substitutes or cancelled periods) on record, so it cannot be deleted. Switch it off instead.`,
        );
      await tx.bellSlot.deleteMany({ where: { scheduleId: id } });
      await tx.bellSchedule.delete({ where: { id } });
    });
    await this.record(
      auth,
      'timetable.schedule_deleted',
      id,
      { name: schedule.name },
      ip,
    );
  }

  /**
   * Replaces a schedule's rows. A row sent with its id keeps its timetable; a row left out is removed,
   * which is refused while any class has lessons in it. New times are checked for teacher clashes
   * with other schedules.
   */
  async replaceSlots(
    auth: AuthContext,
    id: string,
    dto: ReplaceSlotsDto,
    ip?: string,
  ) {
    const schedule = await this.prisma.bellSchedule.findFirst({
      where: { id, schoolId: auth.schoolId },
      include: { slots: true },
    });
    if (!schedule) throw new NotFoundException('Schedule not found');
    const errors = validateSlots(dto.slots);
    if (errors.length) throw new BadRequestException(errors);
    const known = new Map(schedule.slots.map((s) => [s.id, s]));
    for (const s of dto.slots) {
      if (s.id && !known.has(s.id))
        throw new BadRequestException('A row does not belong to this schedule');
    }
    const kept = new Set(dto.slots.flatMap((s) => (s.id ? [s.id] : [])));
    const removed = schedule.slots.filter((s) => !kept.has(s.id));

    await this.prisma.$transaction(async (tx) => {
      await this.data.lock(tx, auth.schoolId, schedule.academicYearId);

      // Rows removed, or no longer running on a day, must not hold lessons.
      const problems: string[] = [];
      for (const s of removed) {
        const [lessons, changes] = await Promise.all([
          tx.timetableEntry.count({ where: { slotId: s.id } }),
          tx.timetableAdjustment.count({ where: { slotId: s.id } }),
        ]);
        if (lessons)
          problems.push(
            `${s.label} has ${lessons} lesson${lessons === 1 ? '' : 's'} in the timetable; clear them first`,
          );
        else if (changes)
          problems.push(
            `${s.label} has day changes on record and cannot be removed; rename or retime it instead`,
          );
      }
      for (const s of dto.slots) {
        if (!s.id) continue;
        const before = known.get(s.id)!;
        const dropped = before.days.filter((d) => !s.days.includes(d));
        if (dropped.length) {
          const lessons = await tx.timetableEntry.count({
            where: { slotId: s.id, weekday: { in: dropped } },
          });
          if (lessons)
            problems.push(
              `${s.label} has lessons on ${dropped.map((d) => WEEKDAY_NAMES[d]).join(', ')}; clear them before taking those days off`,
            );
        }
        if (before.kind === 'PERIOD' && s.kind !== 'PERIOD') {
          const lessons = await tx.timetableEntry.count({
            where: { slotId: s.id },
          });
          if (lessons)
            problems.push(
              `${s.label} has lessons; clear them before making it a break`,
            );
        }
      }
      if (problems.length) throw new ConflictException(problems);

      for (const s of removed)
        await tx.bellSlot.delete({ where: { id: s.id } });
      let order = 0;
      for (const s of dto.slots) {
        const row = {
          kind: s.kind,
          label: s.label,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          days: [...new Set(s.days)].sort((a, b) => a - b),
          sortOrder: order++,
        };
        if (s.id) await tx.bellSlot.update({ where: { id: s.id }, data: row });
        else
          await tx.bellSlot.create({
            data: { ...row, schoolId: auth.schoolId, scheduleId: id },
          });
      }

      // Moving a period's time can put a teacher in two places at once with another schedule.
      const changed = dto.slots.filter((s) => {
        if (!s.id) return false;
        const b = known.get(s.id)!;
        return b.startsAt !== s.startsAt || b.endsAt !== s.endsAt;
      });
      if (changed.length) {
        const staffIds = (
          await tx.timetableEntry.findMany({
            where: {
              slotId: { in: changed.map((s) => s.id!) },
              staffId: { not: null },
            },
            select: { staffId: true },
            distinct: ['staffId'],
          })
        ).map((r) => r.staffId!);
        const all = await this.data.bookings(
          auth.schoolId,
          schedule.academicYearId,
          staffIds,
          tx,
        );
        const changedIds = new Set(changed.map((s) => s.id));
        const planned = all.filter((b) => changedIds.has(b.slotId));
        const others = all.filter((b) => !changedIds.has(b.slotId));
        const names = await this.data.staffNames(auth.schoolId, staffIds);
        // Two changed rows of the same schedule cannot overlap (checked above); compare with the rest.
        const clash = this.data.clashes(planned, others, names);
        if (clash.length) throw new ConflictException(clash);
      }
    });
    await this.record(
      auth,
      'timetable.schedule_changed',
      id,
      { rows: dto.slots.length, removed: removed.length },
      ip,
    );
    return this.one(auth.schoolId, id);
  }

  /**
   * Sets which timings each class follows. A class whose divisions already have lessons keeps its
   * timings until that timetable is cleared, because the lessons belong to the old rows.
   */
  async setClassSchedules(
    auth: AuthContext,
    dto: SetClassSchedulesDto,
    ip?: string,
  ) {
    const year = dto.academicYearId
      ? await this.data.yearById(auth.schoolId, dto.academicYearId)
      : await this.data.currentYear(auth.schoolId);
    const classIds = dto.classes.map((c) => c.classId);
    if (new Set(classIds).size !== classIds.length)
      throw new BadRequestException('A class is listed twice');
    const [classes, schedules, current] = await Promise.all([
      this.prisma.schoolClass.findMany({
        where: { schoolId: auth.schoolId, id: { in: classIds } },
        select: { id: true, name: true },
      }),
      this.prisma.bellSchedule.findMany({
        where: {
          schoolId: auth.schoolId,
          academicYearId: year.id,
          archivedAt: null,
        },
        select: { id: true },
      }),
      this.prisma.classBellSchedule.findMany({
        where: {
          schoolId: auth.schoolId,
          academicYearId: year.id,
          classId: { in: classIds },
        },
      }),
    ]);
    if (classes.length !== classIds.length)
      throw new NotFoundException('Class not found');
    const liveSchedules = new Set(schedules.map((s) => s.id));
    const className = new Map(classes.map((c) => [c.id, c.name]));
    const before = new Map(current.map((c) => [c.classId, c.scheduleId]));

    await this.prisma.$transaction(async (tx) => {
      await this.data.lock(tx, auth.schoolId, year.id);
      const problems: string[] = [];
      for (const c of dto.classes) {
        if (c.scheduleId && !liveSchedules.has(c.scheduleId))
          throw new NotFoundException('Schedule not found');
        const was = before.get(c.classId) ?? null;
        if (was === c.scheduleId) continue;
        if (was) {
          const lessons = await tx.timetableEntry.count({
            where: {
              academicYearId: year.id,
              slot: { scheduleId: was },
              division: { classId: c.classId },
            },
          });
          if (lessons) {
            problems.push(
              `${className.get(c.classId)} already has a timetable on its current timings. Clear it before changing the timings.`,
            );
            continue;
          }
        }
        await tx.classBellSchedule.deleteMany({
          where: { academicYearId: year.id, classId: c.classId },
        });
        if (c.scheduleId)
          await tx.classBellSchedule.create({
            data: {
              schoolId: auth.schoolId,
              academicYearId: year.id,
              classId: c.classId,
              scheduleId: c.scheduleId,
            },
          });
      }
      if (problems.length) throw new ConflictException(problems);
    });
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'timetable.class_timings_set',
      entityType: 'academic_year',
      entityId: year.id,
      metadata: { classes: dto.classes.length },
      ip,
    });
    return this.list(auth, year.id);
  }

  // ---------- helpers ----------

  private async one(schoolId: string, id: string) {
    const s = await this.prisma.bellSchedule.findFirst({
      where: { id, schoolId },
      include: {
        slots: { orderBy: SLOT_ORDER },
        classes: { select: { classId: true } },
      },
    });
    if (!s) throw new NotFoundException('Schedule not found');
    return {
      id: s.id,
      name: s.name,
      active: s.archivedAt === null,
      slots: s.slots.map(slotView),
      classIds: s.classes.map((c) => c.classId),
    };
  }

  private nameTaken(e: unknown, name: string) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      return new ConflictException(
        `There are already timings called ${name} this year`,
      );
    return e;
  }

  private record(
    auth: AuthContext,
    action: string,
    entityId: string,
    metadata: Prisma.InputJsonObject,
    ip?: string,
  ) {
    return this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action,
      entityType: 'bell_schedule',
      entityId,
      metadata,
      ip,
    });
  }
}

export const slotView = (s: {
  id: string;
  kind: 'PERIOD' | 'BREAK' | 'ASSEMBLY';
  label: string;
  startsAt: string;
  endsAt: string;
  days: number[];
  sortOrder: number;
}) => ({
  id: s.id,
  kind: s.kind,
  label: s.label,
  startsAt: s.startsAt,
  endsAt: s.endsAt,
  days: s.days,
  sortOrder: s.sortOrder,
});
