import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from '../../common/auth-context.js';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import {
  DayQueryDto,
  MarkStaffAttendanceDto,
  RangeQueryDto,
} from './dto/staff-attendance.dto.js';
import { StaffAttendanceService } from './staff-attendance.service.js';

@Controller('staff-attendance')
export class StaffAttendanceController {
  constructor(private readonly service: StaffAttendanceService) {}

  /** Everyone working on a day, with their marks. */
  @Get()
  @RequirePermissions('staff_attendance.read_all')
  roster(@CurrentAuth() auth: AuthContext, @Query() q: DayQueryDto) {
    return this.service.roster(auth, q.date);
  }

  @Get('report')
  @RequirePermissions('staff_attendance.read_all')
  report(@CurrentAuth() auth: AuthContext, @Query() q: RangeQueryDto) {
    return this.service.report(auth, q);
  }

  /** The signed-in teacher's or staff member's own attendance. */
  @Get('me')
  @RequirePermissions('staff_attendance.read')
  mine(@CurrentAuth() auth: AuthContext, @Query() q: RangeQueryDto) {
    return this.service.mine(auth, q);
  }

  @Put()
  @RequirePermissions('staff_attendance.manage')
  mark(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: MarkStaffAttendanceDto,
    @Req() req: Request,
  ) {
    return this.service.mark(auth, dto, req.ip);
  }

  @Delete(':staffId')
  @RequirePermissions('staff_attendance.manage')
  clear(
    @CurrentAuth() auth: AuthContext,
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @Query() q: DayQueryDto,
    @Req() req: Request,
  ) {
    return this.service.clear(auth, staffId, q.date, req.ip);
  }
}
