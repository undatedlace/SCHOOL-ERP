import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AllowPasswordChange } from '../../common/decorators/allow-password-change.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import {
  AddSchoolAdminDto,
  OnboardSchoolDto,
  PlatformChangePasswordDto,
  PlatformLoginDto,
  UpdatePlatformSchoolDto,
} from './dto/platform.dto.js';
import type { OwnerContext } from './platform.constants.js';
import {
  PLATFORM_COOKIE,
  PLATFORM_COOKIE_PATH,
  PLATFORM_SESSION_MS,
  platformCookieOptions,
} from './platform.constants.js';
import { CurrentOwner, PlatformGuard, PlatformOpen } from './platform.guard.js';
import { PlatformAuditService } from './platform-audit.service.js';
import { PlatformAuthService } from './platform-auth.service.js';
import { PlatformSchoolsService } from './platform-schools.service.js';

/**
 * The platform owner's API. @Public only lifts the school sign-in requirement: every route here
 * is guarded by the owner's own session instead (PlatformGuard).
 */
@Public()
@UseGuards(PlatformGuard)
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly auth: PlatformAuthService,
    private readonly schools: PlatformSchoolsService,
    private readonly audit: PlatformAuditService,
    private readonly config: ConfigService,
  ) {}

  @PlatformOpen()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('auth/login')
  @HttpCode(200)
  async login(
    @Body() dto: PlatformLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, mustChangePassword } = await this.auth.login(
      dto.email,
      dto.password,
      this.client(req),
    );
    this.setCookie(res, token);
    return { mustChangePassword };
  }

  @AllowPasswordChange()
  @Post('auth/logout')
  @HttpCode(204)
  async logout(
    @CurrentOwner() owner: OwnerContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(owner);
    res.clearCookie(PLATFORM_COOKIE, { path: PLATFORM_COOKIE_PATH });
  }

  @AllowPasswordChange()
  @Get('auth/me')
  me(@CurrentOwner() owner: OwnerContext) {
    return {
      id: owner.ownerId,
      fullName: owner.fullName,
      email: owner.email,
      mustChangePassword: owner.mustChangePassword,
    };
  }

  @AllowPasswordChange()
  @Post('auth/change-password')
  @HttpCode(204)
  async changePassword(
    @CurrentOwner() owner: OwnerContext,
    @Body() dto: PlatformChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = await this.auth.changePassword(
      owner,
      dto.currentPassword,
      dto.newPassword,
      this.client(req),
    );
    this.setCookie(res, token);
  }

  @Get('schools')
  list() {
    return this.schools.list();
  }

  @Post('schools')
  onboard(
    @CurrentOwner() owner: OwnerContext,
    @Body() dto: OnboardSchoolDto,
    @Req() req: Request,
  ) {
    return this.schools.onboard(owner, dto, req.ip);
  }

  @Get('schools/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.schools.get(id);
  }

  @Patch('schools/:id')
  update(
    @CurrentOwner() owner: OwnerContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlatformSchoolDto,
    @Req() req: Request,
  ) {
    return this.schools.update(owner, id, dto, req.ip);
  }

  @Post('schools/:id/suspend')
  @HttpCode(200)
  suspend(
    @CurrentOwner() owner: OwnerContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.schools.setStatus(owner, id, 'SUSPENDED', req.ip);
  }

  @Post('schools/:id/resume')
  @HttpCode(200)
  resume(
    @CurrentOwner() owner: OwnerContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.schools.setStatus(owner, id, 'ACTIVE', req.ip);
  }

  @Post('schools/:id/admins')
  addAdmin(
    @CurrentOwner() owner: OwnerContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddSchoolAdminDto,
    @Req() req: Request,
  ) {
    return this.schools.addAdmin(owner, id, dto, req.ip);
  }

  @Post('schools/:id/admins/:userId/reset-password')
  @HttpCode(200)
  resetAdminPassword(
    @CurrentOwner() owner: OwnerContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: Request,
  ) {
    return this.schools.resetAdminPassword(owner, id, userId, req.ip);
  }

  @Get('audit')
  auditLog() {
    return this.audit.list();
  }

  private client(req: Request) {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }

  private setCookie(res: Response, token: string) {
    res.cookie(
      PLATFORM_COOKIE,
      token,
      platformCookieOptions(
        this.config.get('NODE_ENV') === 'production',
        PLATFORM_SESSION_MS,
      ),
    );
  }
}
