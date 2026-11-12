import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  generateTemporaryPassword,
  hashPassword,
  tempPasswordExpiry,
  verifyPassword,
} from '../../common/password.js';
import { PrismaService } from '../../database/prisma.service.js';
import { hashToken } from '../auth/auth.constants.js';
import { OwnerContext, PLATFORM_SESSION_MS } from './platform.constants.js';
import { PlatformAuditService } from './platform-audit.service.js';

interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class PlatformAuthService {
  private readonly dummyHash = hashPassword('not-a-real-password');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
  ) {}

  async login(email: string, password: string, client: ClientInfo) {
    const owner = await this.prisma.platformOwner.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    const ok = await verifyPassword(
      owner?.passwordHash ?? (await this.dummyHash),
      password,
    );
    if (!owner || !ok || owner.status !== 'ACTIVE') {
      await this.audit.log({
        action: 'platform.login_failed',
        metadata: { email: email.trim().toLowerCase() },
        ip: client.ip,
      });
      throw new UnauthorizedException('Invalid credentials');
    }
    if (
      owner.mustChangePassword &&
      owner.tempPasswordExpiresAt &&
      owner.tempPasswordExpiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException(
        'Your temporary password has expired. Issue a new one with npm run owner:reset-password.',
      );
    }
    const token = await this.issueSession(owner.id, client);
    await this.audit.log({
      ownerId: owner.id,
      action: 'platform.login',
      ip: client.ip,
    });
    return { token, mustChangePassword: owner.mustChangePassword };
  }

  async logout(owner: OwnerContext) {
    await this.prisma.platformSession.deleteMany({
      where: { id: owner.sessionId },
    });
  }

  /** Sets a new password, ends every session of the owner and starts a fresh one. */
  async changePassword(
    owner: OwnerContext,
    currentPassword: string,
    newPassword: string,
    client: ClientInfo,
  ) {
    const row = await this.prisma.platformOwner.findUniqueOrThrow({
      where: { id: owner.ownerId },
    });
    if (!(await verifyPassword(row.passwordHash, currentPassword))) {
      throw new UnauthorizedException('The current password is not correct');
    }
    await this.prisma.$transaction([
      this.prisma.platformOwner.update({
        where: { id: row.id },
        data: {
          passwordHash: await hashPassword(newPassword),
          mustChangePassword: false,
          tempPasswordExpiresAt: null,
        },
      }),
      this.prisma.platformSession.deleteMany({ where: { ownerId: row.id } }),
    ]);
    await this.audit.log({
      ownerId: row.id,
      action: 'platform.password_changed',
      ip: client.ip,
    });
    return this.issueSession(row.id, client);
  }

  /** For the owner:create command (there is no sign-up page). */
  async createOwner(email: string, fullName: string) {
    const address = email.trim().toLowerCase();
    if (
      await this.prisma.platformOwner.findUnique({ where: { email: address } })
    ) {
      throw new ConflictException(`An owner with ${address} already exists`);
    }
    const temporaryPassword = generateTemporaryPassword();
    const owner = await this.prisma.platformOwner.create({
      data: {
        email: address,
        fullName: fullName.trim() || address,
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
        tempPasswordExpiresAt: tempPasswordExpiry(),
      },
    });
    await this.audit.log({
      action: 'platform.owner_created_cli',
      entityType: 'owner',
      entityId: owner.id,
    });
    return { temporaryPassword };
  }

  /** For the owner:reset-password command. */
  async recoverOwner(email: string) {
    const owner = await this.prisma.platformOwner.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!owner) throw new NotFoundException(`No owner with ${email}`);
    const temporaryPassword = generateTemporaryPassword();
    await this.prisma.$transaction([
      this.prisma.platformOwner.update({
        where: { id: owner.id },
        data: {
          passwordHash: await hashPassword(temporaryPassword),
          mustChangePassword: true,
          tempPasswordExpiresAt: tempPasswordExpiry(),
          status: 'ACTIVE',
        },
      }),
      this.prisma.platformSession.deleteMany({ where: { ownerId: owner.id } }),
    ]);
    await this.audit.log({
      action: 'platform.owner_password_reset_cli',
      entityType: 'owner',
      entityId: owner.id,
    });
    return { temporaryPassword };
  }

  private async issueSession(ownerId: string, client: ClientInfo) {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.platformSession.create({
      data: {
        ownerId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + PLATFORM_SESSION_MS),
        ip: client.ip,
        userAgent: client.userAgent,
      },
    });
    return token;
  }
}
