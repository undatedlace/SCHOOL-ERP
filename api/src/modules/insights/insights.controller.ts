import { Controller, Get, Query } from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import {
  AttendanceInsightQueryDto,
  FeesInsightQueryDto,
} from './dto/insights.dto.js';
import { InsightsService } from './insights.service.js';

@Controller('insights')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  /** Applications and admissions for each of the last academic years. */
  @Get('admissions')
  @RequirePermissions('insights.admissions')
  admissions(@CurrentAuth() auth: AuthContext) {
    return this.insights.admissions(auth);
  }

  /** Staff who joined and left in each of the last academic years. */
  @Get('staff')
  @RequirePermissions('insights.staff')
  staff(@CurrentAuth() auth: AuthContext) {
    return this.insights.staff(auth);
  }

  /** Billed, collected and pending by class, and money received month by month. */
  @Get('fees')
  @RequirePermissions('fees.read_all')
  fees(@CurrentAuth() auth: AuthContext, @Query() q: FeesInsightQueryDto) {
    return this.insights.fees(auth, q.academicYearId);
  }

  /** Attendance over the last days, for the divisions the person may see. */
  @Get('attendance')
  @RequirePermissions('attendance.read')
  attendance(
    @CurrentAuth() auth: AuthContext,
    @Query() q: AttendanceInsightQueryDto,
  ) {
    return this.insights.attendance(auth, q.days);
  }
}
