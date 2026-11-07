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
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { AcademicsService } from './academics.service.js';
import {
  CreateAcademicYearDto,
  CreateClassDto,
  CreateDivisionDto,
  CreateSubjectDto,
  UpdateAcademicYearDto,
  UpdateClassDto,
  UpdateDivisionDto,
  UpdateSubjectDto,
} from './dto/academics.dto.js';

const Uuid = () => Param('id', ParseUUIDPipe);

@Controller()
export class AcademicsController {
  constructor(private readonly academics: AcademicsService) {}

  // ---------- Academic years ----------

  @Get('academic-years')
  @RequirePermissions('academics.read')
  listYears(@CurrentAuth() auth: AuthContext) {
    return this.academics.listYears(auth.schoolId);
  }

  @Post('academic-years')
  @RequirePermissions('academics.manage')
  createYear(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateAcademicYearDto,
  ) {
    return this.academics.createYear(auth, dto);
  }

  @Patch('academic-years/:id')
  @RequirePermissions('academics.manage')
  updateYear(
    @CurrentAuth() auth: AuthContext,
    @Uuid() id: string,
    @Body() dto: UpdateAcademicYearDto,
  ) {
    return this.academics.updateYear(auth, id, dto);
  }

  @Post('academic-years/:id/set-current')
  @RequirePermissions('academics.manage')
  @HttpCode(200)
  setCurrentYear(@CurrentAuth() auth: AuthContext, @Uuid() id: string) {
    return this.academics.setCurrentYear(auth, id);
  }

  // ---------- Classes ----------

  @Get('classes')
  @RequirePermissions('academics.read')
  listClasses(@CurrentAuth() auth: AuthContext) {
    return this.academics.listClasses(auth.schoolId);
  }

  @Post('classes')
  @RequirePermissions('academics.manage')
  createClass(@CurrentAuth() auth: AuthContext, @Body() dto: CreateClassDto) {
    return this.academics.createClass(auth, dto);
  }

  @Patch('classes/:id')
  @RequirePermissions('academics.manage')
  updateClass(
    @CurrentAuth() auth: AuthContext,
    @Uuid() id: string,
    @Body() dto: UpdateClassDto,
  ) {
    return this.academics.updateClass(auth, id, dto);
  }

  @Delete('classes/:id')
  @RequirePermissions('academics.manage')
  @HttpCode(204)
  deleteClass(@CurrentAuth() auth: AuthContext, @Uuid() id: string) {
    return this.academics.deleteClass(auth, id);
  }

  // ---------- Divisions ----------

  @Post('classes/:id/divisions')
  @RequirePermissions('academics.manage')
  createDivision(
    @CurrentAuth() auth: AuthContext,
    @Uuid() classId: string,
    @Body() dto: CreateDivisionDto,
  ) {
    return this.academics.createDivision(auth, classId, dto);
  }

  @Patch('divisions/:id')
  @RequirePermissions('academics.manage')
  updateDivision(
    @CurrentAuth() auth: AuthContext,
    @Uuid() id: string,
    @Body() dto: UpdateDivisionDto,
  ) {
    return this.academics.updateDivision(auth, id, dto);
  }

  @Delete('divisions/:id')
  @RequirePermissions('academics.manage')
  @HttpCode(204)
  deleteDivision(@CurrentAuth() auth: AuthContext, @Uuid() id: string) {
    return this.academics.deleteDivision(auth, id);
  }

  // ---------- Subjects ----------

  @Get('subjects')
  @RequirePermissions('academics.read')
  listSubjects(@CurrentAuth() auth: AuthContext) {
    return this.academics.listSubjects(auth.schoolId);
  }

  @Post('subjects')
  @RequirePermissions('academics.manage')
  createSubject(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateSubjectDto,
  ) {
    return this.academics.createSubject(auth, dto);
  }

  @Patch('subjects/:id')
  @RequirePermissions('academics.manage')
  updateSubject(
    @CurrentAuth() auth: AuthContext,
    @Uuid() id: string,
    @Body() dto: UpdateSubjectDto,
  ) {
    return this.academics.updateSubject(auth, id, dto);
  }

  @Delete('subjects/:id')
  @RequirePermissions('academics.manage')
  @HttpCode(204)
  deleteSubject(@CurrentAuth() auth: AuthContext, @Uuid() id: string) {
    return this.academics.deleteSubject(auth, id);
  }
}
