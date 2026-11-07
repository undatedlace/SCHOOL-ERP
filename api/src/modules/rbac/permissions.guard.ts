import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthedRequest } from '../../common/auth-context.js';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator.js';

/** Layer 1 of access control: can this user perform this kind of action at all? */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required?.length) return true;

    const have =
      ctx.switchToHttp().getRequest<AuthedRequest>().auth?.permissions ?? [];
    if (!required.every((p) => have.includes(p)))
      throw new ForbiddenException();
    return true;
  }
}
