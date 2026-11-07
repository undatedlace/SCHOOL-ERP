import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { Page, skipTake } from '../../common/dto/page-query.dto.js';
import {
  generateTemporaryPassword,
  hashPassword,
} from '../../common/password.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import {
  CreateUserDto,
  ListUsersQueryDto,
  UpdateUserDto,
} from './dto/user.dto.js';

const ADMIN_ROLE = 'SCHOOL_ADMIN';

const USER_SELECT = {
  id: true,
  fullName: true,
  email: true,
  mobile: true,
  status: true,
  mustChangePassword: true,
  createdAt: true,
  roles: { select: { role: { select: { code: true, name: true } } } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

const toDto = (u: UserRow) => ({
  id: u.id,
  fullName: u.fullName,
  email: u.email,
  mobile: u.mobile,
  status: u.status,
  mustChangePassword: u.mustChangePassword,
  createdAt: u.createdAt,
  roles: u.roles.map((r) => r.role),
});

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    schoolId: string,
    q: ListUsersQueryDto,
  ): Promise<Page<ReturnType<typeof toDto>>> {
    const where: Prisma.UserWhereInput = {
      schoolId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.role ? { roles: { some: { role: { code: q.role } } } } : {}),
      ...(q.search
        ? {
            OR: [
              { fullName: { contains: q.search, mode: 'insensitive' } },
              { email: { contains: q.search, mode: 'insensitive' } },
              { mobile: { contains: q.search } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
        ...skipTake(q),
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items: rows.map(toDto),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async findOne(schoolId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, schoolId },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return toDto(user);
  }

  async create(auth: AuthContext, dto: CreateUserDto, ip?: string) {
    const { id, temporaryPassword } = await this.createAccount(
      this.prisma,
      auth.schoolId,
      dto,
    );
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: USER_SELECT,
    });

    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'users.created',
      entityType: 'user',
      entityId: user.id,
      metadata: { roles: dto.roleCodes.join(',') },
      ip,
    });
    return {
      ...toDto(user),
      ...(temporaryPassword ? { temporaryPassword } : {}),
    };
  }

  /**
   * Creates a login account with a temporary password (generated unless one is
   * given). Takes a database handle so a caller can do it inside its own
   * transaction, as staff creation does.
   */
  async createAccount(
    db: Pick<Prisma.TransactionClient, 'user'>,
    schoolId: string,
    input: {
      fullName: string;
      email?: string;
      mobile?: string;
      roleCodes: string[];
      password?: string;
    },
  ): Promise<{ id: string; temporaryPassword?: string }> {
    if (!input.email && !input.mobile) {
      throw new BadRequestException('Provide an email or a mobile number');
    }
    const roleIds = await this.resolveRoles(input.roleCodes);
    const temporaryPassword = input.password
      ? undefined
      : generateTemporaryPassword();
    const user = await db.user.create({
      data: {
        schoolId,
        fullName: input.fullName,
        email: input.email,
        mobile: input.mobile,
        passwordHash: await hashPassword(
          input.password ?? (temporaryPassword as string),
        ),
        mustChangePassword: true,
        roles: { create: roleIds.map((roleId) => ({ roleId })) },
      },
      select: { id: true },
    });
    return { id: user.id, temporaryPassword };
  }

  async update(auth: AuthContext, id: string, dto: UpdateUserDto, ip?: string) {
    const existing = await this.prisma.user.findFirst({
      where: { id, schoolId: auth.schoolId },
      select: {
        id: true,
        status: true,
        roles: { select: { role: { select: { code: true } } } },
      },
    });
    if (!existing) throw new NotFoundException('User not found');

    const disabling =
      dto.status === 'DISABLED' && existing.status !== 'DISABLED';
    if (disabling && id === auth.userId) {
      throw new BadRequestException('You cannot disable your own account');
    }

    const wasAdmin = existing.roles.some((r) => r.role.code === ADMIN_ROLE);
    const staysAdmin = dto.roleCodes
      ? dto.roleCodes.includes(ADMIN_ROLE)
      : wasAdmin;
    const staysActive = (dto.status ?? existing.status) === 'ACTIVE';
    if (wasAdmin && (!staysAdmin || !staysActive)) {
      await this.assertAnotherActiveAdmin(auth.schoolId, id);
    }

    const roleIds = dto.roleCodes
      ? await this.resolveRoles(dto.roleCodes)
      : undefined;
    const { roleCodes, ...fields } = dto;

    const user = await this.prisma.$transaction(async (tx) => {
      if (roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({
          data: roleIds.map((roleId) => ({ userId: id, roleId })),
        });
      }
      if (disabling) await tx.session.deleteMany({ where: { userId: id } });
      return tx.user.update({
        where: { id },
        data: fields,
        select: USER_SELECT,
      });
    });

    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'users.updated',
      entityType: 'user',
      entityId: id,
      metadata: { fields: Object.keys(fields).join(',') },
      ip,
    });
    if (roleCodes) {
      await this.audit.log({
        schoolId: auth.schoolId,
        actorUserId: auth.userId,
        action: 'users.roles_changed',
        entityType: 'user',
        entityId: id,
        metadata: { roles: roleCodes.join(',') },
        ip,
      });
    }
    return toDto(user);
  }

  private async resolveRoles(codes: string[]): Promise<string[]> {
    const roles = await this.prisma.role.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true },
    });
    const missing = codes.filter((c) => !roles.some((r) => r.code === c));
    if (missing.length)
      throw new BadRequestException(`Unknown role: ${missing.join(', ')}`);
    return roles.map((r) => r.id);
  }

  private async assertAnotherActiveAdmin(
    schoolId: string,
    excludingUserId: string,
  ) {
    const others = await this.prisma.user.count({
      where: {
        schoolId,
        id: { not: excludingUserId },
        status: 'ACTIVE',
        roles: { some: { role: { code: ADMIN_ROLE } } },
      },
    });
    if (others === 0) {
      throw new BadRequestException(
        'The school must keep at least one active School Admin',
      );
    }
  }
}
