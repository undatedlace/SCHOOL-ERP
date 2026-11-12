import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ADMIN_ROLES } from '../../common/admin-roles.js';
import {
  generateTemporaryPassword,
  hashPassword,
  tempPasswordExpiry,
} from '../../common/password.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { UsersService } from '../users/users.service.js';
import {
  AddSchoolAdminDto,
  OnboardSchoolDto,
  UpdatePlatformSchoolDto,
} from './dto/platform.dto.js';
import { OwnerContext } from './platform.constants.js';
import { PlatformAuditService } from './platform-audit.service.js';
import {
  isValidSchoolCode,
  provisionSchoolDefaults,
  schoolCodeFrom,
} from './school-defaults.js';

export interface IssuedLogin {
  fullName: string;
  email: string;
  role: string;
  temporaryPassword: string;
}

const ADMIN_ROLE_FILTER = {
  roles: { some: { role: { code: { in: [...ADMIN_ROLES] } } } },
} satisfies Prisma.UserWhereInput;

/**
 * What a platform owner may do to schools. Deliberately narrow: owners see each school's name,
 * code, status, a few counts and its administrators, never its students, staff records or money.
 */
@Injectable()
export class PlatformSchoolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly schoolAudit: AuditService,
    private readonly audit: PlatformAuditService,
  ) {}

  async list() {
    const schools = await this.prisma.school.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        code: true,
        status: true,
        createdAt: true,
        _count: {
          select: {
            students: { where: { status: 'ACTIVE' } },
            staff: { where: { status: 'ACTIVE' } },
            users: true,
          },
        },
      },
    });
    const first = schools[0]?.id;
    return schools.map(({ _count, ...s }) => ({
      ...s,
      isHome: s.id === first,
      students: _count.students,
      staff: _count.staff,
      logins: _count.users,
    }));
  }

  async get(id: string) {
    const school = await this.prisma.school.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        code: true,
        status: true,
        createdAt: true,
      },
    });
    if (!school) throw new NotFoundException('School not found');
    const [home, admins, students, staff] = await Promise.all([
      this.prisma.school.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      }),
      this.prisma.user.findMany({
        where: { schoolId: id, ...ADMIN_ROLE_FILTER },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          fullName: true,
          email: true,
          status: true,
          mustChangePassword: true,
          createdAt: true,
          roles: { select: { role: { select: { code: true, name: true } } } },
        },
      }),
      this.prisma.student.count({ where: { schoolId: id, status: 'ACTIVE' } }),
      this.prisma.staff.count({ where: { schoolId: id, status: 'ACTIVE' } }),
    ]);
    return {
      ...school,
      isHome: home?.id === id,
      students,
      staff,
      admins: admins.map(({ roles, ...a }) => ({
        ...a,
        roles: roles
          .map((r) => r.role)
          .filter((r) => (ADMIN_ROLES as readonly string[]).includes(r.code)),
      })),
    };
  }

  /**
   * Onboards a school in one go (all or nothing): the school, its staff types and forms, the
   * admission form, its Super Admin and optionally its School Admin. The temporary passwords are
   * returned once; each person must change theirs at first sign-in.
   */
  async onboard(owner: OwnerContext, dto: OnboardSchoolDto, ip?: string) {
    const code = dto.code ?? schoolCodeFrom(dto.name);
    if (!isValidSchoolCode(code)) {
      throw new BadRequestException('Choose a school code, for example "hesj"');
    }
    await this.assertCodeFree(code);
    if (dto.schoolAdminName && dto.schoolAdminEmail === dto.superAdminEmail) {
      throw new BadRequestException(
        'The Super Admin and the School Admin need different e-mail addresses',
      );
    }

    const wanted = [
      {
        fullName: dto.superAdminName,
        email: dto.superAdminEmail,
        role: 'SUPER_ADMIN',
      },
      ...(dto.schoolAdminName && dto.schoolAdminEmail
        ? [
            {
              fullName: dto.schoolAdminName,
              email: dto.schoolAdminEmail,
              role: 'SCHOOL_ADMIN',
            },
          ]
        : []),
    ];

    const { school, logins } = await this.prisma.$transaction(
      async (tx) => {
        const school = await tx.school.create({
          data: { name: dto.name, code },
          select: { id: true, name: true, code: true, status: true },
        });
        await provisionSchoolDefaults(tx, school.id);
        const logins: (IssuedLogin & { id: string })[] = [];
        for (const w of wanted) {
          const made = await this.users.createAccount(tx, school.id, {
            fullName: w.fullName,
            email: w.email,
            roleCodes: [w.role],
          });
          logins.push({
            ...w,
            id: made.id,
            temporaryPassword: made.temporaryPassword!,
          });
        }
        return { school, logins };
      },
      { timeout: 30_000 },
    );

    await this.audit.log({
      ownerId: owner.ownerId,
      action: 'platform.school_onboarded',
      schoolId: school.id,
      entityType: 'school',
      entityId: school.id,
      metadata: { name: school.name, code: school.code },
      ip,
    });
    for (const l of logins) await this.logAdminMade(owner, school.id, l, ip);
    return { school, logins: logins.map(({ id: _id, ...l }) => l) };
  }

  async update(
    owner: OwnerContext,
    id: string,
    dto: UpdatePlatformSchoolDto,
    ip?: string,
  ) {
    const school = await this.findSchool(id);
    if (dto.code && dto.code !== school.code)
      await this.assertCodeFree(dto.code);
    const updated = await this.prisma.school.update({
      where: { id },
      data: { name: dto.name, code: dto.code },
      select: { id: true, name: true, code: true, status: true },
    });
    await this.audit.log({
      ownerId: owner.ownerId,
      action: 'platform.school_updated',
      schoolId: id,
      entityType: 'school',
      entityId: id,
      metadata: { name: updated.name, code: updated.code },
      ip,
    });
    return updated;
  }

  /** Pausing a school signs everyone in it out at once; nothing is deleted. */
  async setStatus(
    owner: OwnerContext,
    id: string,
    status: 'ACTIVE' | 'SUSPENDED',
    ip?: string,
  ) {
    await this.findSchool(id);
    await this.prisma.$transaction([
      this.prisma.school.update({ where: { id }, data: { status } }),
      ...(status === 'SUSPENDED'
        ? [this.prisma.session.deleteMany({ where: { schoolId: id } })]
        : []),
    ]);
    const action =
      status === 'SUSPENDED'
        ? 'platform.school_suspended'
        : 'platform.school_resumed';
    await this.audit.log({
      ownerId: owner.ownerId,
      action,
      schoolId: id,
      entityType: 'school',
      entityId: id,
      ip,
    });
    await this.schoolAudit.log({
      schoolId: id,
      action,
      entityType: 'school',
      entityId: id,
      metadata: { by: owner.email },
      ip,
    });
    return this.get(id);
  }

  /** Another Super Admin or School Admin for a school (for example when the trustees change). */
  async addAdmin(
    owner: OwnerContext,
    id: string,
    dto: AddSchoolAdminDto,
    ip?: string,
  ) {
    await this.findSchool(id);
    const taken = await this.prisma.user.findFirst({
      where: { schoolId: id, email: dto.email },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException(
        'Someone in this school already signs in with that e-mail',
      );
    }
    const made = await this.users.createAccount(this.prisma, id, {
      fullName: dto.fullName,
      email: dto.email,
      roleCodes: [dto.role],
    });
    const login: IssuedLogin = {
      fullName: dto.fullName,
      email: dto.email,
      role: dto.role,
      temporaryPassword: made.temporaryPassword!,
    };
    await this.logAdminMade(owner, id, { ...login, id: made.id }, ip);
    return login;
  }

  /** A new temporary password for one of the school's administrators (and only them). */
  async resetAdminPassword(
    owner: OwnerContext,
    id: string,
    userId: string,
    ip?: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, schoolId: id, ...ADMIN_ROLE_FILTER },
      select: { id: true, fullName: true, email: true },
    });
    if (!user) throw new NotFoundException('Administrator not found');
    const temporaryPassword = generateTemporaryPassword();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await hashPassword(temporaryPassword),
          mustChangePassword: true,
          tempPasswordExpiresAt: tempPasswordExpiry(),
          status: 'ACTIVE',
        },
      }),
      this.prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);
    await this.audit.log({
      ownerId: owner.ownerId,
      action: 'platform.admin_password_reset',
      schoolId: id,
      entityType: 'user',
      entityId: user.id,
      ip,
    });
    await this.schoolAudit.log({
      schoolId: id,
      action: 'platform.admin_password_reset',
      entityType: 'user',
      entityId: user.id,
      metadata: { by: owner.email },
      ip,
    });
    return { fullName: user.fullName, email: user.email, temporaryPassword };
  }

  private async logAdminMade(
    owner: OwnerContext,
    schoolId: string,
    l: IssuedLogin & { id: string },
    ip?: string,
  ) {
    await this.audit.log({
      ownerId: owner.ownerId,
      action: 'platform.admin_created',
      schoolId,
      entityType: 'user',
      entityId: l.id,
      metadata: { role: l.role, email: l.email },
      ip,
    });
    // The school's own audit log says who made the account, since nobody in the school did.
    await this.schoolAudit.log({
      schoolId,
      action: 'platform.admin_created',
      entityType: 'user',
      entityId: l.id,
      metadata: { role: l.role, by: owner.email },
      ip,
    });
  }

  private async findSchool(id: string) {
    const school = await this.prisma.school.findUnique({
      where: { id },
      select: { id: true, code: true },
    });
    if (!school) throw new NotFoundException('School not found');
    return school;
  }

  private async assertCodeFree(code: string) {
    if (
      await this.prisma.school.findUnique({
        where: { code },
        select: { id: true },
      })
    ) {
      throw new ConflictException(
        `The school code "${code}" is already in use`,
      );
    }
  }
}
