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
import { sniffImage } from './image-sniff.js';
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
    const image = sniffImage(file.buffer);
    if (!image)
      throw new UnsupportedMediaTypeException(
        'Upload a JPEG, PNG or WebP image',
      );

    const year = new Date().getUTCFullYear();
    const storageKey = `${auth.schoolId}/${year}/${randomUUID()}.${image.ext}`;
    await this.storage.put(storageKey, file.buffer, image.mime);

    const record = await this.prisma.storedFile.create({
      data: {
        schoolId: auth.schoolId,
        purpose,
        storageKey,
        originalName: cleanName(file.originalname),
        mimeType: image.mime,
        sizeBytes: file.size,
        uploadedById: auth.userId,
      },
    });
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'files.uploaded',
      entityType: 'file',
      entityId: record.id,
      metadata: { purpose, bytes: file.size },
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

/** A name that is safe to show and to put in a header. */
function cleanName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  return base.replace(/[^\w.\- ()]/g, '_').slice(0, 120) || 'file';
}
