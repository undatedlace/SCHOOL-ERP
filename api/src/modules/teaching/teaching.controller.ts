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
  AssignDto,
  ChangeTeacherDto,
  CopyAssignmentsDto,
  ListAssignmentsQueryDto,
} from './dto/teaching.dto.js';
import { TeachingService } from './teaching.service.js';

@Controller('teaching-assignments')
export class TeachingController {
  constructor(private readonly teaching: TeachingService) {}

  @Get()
  @RequirePermissions('academics.read')
  list(
    @CurrentAuth() auth: AuthContext,
    @Query() query: ListAssignmentsQueryDto,
  ) {
    return this.teaching.list(auth, query);
  }

  /** The signed-in teacher's own classes and subjects this year. */
  @Get('mine')
  @RequirePermissions('academics.read')
  mine(@CurrentAuth() auth: AuthContext) {
    return this.teaching.mine(auth);
  }

  @Post()
  @RequirePermissions('academics.manage')
  assign(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: AssignDto,
    @Req() req: Request,
  ) {
    return this.teaching.assign(auth, dto, req.ip);
  }

  /** Carry last year's class and subject teachers into another year. Declared before ':id' routes. */
  @Post('copy')
  @RequirePermissions('academics.manage')
  @HttpCode(200)
  copy(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CopyAssignmentsDto,
    @Req() req: Request,
  ) {
    return this.teaching.copy(auth, dto, req.ip);
  }

  @Patch(':id')
  @RequirePermissions('academics.manage')
  change(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeTeacherDto,
    @Req() req: Request,
  ) {
    return this.teaching.change(auth, id, dto.staffId, req.ip);
  }

  @Delete(':id')
  @RequirePermissions('academics.manage')
  @HttpCode(204)
  remove(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.teaching.remove(auth, id, req.ip);
  }
}
