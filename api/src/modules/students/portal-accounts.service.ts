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
import { AuthService } from '../auth/auth.service.js';
import { UsersService } from '../users/users.service.js';

const PARENT = 'PARENT';
const STUDENT = 'STUDENT';

/**
 * Logins for parents and students.
 *  - A parent signs in with the mobile number the school holds for them. Two guardians
 *    who share a phone (father and mother) share one login.
 *  - A student signs in with their admission number.
 * The school issues a temporary password, shown once; the person must change it at first sign-in.
 */
@Injectable()
export class PortalAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly authService: AuthService,
    private readonly audit: AuditService,
  ) {}

  async createForGuardian(auth: AuthContext, guardianId: string, ip?: string) {
    const guardian = await this.prisma.guardian.findFirst({
      where: { id: guardianId, schoolId: auth.schoolId },
      include: { _count: { select: { students: true } } },
    });
    if (!guardian) throw new NotFoundException('Guardian not found');
    if (guardian.userId)
      throw new ConflictException('This person already has a login');
    if (!guardian.mobile) {
      throw new BadRequestException(
        'Add a mobile number first: it is what a parent signs in with',
      );
    }
    if (guardian._count.students === 0) {
      throw new BadRequestException(
        'This person is not linked to any student yet',
      );
    }
    const mobile = guardian.mobile;

    const existing = await this.prisma.user.findFirst({
      where: {
        schoolId: auth.schoolId,
        OR: [{ mobile }, { username: mobile.toLowerCase() }, { email: mobile }],
      },
      include: {
        roles: { select: { role: { select: { code: true } } } },
        _count: { select: { guardians: true } },
      },
    });

    let result: {
      loginId: string;
      temporaryPassword?: string;
      shared: boolean;
    };
    if (existing) {
      // Another parent on the same phone: link to the login they already have.
      const onlyParent =
        existing.mobile === mobile &&
        existing._count.guardians > 0 &&
        existing.roles.length > 0 &&
        existing.roles.every((r) => r.role.code === PARENT);
      if (!onlyParent) {
        throw new ConflictException(
          'That mobile number is already used by another login',
        );
      }
      await this.prisma.guardian.update({
        where: { id: guardian.id },
        data: { userId: existing.id },
      });
      result = { loginId: mobile, shared: true };
    } else {
      try {
        const temporaryPassword = await this.prisma.$transaction(async (tx) => {
          const account = await this.users.createAccount(tx, auth.schoolId, {
            fullName: guardian.fullName,
            mobile,
            roleCodes: [PARENT],
          });
          await tx.guardian.update({
            where: { id: guardian.id },
            data: { userId: account.id },
          });
          return account.temporaryPassword;
        });
        result = { loginId: mobile, temporaryPassword, shared: false };
      } catch (error) {
        throw this.conflict(error);
      }
    }

    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'guardians.account_created',
      entityType: 'guardian',
      entityId: guardian.id,
      metadata: { shared: String(result.shared) },
      ip,
    });
    return result;
  }

  async createForStudent(auth: AuthContext, studentId: string, ip?: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId: auth.schoolId },
    });
    if (!student) throw new NotFoundException('Student not found');
    if (student.userId)
      throw new ConflictException('This student already has a login');
    if (student.status !== 'ACTIVE') {
      throw new BadRequestException(
        'A student who has left cannot be given a login',
      );
    }
    const username = student.admissionNo.trim().toLowerCase();

    const clash = await this.prisma.user.findFirst({
      where: {
        schoolId: auth.schoolId,
        OR: [
          { username },
          { mobile: student.admissionNo },
          { email: username },
        ],
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(
        'That admission number is already used as a sign-in name by another login',
      );
    }

    let temporaryPassword: string | undefined;
    try {
      await this.prisma.$transaction(async (tx) => {
        const account = await this.users.createAccount(tx, auth.schoolId, {
          fullName: [student.firstName, student.fatherName, student.surname]
            .filter(Boolean)
            .join(' '),
          username,
          roleCodes: [STUDENT],
        });
        temporaryPassword = account.temporaryPassword;
        await tx.student.update({
          where: { id: student.id },
          data: { userId: account.id },
        });
      });
    } catch (error) {
      throw this.conflict(error);
    }
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'students.account_created',
      entityType: 'student',
      entityId: student.id,
      ip,
    });
    return { loginId: student.admissionNo, temporaryPassword };
  }

  /** New temporary password for a parent. If two parents share the login, both get the new one. */
  async resetForGuardian(auth: AuthContext, guardianId: string, ip?: string) {
    const guardian = await this.prisma.guardian.findFirst({
      where: { id: guardianId, schoolId: auth.schoolId },
      select: { userId: true, mobile: true },
    });
    if (!guardian) throw new NotFoundException('Guardian not found');
    if (!guardian.userId)
      throw new BadRequestException('This person has no login yet');
    const { temporaryPassword } = await this.authService.resetPassword(
      auth,
      guardian.userId,
      ip,
    );
    return { loginId: guardian.mobile, temporaryPassword };
  }

  async resetForStudent(auth: AuthContext, studentId: string, ip?: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId: auth.schoolId },
      select: { userId: true, admissionNo: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    if (!student.userId)
      throw new BadRequestException('This student has no login yet');
    const { temporaryPassword } = await this.authService.resetPassword(
      auth,
      student.userId,
      ip,
    );
    return { loginId: student.admissionNo, temporaryPassword };
  }

  private conflict(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException(
        'That sign-in name is already used by another login',
      );
    }
    return error;
  }
}
