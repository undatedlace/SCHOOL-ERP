import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import type { AuthContext } from '../../common/auth-context.js';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator.js';
import { MAX_UPLOAD_BYTES } from './file-purposes.js';
import { FilesService, type UploadedBytes } from './files.service.js';

/**
 * Who may upload or see a file depends on its purpose (see file-purposes.ts),
 * so there is no fixed permission on these routes. The service checks it.
 */
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  upload(
    @CurrentAuth() auth: AuthContext,
    @UploadedFile() file: UploadedBytes | undefined,
    @Body('purpose') purpose: string | undefined,
    @Req() req: Request,
  ) {
    return this.files.upload(auth, purpose, file, req.ip);
  }

  @Get(':id')
  async download(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, stream } = await this.files.open(auth, id);
    res.set({
      // Private to this user's browser; never cached by shared proxies.
      'Cache-Control': 'private, max-age=3600',
      // The browser must treat the bytes as the declared image, never sniff them as something else.
      'X-Content-Type-Options': 'nosniff',
      // If a file is ever opened as a page, it may not run anything or load anything.
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    const isImage = file.mimeType.startsWith('image/');
    return new StreamableFile(stream, {
      type: file.mimeType,
      length: file.sizeBytes,
      // Pictures show in the page; papers are downloaded and opened in the person's own viewer.
      disposition: isImage
        ? 'inline'
        : `attachment; filename="${file.originalName.replace(/"/g, '')}"`,
    });
  }
}
