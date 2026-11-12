import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';

export interface PlatformAuditEntry {
  ownerId?: string | null;
  action: string;
  schoolId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonObject;
  ip?: string;
}

@Injectable()
export class PlatformAuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(entry: PlatformAuditEntry) {
    return this.prisma.platformAuditLog.create({ data: entry });
  }

  list(take = 100) {
    return this.prisma.platformAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
