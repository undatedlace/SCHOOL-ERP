import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from '../../common/auth-context.js';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import {
  ApplyLeaveDto,
  BalanceQueryDto,
  CancelLeaveDto,
  CopyEntitlementsDto,
  CreateLeaveTypeDto,
  DecideLeaveDto,
  LeaveCalendarQueryDto,
  ListLeaveQueryDto,
  SaveEntitlementsDto,
  UpdateLeaveTypeDto,
  YearQueryDto,
} from './dto/leave.dto.js';
import { LeaveService } from './leave.service.js';

/**
 * Staff leave. A member of staff (leave.apply) asks for leave and sees their own; the Super Admin or
 * School Admin (leave.manage) sets the kinds and the yearly allowance, decides requests and can record leave.
 */
@Controller('leave')
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Get('types')
  @RequirePermissions('leave.apply')
  types(@CurrentAuth() auth: AuthContext, @Query('all') all?: string) {
    const wantsAll =
      all === 'true' && auth.permissions.includes('leave.manage');
    return this.leave.types(auth.schoolId, wantsAll);
  }

  @Post('types')
  @RequirePermissions('leave.manage')
  createType(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateLeaveTypeDto,
    @Req() req: Request,
  ) {
    return this.leave.createType(auth, dto, req.ip);
  }

  @Patch('types/:id')
  @RequirePermissions('leave.manage')
  updateType(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeaveTypeDto,
    @Req() req: Request,
  ) {
    return this.leave.updateType(auth, id, dto, req.ip);
  }

  @Get('entitlements')
  @RequirePermissions('leave.manage')
  entitlements(@CurrentAuth() auth: AuthContext, @Query() q: YearQueryDto) {
    return this.leave.entitlements(auth.schoolId, q.academicYearId);
  }

  @Put('entitlements')
  @RequirePermissions('leave.manage')
  saveEntitlements(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: SaveEntitlementsDto,
    @Req() req: Request,
  ) {
    return this.leave.saveEntitlements(auth, dto, req.ip);
  }

  @Post('entitlements/copy')
  @HttpCode(200)
  @RequirePermissions('leave.manage')
  copyEntitlements(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CopyEntitlementsDto,
    @Req() req: Request,
  ) {
    return this.leave.copyEntitlements(
      auth,
      dto.fromAcademicYearId,
      dto.toAcademicYearId,
      req.ip,
    );
  }

  @Get('balance')
  @RequirePermissions('leave.apply')
  balance(@CurrentAuth() auth: AuthContext, @Query() q: BalanceQueryDto) {
    return this.leave.balance(auth, q);
  }

  @Get('requests')
  @RequirePermissions('leave.apply')
  list(@CurrentAuth() auth: AuthContext, @Query() q: ListLeaveQueryDto) {
    return this.leave.list(auth, q);
  }

  @Post('requests')
  @RequirePermissions('leave.apply')
  apply(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: ApplyLeaveDto,
    @Req() req: Request,
  ) {
    return this.leave.apply(auth, dto, req.ip);
  }

  @Post('requests/:id/decision')
  @HttpCode(200)
  @RequirePermissions('leave.manage')
  decide(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideLeaveDto,
    @Req() req: Request,
  ) {
    return this.leave.decide(auth, id, dto, req.ip);
  }

  @Post('requests/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('leave.apply')
  cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelLeaveDto,
    @Req() req: Request,
  ) {
    return this.leave.cancel(auth, id, dto.note, req.ip);
  }

  @Get('calendar')
  @RequirePermissions('leave.apply')
  calendar(
    @CurrentAuth() auth: AuthContext,
    @Query() q: LeaveCalendarQueryDto,
  ) {
    return this.leave.calendar(auth, q.from, q.to);
  }
}
