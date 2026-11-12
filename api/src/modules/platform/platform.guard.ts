import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ALLOW_PASSWORD_CHANGE_KEY } from '../../common/decorators/allow-password-change.decorator.js';
import { PrismaService } from '../../database/prisma.service.js';
import { hashToken } from '../auth/auth.constants.js';
import {
  OwnerContext,
  PLATFORM_COOKIE,
  PLATFORM_OPEN_KEY,
} from './platform.constants.js';

type OwnerRequest = Request & { owner?: OwnerContext };

/** A platform route anyone may call (only sign-in). */
export const PlatformOpen = () => SetMetadata(PLATFORM_OPEN_KEY, true);

/** The signed-in platform owner. */
export const CurrentOwner = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<OwnerRequest>().owner as OwnerContext,
);

/**
 * Guards every /api/platform route with the owner's own session (a school user's session never
 * works here, and an owner's never works on a school's routes).
 */
@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PLATFORM_OPEN_KEY, targets))
      return true;

    const req = ctx.switchToHttp().getRequest<OwnerRequest>();
    const token: unknown = req.cookies?.[PLATFORM_COOKIE];
    if (typeof token !== 'string' || !token) throw new UnauthorizedException();

    const session = await this.prisma.platformSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { owner: true },
    });
    if (
      !session ||
      session.expiresAt < new Date() ||
      session.owner.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException();
    }
    req.owner = {
      ownerId: session.owner.id,
      sessionId: session.id,
      fullName: session.owner.fullName,
      email: session.owner.email,
      mustChangePassword: session.owner.mustChangePassword,
    };
    if (
      req.owner.mustChangePassword &&
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
