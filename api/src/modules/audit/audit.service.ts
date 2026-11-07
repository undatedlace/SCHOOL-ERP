import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import {
  PageQueryDto,
  Page,
  skipTake,
} from '../../common/dto/page-query.dto.js';
import { PrismaService } from '../../database/prisma.service.js';

export interface AuditEntry {
  schoolId: string;
  actorUserId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonObject;
  ip?: string;
}

export interface AuditLogItem {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Prisma.JsonValue;
  ip: string | null;
  createdAt: Date;
  actorUserId: string | null;
  actorName: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(entry: AuditEntry) {
    return this.prisma.auditLog.create({ data: entry });
  }

  async list(
    schoolId: string,
    q: PageQueryDto & { action?: string },
  ): Promise<Page<AuditLogItem>> {
    const where: Prisma.AuditLogWhereInput = {
      schoolId,
      ...(q.action ? { action: { startsWith: q.action } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q),
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    // actor_user_id is deliberately not a foreign key (the log must outlive users),
    // so names are looked up separately.
    const actorIds = [
      ...new Set(rows.flatMap((r) => (r.actorUserId ? [r.actorUserId] : []))),
    ];
    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds }, schoolId },
      select: { id: true, fullName: true },
    });
    const names = new Map(actors.map((a) => [a.id, a.fullName]));

    return {
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        metadata: r.metadata,
        ip: r.ip,
        createdAt: r.createdAt,
        actorUserId: r.actorUserId,
        actorName: r.actorUserId ? (names.get(r.actorUserId) ?? null) : null,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
}
