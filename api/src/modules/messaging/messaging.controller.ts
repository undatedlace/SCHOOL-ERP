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
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthContext } from '../../common/auth-context.js';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { fileResponse } from '../files/files.controller.js';
import {
  CloseConversationDto,
  ContactsQueryDto,
  ConversationDetailQueryDto,
  ListConversationsQueryDto,
  SendMessageDto,
  StartConversationDto,
} from './dto/messaging.dto.js';
import { MessagingService } from './messaging.service.js';

/**
 * Messages between a student's family and the student's teachers. The two sides take part (messages.use);
 * administrators (messages.read_all) can read every conversation, read only, and close one. Who may see a
 * conversation is decided in the service: anyone else gets "not found".
 */
@ApiTags('messages')
@Controller('messages')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get()
  list(
    @CurrentAuth() auth: AuthContext,
    @Query() q: ListConversationsQueryDto,
  ) {
    return this.messaging.list(auth, q);
  }

  @Get('unread-count')
  @RequirePermissions('messages.use')
  unread(@CurrentAuth() auth: AuthContext) {
    return this.messaging.unreadCount(auth);
  }

  /** Who the signed-in person may start a conversation with. */
  @Get('contacts')
  @RequirePermissions('messages.use')
  contacts(@CurrentAuth() auth: AuthContext, @Query() q: ContactsQueryDto) {
    return this.messaging.contacts(auth, q);
  }

  @Post()
  @RequirePermissions('messages.use')
  start(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: StartConversationDto,
    @Req() req: Request,
  ) {
    return this.messaging.start(auth, dto, req.ip);
  }

  @Get(':id/files/:fileId')
  async file(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, stream } = await this.messaging.openFile(auth, id, fileId);
    return fileResponse(res, file, stream);
  }

  @Get(':id')
  detail(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: ConversationDetailQueryDto,
    @Req() req: Request,
  ) {
    return this.messaging.detail(auth, id, q, req.ip);
  }

  @Post(':id/messages')
  @RequirePermissions('messages.use')
  send(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messaging.send(auth, id, dto);
  }

  @Post(':id/read')
  @HttpCode(200)
  read(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.messaging.markRead(auth, id);
  }

  @Post(':id/close')
  @HttpCode(200)
  @RequirePermissions('messages.read_all')
  close(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseConversationDto,
    @Req() req: Request,
  ) {
    return this.messaging.close(auth, id, dto, req.ip);
  }
}
