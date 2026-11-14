import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AuthContext } from '../../common/auth-context.js';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { SingleFeesDto } from './imports.dto.js';
import { ImportsService } from './imports.service.js';

/** Excel files are small; 5 MB is thousands of rows. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Who may use which kind is decided per kind in the service (each kind has its own permissions). */
@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  /** The kinds of import this person may use. */
  @Get('kinds')
  kinds(@CurrentAuth() auth: AuthContext) {
    return this.imports.kinds(auth);
  }

  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query('kind') kind?: string) {
    return this.imports.list(auth, kind);
  }

  /** One student's year of fees (billed and paid), typed in on the student's page. */
  @Post('fees/single')
  @HttpCode(201)
  @RequirePermissions('fees.structure.manage', 'fees.payment.create')
  singleFees(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: SingleFeesDto,
    @Req() req: Request,
  ) {
    return this.imports.singleFees(auth, dto, req.ip);
  }

  @Get(':kind/template')
  async template(
    @CurrentAuth() auth: AuthContext,
    @Param('kind') kind: string,
    @Query() query: Record<string, string>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.imports.template(auth, kind, query);
    return this.send(res, file);
  }

  /** Uploads a filled-in template. Nothing is imported yet: the answer is the check report. */
  @Post(':kind/check')
  @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }),
  )
  check(
    @CurrentAuth() auth: AuthContext,
    @Param('kind') kind: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
  ) {
    return this.imports.check(auth, kind, file);
  }

  @Get('batches/:id')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.imports.get(auth, id);
  }

  /** Imports the rows that passed the check. Works once per batch. */
  @Post('batches/:id/run')
  @HttpCode(200)
  run(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.imports.run(auth, id, req.ip);
  }

  @Delete('batches/:id')
  @HttpCode(204)
  cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.imports.cancel(auth, id);
  }

  /** The rows that did not go in, in the template, with an "Error" column. */
  @Get('batches/:id/problems')
  async problems(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.send(res, await this.imports.problemsFile(auth, id));
  }

  private send(res: Response, file: { fileName: string; buffer: Buffer }) {
    res.set({
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    const safe = file.fileName.replace(/[^A-Za-z0-9._-]/g, '-');
    return new StreamableFile(file.buffer, {
      type: XLSX,
      length: file.buffer.length,
      disposition: `attachment; filename="${safe}"`,
    });
  }
}
