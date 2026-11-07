import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import type { AuthedRequest } from '../../common/auth-context.js';
import { ALLOW_PASSWORD_CHANGE_KEY } from '../../common/decorators/allow-password-change.decorator.js';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  PORTAL_SESSION_MS,
  SESSION_COOKIE,
  hashToken,
  isPortalOnly,
  sessionCookieOptions,
} from './auth.constants.js';

/** Last-seen is refreshed at most this often, to avoid a write on every request. */
const TOUCH_AFTER_MS = 5 * 60 * 1000;

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets))
      return true;

    const http = ctx.switchToHttp();
    const req = http.getRequest<AuthedRequest>();
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || !token) throw new UnauthorizedException();

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        user: {
          include: {
            roles: {
              include: {
                role: {
                  include: { permissions: { include: { permission: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (
      !session ||
      session.expiresAt < new Date() ||
      session.user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException();
    }

    // Roles and permissions are read on every request, so a role change or a
    // disabled account takes effect immediately.
    const roles = session.user.roles.map((ur) => ur.role);
    const roleCodes = roles.map((r) => r.code);

    const now = Date.now();
    if (now - session.lastSeenAt.getTime() > TOUCH_AFTER_MS) {
      const sliding = isPortalOnly(roleCodes);
      await this.prisma.session.update({
        where: { id: session.id },
        data: {
          lastSeenAt: new Date(now),
          ...(sliding ? { expiresAt: new Date(now + PORTAL_SESSION_MS) } : {}),
        },
      });
      if (sliding) {
        http
          .getResponse<Response>()
          .cookie(
            SESSION_COOKIE,
            token,
            sessionCookieOptions(
              this.config.get('NODE_ENV') === 'production',
              PORTAL_SESSION_MS,
            ),
          );
      }
    }

    req.auth = {
      userId: session.user.id,
      schoolId: session.schoolId,
      sessionId: session.id,
      fullName: session.user.fullName,
      roles: roleCodes,
      permissions: [
        ...new Set(
          roles.flatMap((r) => r.permissions.map((rp) => rp.permission.code)),
        ),
      ],
      mustChangePassword: session.user.mustChangePassword,
    };

    if (
      req.auth.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(
        ALLOW_PASSWORD_CHANGE_KEY,
        targets,
      )
    ) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'You must change your temporary password first',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }
    return true;
  }
}
