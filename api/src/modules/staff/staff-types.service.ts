import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { STAFF_FORM_PREFIX } from '../forms/form-kinds.js';
import { FormsService } from '../forms/forms.service.js';
import {
  CreateStaffTypeDto,
  UpdateStaffTypeDto,
} from './dto/staff-types.dto.js';

const SELECT = {
  id: true,
  name: true,
  isTeaching: true,
  active: true,
  sortOrder: true,
  _count: { select: { staff: true } },
} satisfies Prisma.StaffTypeSelect;
type Row = Prisma.StaffTypeGetPayload<{ select: typeof SELECT }>;

const view = (t: Row) => ({
  id: t.id,
  name: t.name,
  isTeaching: t.isTeaching,
  active: t.active,
  staffCount: t._count.staff,
  /** The key of this type's onboarding form in the form builder. */
  formKey: `${STAFF_FORM_PREFIX}${t.id}`,
});

/** The kinds of employee the school has (teacher, clerk, peon...). Switched off, never deleted. */
@Injectable()
export class StaffTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly forms: FormsService,
  ) {}

  async list(schoolId: string, includeInactive: boolean) {
    const rows = await this.prisma.staffType.findMany({
      where: { schoolId, ...(includeInactive ? {} : { active: true }) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: SELECT,
    });
    return rows.map(view);
  }

  /** The onboarding form to fill in for new staff of this type. */
  async form(schoolId: string, id: string) {
    const type = await this.prisma.staffType.findFirst({
      where: { id, schoolId },
      select: { id: true },
    });
    if (!type) throw new NotFoundException('Staff type not found');
    return this.forms.current(schoolId, `${STAFF_FORM_PREFIX}${id}`);
  }

  async create(auth: AuthContext, dto: CreateStaffTypeDto, ip?: string) {
    const last = await this.prisma.staffType.aggregate({
      where: { schoolId: auth.schoolId },
      _max: { sortOrder: true },
    });
    try {
      const row = await this.prisma.staffType.create({
        data: {
          schoolId: auth.schoolId,
          name: dto.name,
          isTeaching: dto.isTeaching ?? false,
          sortOrder: (last._max.sortOrder ?? 0) + 1,
        },
        select: SELECT,
      });
      await this.record(auth, 'staff_type.created', row.id, ip, {
        name: dto.name,
      });
      return view(row);
    } catch (error) {
      throw this.conflict(error, dto.name);
    }
  }

  async update(
    auth: AuthContext,
    id: string,
    dto: UpdateStaffTypeDto,
    ip?: string,
  ) {
    const found = await this.prisma.staffType.findFirst({
      where: { id, schoolId: auth.schoolId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Staff type not found');
    try {
      const row = await this.prisma.staffType.update({
        where: { id },
        data: dto,
        select: SELECT,
      });
      await this.record(auth, 'staff_type.updated', id, ip, {
        fields: Object.keys(dto).join(','),
      });
      return view(row);
    } catch (error) {
      throw this.conflict(error, dto.name ?? '');
    }
  }

  private conflict(error: unknown, name: string): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException(`There is already a staff type "${name}"`);
    }
    return error;
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
      entityType: 'staff_type',
      entityId,
      metadata,
      ip,
    });
  }
}
