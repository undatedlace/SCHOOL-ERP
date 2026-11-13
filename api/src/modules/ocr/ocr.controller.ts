import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { AuthContext } from '../../common/auth-context.js';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AdmissionsService } from '../admissions/admissions.service.js';
import { sniffImage } from '../files/image-sniff.js';
import { OcrClient, type Photo } from './ocr-client.service.js';
import { mapOcrToForm } from './ocr-mapping.js';

const MAX_PHOTOS = 8;
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

/**
 * Reads photos of a filled-in paper admission form and returns answers for the
 * published admission form, for the office to check before saving. Nothing is
 * saved here and the photos are not kept.
 */
@Controller('admissions/ocr')
export class OcrController {
  constructor(
    private readonly ocr: OcrClient,
    private readonly admissions: AdmissionsService,
    private readonly prisma: PrismaService,
  ) {}

  /** Whether the "Fill from photos" button should be offered. */
  @Get('status')
  @RequirePermissions('admissions.manage')
  status() {
    return { available: this.ocr.configured };
  }

  @Post()
  @HttpCode(200)
  @RequirePermissions('admissions.manage')
  // Heavy work: a few forms a minute per person is plenty.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FilesInterceptor('files', MAX_PHOTOS, {
      limits: { fileSize: MAX_PHOTO_BYTES },
    }),
  )
  async read(
    @CurrentAuth() auth: AuthContext,
    @UploadedFiles() files: Photo[] | undefined,
  ) {
    if (!files?.length)
      throw new BadRequestException('Add at least one photo of the form');
    for (const f of files) {
      // Judge the type from the bytes, not the name or the browser's word for it.
      const type = sniffImage(f.buffer);
      if (!type) {
        throw new BadRequestException(
          `${f.originalname} is not a JPEG, PNG or WebP photo`,
        );
      }
      f.mimetype = type.mime;
    }
    const [form, classes, result] = await Promise.all([
      this.admissions.getForm(auth.schoolId),
      this.prisma.schoolClass.findMany({
        where: { schoolId: auth.schoolId },
        select: { id: true, name: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.ocr.extract(files),
    ]);
    return mapOcrToForm(result, form.schema, classes);
  }
}
