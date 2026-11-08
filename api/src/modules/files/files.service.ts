import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthContext } from '../../common/auth-context.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { FILE_PURPOSES } from './file-purposes.js';
import { cleanImage, UnreadableImageError } from './image-clean.js';
import { sniffImage } from './image-sniff.js';
import { checkPdf, UnsafePdfError } from './pdf-check.js';
import { FILE_STORAGE, type FileStorage } from './storage/file-storage.js';

/** The multipart part, as far as this service needs to know. */
export interface UploadedBytes {
  originalname: string;
  buffer: Buffer;
  size: number;
}

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  async upload(
    auth: AuthContext,
    purpose: string | undefined,
    file: UploadedBytes | undefined,
    ip?: string,
  ) {
    const rules = purpose ? FILE_PURPOSES[purpose] : undefined;
    if (!purpose || !rules)
      throw new BadRequestException('Unknown file purpose');
    if (!auth.permissions.includes(rules.write)) throw new ForbiddenException();
    if (!file || file.size === 0)
      throw new BadRequestException('Choose a file to upload');
    if (file.size > rules.maxBytes) {
      throw new PayloadTooLargeException(
        `The file is larger than ${Math.round(rules.maxBytes / 1024 / 1024)} MB`,
      );
    }

    // Judge the file by its content, never by its name or the type the browser claims.
    let stored: { bytes: Buffer; mime: string; ext: string };
    if (rules.kind === 'document' && isPdf(file.buffer)) {
      try {
        await checkPdf(file.buffer);
      } catch (error) {
        if (error instanceof UnsafePdfError)
          throw new UnsupportedMediaTypeException(error.message);
        throw error;
      }
      // A checked PDF is kept exactly as uploaded.
      stored = { bytes: file.buffer, mime: 'application/pdf', ext: 'pdf' };
    } else {
      const image = sniffImage(file.buffer);
      if (!image) {
        throw new UnsupportedMediaTypeException(
          rules.kind === 'document'
            ? 'Upload a PDF, or a JPEG, PNG or WebP picture'
            : 'Upload a JPEG, PNG or WebP image',
        );
      }
      // Keep only the picture: no camera or location data, upright, a sensible size.
      try {
        stored = {
          bytes: await cleanImage(file.buffer, image),
          mime: image.mime,
          ext: image.ext,
        };
      } catch (error) {
        if (error instanceof UnreadableImageError) {
          throw new UnsupportedMediaTypeException(
            'That image could not be read. Try another photograph',
          );
        }
        throw error;
      }
    }
    const bytes = stored.bytes;
    const image = { mime: stored.mime, ext: stored.ext };

    const year = new Date().getUTCFullYear();
    const storageKey = `${auth.schoolId}/${year}/${randomUUID()}.${image.ext}`;
    await this.storage.put(storageKey, bytes, image.mime);

    const record = await this.prisma.storedFile.create({
      data: {
        schoolId: auth.schoolId,
        purpose,
        storageKey,
        originalName: cleanName(file.originalname),
        mimeType: image.mime,
        sizeBytes: bytes.length,
        uploadedById: auth.userId,
      },
    });
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'files.uploaded',
      entityType: 'file',
      entityId: record.id,
      metadata: { purpose, bytes: bytes.length },
      ip,
    });
    return {
      id: record.id,
      purpose,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
    };
  }

  /** The file's details and bytes, if this user may see it. */
  async open(auth: AuthContext, id: string) {
    const file = await this.prisma.storedFile.findFirst({
      where: { id, schoolId: auth.schoolId },
    });
    // Same answer for "does not exist" and "not yours to see", so ids cannot be probed.
    if (!file) throw new NotFoundException('File not found');
    const rules = FILE_PURPOSES[file.purpose];
    if (!rules || !auth.permissions.includes(rules.read))
      throw new NotFoundException('File not found');

    return { file, stream: await this.storage.read(file.storageKey) };
  }

  /** Removes a stored file: the record first, then the bytes. */
  async remove(schoolId: string, id: string) {
    const file = await this.prisma.storedFile.findFirst({
      where: { id, schoolId },
    });
    if (!file) return;
    await this.prisma.storedFile.delete({ where: { id } });
    await this.storage.delete(file.storageKey);
  }

  /**
   * Deletes uploads that were never attached to anything: a photograph chosen on a form
   * that was then abandoned. A file counts as attached when a student, a member of staff
   * or an application refers to it. Files younger than `olderThanHours` are kept, so a
   * form someone is still filling in is not affected. With S3, every such file costs storage.
   */
  async purgeUnattached(olderThanHours = 24): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanHours * 3_600_000);
    const orphans = await this.prisma.$queryRaw<
      { id: string; school_id: string; storage_key: string }[]
    >`
      SELECT f.id, f.school_id, f.storage_key
      FROM files f
      WHERE f.created_at < ${cutoff}
        AND NOT EXISTS (SELECT 1 FROM students s WHERE s.photo_file_id = f.id)
        AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.photo_file_id = f.id)
        AND NOT EXISTS (SELECT 1 FROM student_documents d WHERE d.file_id = f.id)
        AND NOT EXISTS (
          SELECT 1 FROM applications a
          WHERE a.school_id = f.school_id AND a.answers::text LIKE '%' || f.id::text || '%'
        )
      ORDER BY f.created_at
      LIMIT 1000`;

    const perSchool = new Map<string, number>();
    let removed = 0;
    for (const file of orphans) {
      // The record goes first: a file with no record cannot be reached, while a record
      // with no bytes would show a broken picture.
      await this.prisma.storedFile.delete({ where: { id: file.id } });
      await this.storage.delete(file.storage_key);
      removed++;
      perSchool.set(file.school_id, (perSchool.get(file.school_id) ?? 0) + 1);
    }
    for (const [schoolId, count] of perSchool) {
      await this.audit.log({
        schoolId,
        action: 'files.purged_unattached',
        metadata: { count },
      });
    }
    return removed;
  }

  /** Which of these ids are real files of this purpose in this school? Used to check answers. */
  async existing(
    schoolId: string,
    purpose: string,
    ids: string[],
  ): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.prisma.storedFile.findMany({
      where: { schoolId, purpose, id: { in: ids } },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }
}

/** PDFs start with %PDF- at the very first byte. */
const isPdf = (data: Buffer) =>
  data.subarray(0, 5).toString('latin1') === '%PDF-';

/** A name that is safe to show and to put in a header. */
function cleanName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  return base.replace(/[^\w.\- ()]/g, '_').slice(0, 120) || 'file';
}
