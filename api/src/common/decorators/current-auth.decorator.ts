import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthContext, AuthedRequest } from '../auth-context.js';

/** Injects the logged-in user's context into a controller method. */
export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    return req.auth as AuthContext;
  },
);
