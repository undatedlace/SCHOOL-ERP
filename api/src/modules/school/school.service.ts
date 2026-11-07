import { Injectable } from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { UpdateSchoolDto } from './dto/update-school.dto.js';

@Injectable()
export class SchoolService {
  private defaultSchoolId?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The ONE place that decides which school a request without a session
   * belongs to (login). V1 has a single school; for multi-school this is
   * what changes (for example, resolving from the subdomain).
   */
  async getDefaultSchoolId(): Promise<string> {
    if (!this.defaultSchoolId) {
      const school = await this.prisma.school.findFirstOrThrow({
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      this.defaultSchoolId = school.id;
    }
    return this.defaultSchoolId;
  }

  getCurrent(schoolId: string) {
    return this.prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        email: true,
        board: true,
      },
    });
  }

  async update(auth: AuthContext, dto: UpdateSchoolDto) {
    const updated = await this.prisma.school.update({
      where: { id: auth.schoolId },
      data: dto,
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        email: true,
        board: true,
      },
    });
    await this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action: 'school.updated',
      entityType: 'school',
      entityId: auth.schoolId,
      metadata: { fields: Object.keys(dto).join(',') },
    });
    return updated;
  }
}
