import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { AttendanceService } from './attendance.service.js';
import {
  DayQueryDto,
  MarkAttendanceDto,
  RangeQueryDto,
} from './dto/attendance.dto.js';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  /** The divisions the signed-in person can take or see attendance for. */
  @Get('divisions')
  @RequirePermissions('attendance.read')
  divisions(@CurrentAuth() auth: AuthContext) {
    return this.attendance.divisions(auth);
  }

  /** Which divisions have been marked on a day. */
  @Get('overview')
  @RequirePermissions('attendance.read')
  overview(@CurrentAuth() auth: AuthContext, @Query() q: DayQueryDto) {
    return this.attendance.overview(auth, q.date);
  }

  @Get('divisions/:divisionId')
  @RequirePermissions('attendance.read')
  roster(
    @CurrentAuth() auth: AuthContext,
    @Param('divisionId', ParseUUIDPipe) divisionId: string,
    @Query() q: DayQueryDto,
  ) {
    return this.attendance.roster(auth, divisionId, q.date);
  }

  @Put('divisions/:divisionId')
  @RequirePermissions('attendance.mark')
  mark(
    @CurrentAuth() auth: AuthContext,
    @Param('divisionId', ParseUUIDPipe) divisionId: string,
    @Body() dto: MarkAttendanceDto,
  ) {
    return this.attendance.mark(auth, divisionId, dto);
  }

  @Get('divisions/:divisionId/report')
  @RequirePermissions('attendance.read')
  report(
    @CurrentAuth() auth: AuthContext,
    @Param('divisionId', ParseUUIDPipe) divisionId: string,
    @Query() q: RangeQueryDto,
  ) {
    return this.attendance.divisionReport(auth, divisionId, q);
  }

  @Get('students/:studentId')
  @RequirePermissions('attendance.read')
  student(
    @CurrentAuth() auth: AuthContext,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() q: RangeQueryDto,
  ) {
    return this.attendance.studentHistory(auth, studentId, q);
  }
}
