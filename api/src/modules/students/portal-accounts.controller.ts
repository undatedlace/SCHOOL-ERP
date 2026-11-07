import {
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from '../../common/auth-context.js';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { PortalAccountsService } from './portal-accounts.service.js';

@Controller()
@RequirePermissions('portal.accounts.manage')
export class PortalAccountsController {
  constructor(private readonly accounts: PortalAccountsService) {}

  @Post('guardians/:id/account')
  createForGuardian(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.accounts.createForGuardian(auth, id, req.ip);
  }

  @Post('guardians/:id/account/reset-password')
  @HttpCode(200)
  resetForGuardian(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.accounts.resetForGuardian(auth, id, req.ip);
  }

  @Post('students/:id/account')
  createForStudent(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.accounts.createForStudent(auth, id, req.ip);
  }

  @Post('students/:id/account/reset-password')
  @HttpCode(200)
  resetForStudent(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.accounts.resetForStudent(auth, id, req.ip);
  }
}
