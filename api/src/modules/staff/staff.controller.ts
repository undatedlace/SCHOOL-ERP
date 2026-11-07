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
import {
  AccountDto,
  CreateStaffDto,
  ListStaffQueryDto,
  UpdateStaffDto,
} from './dto/staff.dto.js';
import { StaffService } from './staff.service.js';

@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  // Reading is scoped in the service: everyone with staff.read_all, otherwise only your own record.
  @Get()
  @RequirePermissions('staff.read')
  list(@CurrentAuth() auth: AuthContext, @Query() query: ListStaffQueryDto) {
    return this.staff.list(auth, query);
  }

  @Get(':id')
  @RequirePermissions('staff.read')
  findOne(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.staff.findOne(auth, id);
  }

  @Post()
  @RequirePermissions('staff.manage')
  create(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateStaffDto,
    @Req() req: Request,
  ) {
    return this.staff.create(auth, dto, req.ip);
  }

  @Patch(':id')
  @RequirePermissions('staff.manage')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
    @Req() req: Request,
  ) {
    return this.staff.update(auth, id, dto, req.ip);
  }

  @Post(':id/account')
  @RequirePermissions('staff.manage')
  @HttpCode(201)
  addAccount(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AccountDto,
    @Req() req: Request,
  ) {
    return this.staff.addAccount(auth, id, dto, req.ip);
  }
}
