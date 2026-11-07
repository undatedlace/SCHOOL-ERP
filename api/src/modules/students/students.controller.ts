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
  GuardianInputDto,
  ListStudentsQueryDto,
  UpdateGuardianDto,
  UpdateStudentDto,
} from './dto/students.dto.js';
import { StudentsService } from './students.service.js';

@Controller()
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  // Reading is scoped in the service: school-wide with students.read_all, otherwise only your own children.
  @Get('students')
  @RequirePermissions('students.read')
  list(@CurrentAuth() auth: AuthContext, @Query() query: ListStudentsQueryDto) {
    return this.students.list(auth, query);
  }

  @Get('students/:id')
  @RequirePermissions('students.read')
  findOne(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.students.findOne(auth, id);
  }

  @Patch('students/:id')
  @RequirePermissions('students.manage')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentDto,
    @Req() req: Request,
  ) {
    return this.students.update(auth, id, dto, req.ip);
  }

  @Post('students/:id/guardians')
  @RequirePermissions('students.manage')
  addGuardian(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GuardianInputDto,
    @Req() req: Request,
  ) {
    return this.students.addGuardian(auth, id, dto, req.ip);
  }

  @Delete('students/:id/guardians/:guardianId')
  @RequirePermissions('students.manage')
  @HttpCode(204)
  unlinkGuardian(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('guardianId', ParseUUIDPipe) guardianId: string,
    @Req() req: Request,
  ) {
    return this.students.unlinkGuardian(auth, id, guardianId, req.ip);
  }

  @Patch('guardians/:id')
  @RequirePermissions('students.manage')
  updateGuardian(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGuardianDto,
    @Req() req: Request,
  ) {
    return this.students.updateGuardian(auth, id, dto, req.ip);
  }
}
