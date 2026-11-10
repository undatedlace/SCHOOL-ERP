import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from '../../common/auth-context.js';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { DocumentsService } from './documents.service.js';
import { AddDocumentDto } from './dto/documents.dto.js';

@Controller('students/:id/documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @RequirePermissions('students.documents.read')
  list(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documents.list(auth, id);
  }

  @Post()
  @RequirePermissions('students.manage')
  add(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddDocumentDto,
    @Req() req: Request,
  ) {
    return this.documents.add(auth, id, dto, req.ip);
  }

  @Delete(':documentId')
  @RequirePermissions('students.manage')
  @HttpCode(204)
  remove(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Req() req: Request,
  ) {
    return this.documents.remove(auth, id, documentId, req.ip);
  }
}
