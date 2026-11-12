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
   * The ONE place that decides which school a sign-in belongs to. With a school code, that school
   * (any status, so the caller can say it is paused); without one, the home school: the first
   * school ever created. Null for an unknown code. Later a subdomain can be resolved here too.
   */
  async resolveForSignIn(
    code?: string | null,
  ): Promise<{ id: string; status: 'ACTIVE' | 'SUSPENDED' } | null> {
    const wanted = code?.trim().toLowerCase();
    if (wanted) {
      return this.prisma.school.findUnique({
        where: { code: wanted },
        select: { id: true, status: true },
      });
    }
    const id = await this.getDefaultSchoolId();
    return this.prisma.school.findUniqueOrThrow({
      where: { id },
      select: { id: true, status: true },
    });
  }

  /** How many schools there are, so the sign-in page knows whether to offer a school code. */
  async schoolCount(): Promise<number> {
    const now = Date.now();
    if (!this.countCache || now - this.countCache.at > 60_000) {
      this.countCache = { at: now, n: await this.prisma.school.count() };
    }
    return this.countCache.n;
  }
  private countCache?: { at: number; n: number };

  /** The home school: the first school ever created. */
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
        code: true,
        address: true,
        phone: true,
        email: true,
        board: true,
        studentIdPrefix: true,
        studentIdDigits: true,
        studentEmailDomain: true,
      },
    });
  }

  async update(auth: AuthContext, dto: UpdateSchoolDto) {
    const updated = await this.prisma.school.update({
      where: { id: auth.schoolId },
      data: {
        ...dto,
        // An empty box means "none".
        ...(dto.studentIdPrefix === '' ? { studentIdPrefix: null } : {}),
        ...(dto.studentEmailDomain === '' ? { studentEmailDomain: null } : {}),
      },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        email: true,
        board: true,
        studentIdPrefix: true,
        studentIdDigits: true,
        studentEmailDomain: true,
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
