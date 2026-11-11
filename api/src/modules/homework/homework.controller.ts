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
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from '../../common/auth-context.js';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import {
  CreateHomeworkDto,
  ListHomeworkQueryDto,
  UpdateHomeworkDto,
} from './dto/homework.dto.js';
import { HomeworkService } from './homework.service.js';

/**
 * Homework and assignments. Teachers (homework.manage) set them for the divisions they teach and for students
 * in those divisions; administrators (homework.manage_all) for anyone. Parents and students (homework.read)
 * see what is set for their children.
 */
@Controller('homework')
export class HomeworkController {
  constructor(private readonly homework: HomeworkService) {}

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
