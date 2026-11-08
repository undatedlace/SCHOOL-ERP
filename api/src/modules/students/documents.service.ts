import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { FilesService } from '../files/files.service.js';
import { AddDocumentDto } from './dto/documents.dto.js';

const PURPOSE = 'student-document';

/** Scanned papers on a student's record. Staff only. */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
  ) {}

  async list(auth: AuthContext, studentId: string) {
    await this.assertStudent(auth.schoolId, studentId);
    const rows = await this.prisma.studentDocument.findMany({
      where: { studentId, schoolId: auth.schoolId },
      orderBy: { createdAt: 'desc' },
    });
    const files = await this.prisma.storedFile.findMany({
      where: { id: { in: rows.map((r) => r.fileId) } },
      select: { id: true, mimeType: true, sizeBytes: true, originalName: true },
    });
    const byId = new Map(files.map((f) => [f.id, f]));
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      createdAt: r.createdAt,
      fileId: r.fileId,
      mimeType: byId.get(r.fileId)?.mimeType ?? null,
      sizeBytes: byId.get(r.fileId)?.sizeBytes ?? null,
      fileName: byId.get(r.fileId)?.originalName ?? null,
    }));
  }

  async add(
    auth: AuthContext,
    studentId: string,
    dto: AddDocumentDto,
    ip?: string,
  ) {
    await this.assertStudent(auth.schoolId, studentId);
    const found = await this.files.existing(auth.schoolId, PURPOSE, [
      dto.fileId,
    ]);
    if (!found.has(dto.fileId))
      throw new BadRequestException('Upload the file again');
    if (
      await this.prisma.studentDocument.findUnique({
        where: { fileId: dto.fileId },
        select: { id: true },
      })
    ) {
      throw new ConflictException('That file is already on a record');
    }

    const doc = await this.prisma.studentDocument.create({
      data: {
        schoolId: auth.schoolId,
        studentId,
        fileId: dto.fileId,
        type: dto.type,
        title: dto.title || null,
        uploadedById: auth.userId,
      },
    });
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'students.document_added',
      entityType: 'student',
      entityId: studentId,
      metadata: { type: dto.type },
      ip,
    });
    return doc;
  }

  async remove(
    auth: AuthContext,
    studentId: string,
    documentId: string,
    ip?: string,
  ) {
    const doc = await this.prisma.studentDocument.findFirst({
      where: { id: documentId, studentId, schoolId: auth.schoolId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    await this.prisma.studentDocument.delete({ where: { id: doc.id } });
    await this.files.remove(auth.schoolId, doc.fileId);
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'students.document_removed',
      entityType: 'student',
      entityId: studentId,
      metadata: { type: doc.type },
      ip,
    });
  }

  private async assertStudent(schoolId: string, id: string) {
    const s = await this.prisma.student.findFirst({
      where: { id, schoolId },
      select: { id: true },
    });
    if (!s) throw new NotFoundException('Student not found');
  }
}
