import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthContext } from '../../common/auth-context.js';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import {
  DecideStudentLeaveDto,
  ListStudentLeaveQueryDto,
  PreviewStudentLeaveQueryDto,
  RequestStudentLeaveDto,
} from './dto/student-leave.dto.js';
import { StudentLeaveService } from './student-leave.service.js';

/**
 * Student leave ("Report absence"). A family login (student_leave.request) asks for a child and may
 * withdraw; the class teacher (student_leave.decide) or an administrator (student_leave.decide_all)
 * decides; student_leave.read_all lets office staff look. Who sees what is decided in the service.
 */
@ApiTags('student-leave')
@Controller('student-leave')
export class StudentLeaveController {
  constructor(private readonly leave: StudentLeaveService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query() q: ListStudentLeaveQueryDto) {
    return this.leave.list(auth, q);
  }

  /** What a request would count (declared before ":id" so "preview" is not read as an id). */
  @Get('preview')
  @RequirePermissions('student_leave.request')
  preview(
    @CurrentAuth() auth: AuthContext,
    @Query() q: PreviewStudentLeaveQueryDto,
  ) {
    return this.leave.preview(auth, q);
  }

  @Post()
  @RequirePermissions('student_leave.request')
  request(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: RequestStudentLeaveDto,
    @Req() req: Request,
  ) {
    return this.leave.request(auth, dto, req.ip);
  }

  @Get(':id')
  one(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.leave.one(auth, id);
  }

  @Post(':id/decision')
  @HttpCode(200)
  decide(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideStudentLeaveDto,
    @Req() req: Request,
  ) {
    return this.leave.decide(auth, id, dto, req.ip);
  }

  @Post(':id/withdraw')
  @HttpCode(200)
  withdraw(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.leave.withdraw(auth, id, req.ip);
  }
}
