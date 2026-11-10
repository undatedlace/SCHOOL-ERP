import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ADMINS_MANAGE, hasAdminRole } from '../../common/admin-roles.js';
import type { AuthContext } from '../../common/auth-context.js';
import {
  generateTemporaryPassword,
  hashPassword,
  tempPasswordExpiry,
  verifyPassword,
} from '../../common/password.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { SchoolService } from '../school/school.service.js';
import { hashToken, sessionLifetimeMs } from './auth.constants.js';

export interface IssuedSession {
  token: string;
  maxAgeMs: number;
}

interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  // Verified against when the account doesn't exist, so response time doesn't
  // reveal which identifiers are valid.
  private readonly dummyHash = hashPassword('not-a-real-password');

  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolService,
    private readonly audit: AuditService,
  ) {}

  async login(identifier: string, password: string, client: ClientInfo) {
    const schoolId = await this.schools.getDefaultSchoolId();
    const id = identifier.trim();

    const user = await this.prisma.user.findFirst({
      where: {
        schoolId,
        OR: [
          { email: id.toLowerCase() },
          { mobile: id },
          { username: id.toLowerCase() },
        ],
      },
      include: { roles: { include: { role: { select: { code: true } } } } },
    });

    const ok = await verifyPassword(
      user?.passwordHash ?? (await this.dummyHash),
      password,
    );
    if (!user || !ok || user.status !== 'ACTIVE') {
      await this.audit.log({
        schoolId,
        action: 'auth.login_failed',
        metadata: { identifier: id },
        ip: client.ip,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    // A temporary password that was not changed in time no longer works. Said only after the
    // password was right, so it reveals nothing to someone guessing.
    if (
      user.mustChangePassword &&
      user.tempPasswordExpiresAt &&
      user.tempPasswordExpiresAt.getTime() < Date.now()
    ) {
      await this.audit.log({
        schoolId,
        actorUserId: user.id,
        action: 'auth.temp_password_expired',
        ip: client.ip,
      });
      throw new UnauthorizedException(
        'Your temporary password has expired. Ask the school office for a new one.',
      );
    }

    const session = await this.issueSession(
      user.id,
      schoolId,
      user.roles.map((r) => r.role.code),
      client,
    );
    await this.audit.log({
      schoolId,
      actorUserId: user.id,
      action: 'auth.login',
      ip: client.ip,
    });
    return { ...session, mustChangePassword: user.mustChangePassword };
  }

  async logout(auth: AuthContext) {
    await this.prisma.session.deleteMany({ where: { id: auth.sessionId } });
  }

  /**
   * Sets a new password, revokes every session of the user (including this
   * one), and issues a fresh session: sessions rotate on password change.
   */
  async changePassword(
    auth: AuthContext,
    currentPassword: string,
    newPassword: string,
    client: ClientInfo,
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: auth.userId },
    });
    if (!(await verifyPassword(user.passwordHash, currentPassword))) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (currentPassword === newPassword) {
      throw new BadRequestException(
        'New password must be different from the current one',
      );
    }

    const passwordHash = await hashPassword(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          mustChangePassword: false,
          tempPasswordExpiresAt: null,
        },
      }),
      this.prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);

    const session = await this.issueSession(
      user.id,
      auth.schoolId,
      auth.roles,
      client,
    );
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: user.id,
      action: 'auth.password_changed',
      ip: client.ip,
    });
    return session;
  }

  /** Admin issues a new temporary password; the user must change it at next login. */
  async resetPassword(auth: AuthContext, targetUserId: string, ip?: string) {
    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, schoolId: auth.schoolId },
      select: {
        id: true,
        roles: { select: { role: { select: { code: true } } } },
      },
    });
    if (!target) throw new NotFoundException('User not found');
    // Only a Super Admin may reset the password of an admin.
    if (
      hasAdminRole(target.roles.map((r) => r.role.code)) &&
      !auth.permissions.includes(ADMINS_MANAGE)
    ) {
      throw new ForbiddenException(
        'Only a Super Admin can reset the password of an administrator',
      );
    }

    const temporaryPassword = generateTemporaryPassword();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: target.id },
        data: {
          passwordHash: await hashPassword(temporaryPassword),
          mustChangePassword: true,
          tempPasswordExpiresAt: tempPasswordExpiry(),
        },
      }),
      this.prisma.session.deleteMany({ where: { userId: target.id } }),
    ]);
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'auth.password_reset',
      entityType: 'user',
      entityId: target.id,
      ip,
    });
    return { temporaryPassword };
  }

  private async issueSession(
    userId: string,
    schoolId: string,
    roleCodes: string[],
    client: ClientInfo,
  ): Promise<IssuedSession> {
    const maxAgeMs = sessionLifetimeMs(roleCodes);
    const token = randomBytes(32).toString('base64url');
    await this.prisma.session.create({
      data: {
        userId,
        schoolId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + maxAgeMs),
        ip: client.ip,
        userAgent: client.userAgent,
      },
    });
    return { token, maxAgeMs };
  }
}
