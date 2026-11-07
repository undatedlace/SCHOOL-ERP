import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from '../../common/auth-context.js';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { AdmissionsService } from './admissions.service.js';
import {
  AdmitDto,
  CreateApplicationDto,
  DecisionDto,
  ListApplicationsQueryDto,
  UpdateApplicationDto,
} from './dto/admissions.dto.js';

@Controller('admissions')
export class AdmissionsController {
  constructor(private readonly admissions: AdmissionsService) {}

  /** The published admission form to fill in. */
  @Get('form')
  @RequirePermissions('admissions.read')
  form(@CurrentAuth() auth: AuthContext) {
    return this.admissions.getForm(auth.schoolId);
  }

  @Get('applications')
  @RequirePermissions('admissions.read')
  list(
    @CurrentAuth() auth: AuthContext,
    @Query() query: ListApplicationsQueryDto,
  ) {
    return this.admissions.list(auth.schoolId, query);
  }

  @Get('applications/summary')
  @RequirePermissions('admissions.read')
  summary(
    @CurrentAuth() auth: AuthContext,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.admissions.summary(auth.schoolId, academicYearId);
  }

  @Get('applications/:id')
  @RequirePermissions('admissions.read')
  findOne(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admissions.findOne(auth.schoolId, id);
  }

  @Post('applications')
  @RequirePermissions('admissions.manage')
  create(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateApplicationDto,
    @Req() req: Request,
  ) {
    return this.admissions.create(auth, dto, req.ip);
  }

  @Patch('applications/:id')
  @RequirePermissions('admissions.manage')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationDto,
    @Req() req: Request,
  ) {
    return this.admissions.update(auth, id, dto, req.ip);
  }

  @Post('applications/:id/decision')
  @RequirePermissions('admissions.manage')
  @HttpCode(200)
  decide(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecisionDto,
    @Req() req: Request,
  ) {
    return this.admissions.decide(auth, id, dto, req.ip);
  }

  /** Turns a granted application into a student. Needs both admissions and student management. */
  @Post('applications/:id/admit')
  @RequirePermissions('admissions.manage', 'students.manage')
  @HttpCode(201)
  admit(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdmitDto,
    @Req() req: Request,
  ) {
    return this.admissions.admit(auth, id, dto, req.ip);
  }
}
