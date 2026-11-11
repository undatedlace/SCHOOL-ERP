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
import {
  CreateAssessmentDto,
  ListAssessmentsQueryDto,
  SaveMarksDto,
  UpdateAssessmentDto,
} from './dto/assessments.dto.js';
import { AssessmentsService } from './assessments.service.js';

/**
 * Tests and results. A teacher (marks.enter) sets a test for a subject and division they teach, enters marks and
 * publishes; an administrator (results.publish) can do this for any test. Families read published results.
 */
@Controller()
export class AssessmentsController {
  constructor(private readonly assessments: AssessmentsService) {}

  @Get('assessments/options')
  @RequirePermissions('marks.enter')
  options(@CurrentAuth() auth: AuthContext) {
    return this.assessments.options(auth);
  }

  @Get('assessments')
  @RequirePermissions('marks.enter')
  list(@CurrentAuth() auth: AuthContext, @Query() q: ListAssessmentsQueryDto) {
    return this.assessments.list(auth, q);
  }

  @Post('assessments')
  @RequirePermissions('marks.enter')
  create(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateAssessmentDto,
    @Req() req: Request,
  ) {
    return this.assessments.create(auth, dto, req.ip);
  }

  @Get('assessments/:id')
  @RequirePermissions('marks.enter')
  one(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.assessments.one(auth, id);
  }

  @Patch('assessments/:id')
  @RequirePermissions('marks.enter')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssessmentDto,
    @Req() req: Request,
  ) {
    return this.assessments.update(auth, id, dto, req.ip);
  }

  @Put('assessments/:id/marks')
  @RequirePermissions('marks.enter')
  saveMarks(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveMarksDto,
    @Req() req: Request,
  ) {
    return this.assessments.saveMarks(auth, id, dto, req.ip);
  }

  @Post('assessments/:id/publish')
  @HttpCode(200)
  @RequirePermissions('marks.enter')
  publish(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.assessments.publish(auth, id, req.ip);
  }

  @Post('assessments/:id/unpublish')
  @HttpCode(200)
  @RequirePermissions('marks.enter')
  unpublish(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.assessments.unpublish(auth, id, req.ip);
  }

  @Delete('assessments/:id')
  @HttpCode(204)
  @RequirePermissions('marks.enter')
  archive(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.assessments.archive(auth, id, req.ip);
  }

  /** Published results of one student: for their family, their teachers, and administrators. */
  @Get('results/students/:studentId')
  @RequirePermissions('results.read')
  forStudent(
    @CurrentAuth() auth: AuthContext,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.assessments.forStudent(auth, studentId);
  }
}
