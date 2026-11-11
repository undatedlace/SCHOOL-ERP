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
  Query,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthContext } from '../../common/auth-context.js';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { fileResponse } from '../files/files.controller.js';
import {
  CreateHomeworkDto,
  ListHomeworkQueryDto,
  ReviewHomeworkDto,
  SubmitHomeworkDto,
  UpdateHomeworkDto,
} from './dto/homework.dto.js';
import { HomeworkSubmissionsService } from './homework-submissions.service.js';
import { HomeworkService } from './homework.service.js';

/**
 * Homework and assignments. Teachers (homework.manage) set them for the divisions they teach and for students
 * in those divisions; administrators (homework.manage_all) for anyone. Parents and students (homework.read)
 * see what is set for their children.
 */
@Controller('homework')
export class HomeworkController {
  constructor(
    private readonly homework: HomeworkService,
    private readonly submissions: HomeworkSubmissionsService,
  ) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query() q: ListHomeworkQueryDto) {
    return this.homework.list(auth, q);
  }

  /** Divisions the signed-in person may set homework for. */
  @Get('audiences')
  @RequirePermissions('homework.manage')
  audiences(@CurrentAuth() auth: AuthContext) {
    return this.homework.audiences(auth);
  }

  @Get(':id/files/:fileId')
  async file(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, stream } = await this.submissions.openFile(auth, id, fileId);
    return fileResponse(res, file, stream);
  }

  /** Everyone the homework reaches with their hand-in. The author or an administrator. */
  @Get(':id/hand-ins')
  @RequirePermissions('homework.manage')
  handIns(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.submissions.roster(auth, id);
  }

  /** A parent or student hands work in (or hands in again). */
  @Put(':id/students/:studentId/hand-in')
  @RequirePermissions('homework.read')
  handIn(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: SubmitHomeworkDto,
    @Req() req: Request,
  ) {
    return this.submissions.submit(auth, id, studentId, dto, req.ip);
  }

  @Delete(':id/students/:studentId/hand-in')
  @HttpCode(204)
  @RequirePermissions('homework.read')
  withdraw(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Req() req: Request,
  ) {
    return this.submissions.withdraw(auth, id, studentId, req.ip);
  }

  /** The teacher marks a hand-in, or sends it back to be done again. */
  @Put(':id/students/:studentId/review')
  @RequirePermissions('homework.manage')
  review(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: ReviewHomeworkDto,
    @Req() req: Request,
  ) {
    return this.submissions.review(auth, id, studentId, dto, req.ip);
  }

  @Get(':id')
  one(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.homework.one(auth, id);
  }

  @Post()
  @RequirePermissions('homework.manage')
  create(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateHomeworkDto,
    @Req() req: Request,
  ) {
    return this.homework.create(auth, dto, req.ip);
  }

  @Patch(':id')
  @RequirePermissions('homework.manage')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHomeworkDto,
    @Req() req: Request,
  ) {
    return this.homework.update(auth, id, dto, req.ip);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('homework.manage')
  archive(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.homework.archive(auth, id, req.ip);
  }
}
