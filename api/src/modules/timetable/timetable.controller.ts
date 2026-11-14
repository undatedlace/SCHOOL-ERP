import {
  Body,
  Controller,
  Delete,
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
import { DayChangesService } from './day-changes.service.js';
import {
  CopyTimetableDto,
  CreateAdjustmentDto,
  CreateScheduleDto,
  DayQueryDto,
  FreeTeachersQueryDto,
  GenerateSlotsDto,
  ReassignDto,
  ReplaceSlotsDto,
  ScheduleQueryDto,
  SetClassSchedulesDto,
  SetEntriesDto,
  UpdateScheduleDto,
  WeekQueryDto,
} from './dto/timetable.dto.js';
import { TimetableService } from './timetable.service.js';
import { TimingsService } from './timings.service.js';

@Controller('timetable')
export class TimetableController {
  constructor(
    private readonly timetable: TimetableService,
    private readonly timings: TimingsService,
    private readonly days: DayChangesService,
  ) {}

  // ---------- timings ----------

  @Get('schedules')
  @RequirePermissions('timetable.manage')
  schedules(@CurrentAuth() auth: AuthContext, @Query() q: ScheduleQueryDto) {
    return this.timings.list(auth, q.academicYearId);
  }

  /** Works out a school day from a few numbers, without saving. */
  @Post('schedules/preview')
  @RequirePermissions('timetable.manage')
  @HttpCode(200)
  preview(@Body() dto: GenerateSlotsDto) {
    return this.timings.preview(dto);
  }

  @Post('schedules')
  @RequirePermissions('timetable.manage')
  createSchedule(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateScheduleDto,
    @Req() req: Request,
  ) {
    return this.timings.create(auth, dto, req.ip);
  }

  @Patch('schedules/:id')
  @RequirePermissions('timetable.manage')
  updateSchedule(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateScheduleDto,
    @Req() req: Request,
  ) {
    return this.timings.update(auth, id, dto, req.ip);
  }

  @Delete('schedules/:id')
  @RequirePermissions('timetable.manage')
  @HttpCode(204)
  removeSchedule(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.timings.remove(auth, id, req.ip);
  }

  @Put('schedules/:id/slots')
  @RequirePermissions('timetable.manage')
  replaceSlots(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceSlotsDto,
    @Req() req: Request,
  ) {
    return this.timings.replaceSlots(auth, id, dto, req.ip);
  }

  @Put('class-schedules')
  @RequirePermissions('timetable.manage')
  setClassSchedules(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: SetClassSchedulesDto,
    @Req() req: Request,
  ) {
    return this.timings.setClassSchedules(auth, dto, req.ip);
  }

  // ---------- the week ----------

  /** Divisions this person may open: every one for staff, their children's for families. */
  @Get('divisions')
  @RequirePermissions('timetable.read')
  divisions(@CurrentAuth() auth: AuthContext) {
    return this.timetable.divisions(auth);
  }

  @Get('divisions/:id')
  @RequirePermissions('timetable.read')
  divisionWeek(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: WeekQueryDto,
  ) {
    return this.timetable.divisionWeek(auth, id, q.weekOf);
  }

  @Put('divisions/:id/entries')
  @RequirePermissions('timetable.manage')
  setEntries(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetEntriesDto,
    @Req() req: Request,
  ) {
    return this.timetable.setEntries(auth, id, dto, req.ip);
  }

  @Delete('divisions/:id/entries')
  @RequirePermissions('timetable.manage')
  clearDivision(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.timetable.clearDivision(auth, id, req.ip);
  }

  @Get('mine')
  @RequirePermissions('timetable.read')
  mine(@CurrentAuth() auth: AuthContext, @Query() q: WeekQueryDto) {
    return this.timetable.mine(auth, q.weekOf);
  }

  /** A teacher's week: administrators see anyone's, a teacher only their own. */
  @Get('staff/:id')
  @RequirePermissions('timetable.read')
  staffWeek(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: WeekQueryDto,
  ) {
    return this.timetable.staffWeek(auth, id, q.weekOf);
  }

  @Post('reassign')
  @RequirePermissions('timetable.manage')
  @HttpCode(200)
  reassign(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: ReassignDto,
    @Req() req: Request,
  ) {
    return this.timetable.reassign(auth, dto, req.ip);
  }

  @Post('copy')
  @RequirePermissions('timetable.manage')
  @HttpCode(200)
  copy(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CopyTimetableDto,
    @Req() req: Request,
  ) {
    return this.timetable.copy(auth, dto, req.ip);
  }

  // ---------- one day ----------

  @Get('day')
  @RequirePermissions('timetable.manage')
  day(@CurrentAuth() auth: AuthContext, @Query() q: DayQueryDto) {
    return this.days.day(auth, q.date);
  }

  @Get('free-teachers')
  @RequirePermissions('timetable.manage')
  freeTeachers(
    @CurrentAuth() auth: AuthContext,
    @Query() q: FreeTeachersQueryDto,
  ) {
    return this.days.freeTeachers(auth, q.date, q.divisionId, q.slotId);
  }

  @Post('adjustments')
  @RequirePermissions('timetable.manage')
  createAdjustment(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateAdjustmentDto,
    @Req() req: Request,
  ) {
    return this.days.create(auth, dto, req.ip);
  }

  @Delete('adjustments/:id')
  @RequirePermissions('timetable.manage')
  @HttpCode(204)
  removeAdjustment(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.days.remove(auth, id, req.ip);
  }
}
