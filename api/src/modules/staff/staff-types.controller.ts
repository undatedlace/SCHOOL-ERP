import {
  Body,
  Controller,
  Get,
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
  CreateStaffTypeDto,
  UpdateStaffTypeDto,
} from './dto/staff-types.dto.js';
import { StaffTypesService } from './staff-types.service.js';

@Controller('staff-types')
export class StaffTypesController {
  constructor(private readonly types: StaffTypesService) {}

  /** Active types for everyone who reads staff; `all=true` (including switched-off ones) for those who set them up. */
  @Get()
  @RequirePermissions('staff.read')
  list(@CurrentAuth() auth: AuthContext, @Query('all') all?: string) {
    const wantsAll =
      all === 'true' && auth.permissions.includes('forms.manage');
    return this.types.list(auth.schoolId, wantsAll);
  }

  /** The questions to ask when adding or changing staff of this type (administrators only). */
  @Get(':id/form')
  @RequirePermissions('staff.manage')
  form(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.types.form(auth.schoolId, id);
  }

  @Post()
  @RequirePermissions('forms.manage')
  create(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateStaffTypeDto,
    @Req() req: Request,
  ) {
    return this.types.create(auth, dto, req.ip);
  }

  @Patch(':id')
  @RequirePermissions('forms.manage')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffTypeDto,
    @Req() req: Request,
  ) {
    return this.types.update(auth, id, dto, req.ip);
  }
}
