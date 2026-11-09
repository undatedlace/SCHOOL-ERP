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
  CreateNoticeDto,
  ListNoticesQueryDto,
  UpdateNoticeDto,
} from './dto/notices.dto.js';
import { NoticesService } from './notices.service.js';

@Controller('notices')
export class NoticesController {
  constructor(private readonly notices: NoticesService) {}

  @Get()
  @RequirePermissions('notices.read')
  list(@CurrentAuth() auth: AuthContext, @Query() q: ListNoticesQueryDto) {
    return this.notices.list(auth, q);
  }

  /** Who the signed-in person may send a notice to. */
  @Get('audiences')
  @RequirePermissions('notices.create')
  audiences(@CurrentAuth() auth: AuthContext) {
    return this.notices.audiences(auth);
  }

  @Get(':id')
  @RequirePermissions('notices.read')
  one(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notices.one(auth, id);
  }

  @Post()
  @RequirePermissions('notices.create')
  create(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateNoticeDto,
    @Req() req: Request,
  ) {
    return this.notices.create(auth, dto, req.ip);
  }

  @Patch(':id')
  @RequirePermissions('notices.create')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNoticeDto,
    @Req() req: Request,
  ) {
    return this.notices.update(auth, id, dto, req.ip);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('notices.create')
  archive(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.notices.archive(auth, id, req.ip);
  }
}
