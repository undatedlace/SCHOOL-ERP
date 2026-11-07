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
  CreateUserDto,
  ListUsersQueryDto,
  UpdateUserDto,
} from './dto/user.dto.js';
import { UsersService } from './users.service.js';

@Controller('users')
@RequirePermissions('users.manage')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query() query: ListUsersQueryDto) {
    return this.users.list(auth.schoolId, query);
  }

  @Get(':id')
  findOne(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.findOne(auth.schoolId, id);
  }

  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateUserDto,
    @Req() req: Request,
  ) {
    return this.users.create(auth, dto, req.ip);
  }

  @Patch(':id')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: Request,
  ) {
    return this.users.update(auth, id, dto, req.ip);
  }
}
