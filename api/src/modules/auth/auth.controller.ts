import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AuthContext } from '../../common/auth-context.js';
import { AllowPasswordChange } from '../../common/decorators/allow-password-change.decorator.js';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { isMobileClient } from '../../common/bearer.js';
import { SESSION_COOKIE, sessionCookieOptions } from './auth.constants.js';
import { AuthService, IssuedSession } from './auth.service.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(
      dto.identifier,
      dto.password,
      this.client(req),
    );
    if (isMobileClient(req)) {
      // The app keeps the token itself (in the phone's secure storage), so no cookie is set.
      return {
        mustChangePassword: result.mustChangePassword,
        token: result.token,
        expiresInMs: result.maxAgeMs,
      };
    }
    this.setCookie(res, result);
    return { mustChangePassword: result.mustChangePassword };
  }

  @Post('logout')
  @AllowPasswordChange()
  @HttpCode(204)
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(auth);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  @AllowPasswordChange()
  me(@CurrentAuth() auth: AuthContext) {
    return {
      id: auth.userId,
      fullName: auth.fullName,
      roles: auth.roles,
      permissions: auth.permissions,
      mustChangePassword: auth.mustChangePassword,
    };
  }

  @Post('change-password')
  @AllowPasswordChange()
  async changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = await this.auth.changePassword(
      auth,
      dto.currentPassword,
      dto.newPassword,
      this.client(req),
    );
    if (isMobileClient(req)) {
      // The mobile app holds the token itself, so it gets the new one in the body.
      res
        .status(200)
        .json({ token: session.token, expiresInMs: session.maxAgeMs });
      return;
    }
    this.setCookie(res, session);
    res.status(204).end();
  }

  @Post('users/:id/reset-password')
  @RequirePermissions('users.manage')
  @HttpCode(200)
  resetPassword(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.auth.resetPassword(auth, id, req.ip);
  }

  private client(req: Request) {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }

  private setCookie(res: Response, session: IssuedSession) {
    res.cookie(
      SESSION_COOKIE,
      session.token,
      sessionCookieOptions(
        this.config.get('NODE_ENV') === 'production',
        session.maxAgeMs,
      ),
    );
  }
}
