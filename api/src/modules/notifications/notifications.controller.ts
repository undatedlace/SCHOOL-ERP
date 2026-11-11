import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { IsBoolean, IsOptional } from 'class-validator';
import type { AuthContext } from '../../common/auth-context.js';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator.js';
import { PageQueryDto } from '../../common/dto/page-query.dto.js';
import { queryBool } from '../../common/dto/filters.js';
import { NotificationsService } from './notifications.service.js';

class ListNotificationsQueryDto extends PageQueryDto {
  /** Only messages not yet read. */
  @IsOptional()
  @queryBool()
  @IsBoolean()
  unread?: boolean;
}

/** Everyone reads only their own messages, so no permission is needed beyond being signed in. */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentAuth() auth: AuthContext,
    @Query() q: ListNotificationsQueryDto,
  ) {
    return this.notifications.list(auth, q);
  }

  @Get('unread-count')
  async unread(@CurrentAuth() auth: AuthContext) {
    return { unread: await this.notifications.unreadCount(auth) };
  }

  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentAuth() auth: AuthContext) {
    return this.notifications.markAllRead(auth);
  }

  @Post(':id/read')
  @HttpCode(200)
  read(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notifications.markRead(auth, id);
  }
}
