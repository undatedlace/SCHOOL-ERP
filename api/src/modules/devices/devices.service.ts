import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { PrismaService } from '../../database/prisma.service.js';
import { RegisterDeviceDto } from './dto/devices.dto.js';

/** The phones that may receive push messages for a person. Everyone manages only their own. */
@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Registering again (the app does this at every start) refreshes it; a token moves to whoever signed in last. */
  register(auth: AuthContext, dto: RegisterDeviceDto) {
    const data = {
      schoolId: auth.schoolId,
      userId: auth.userId,
      platform: dto.platform,
      appVersion: dto.appVersion ?? null,
      lastSeenAt: new Date(),
    };
    return this.prisma.device.upsert({
      where: { pushToken: dto.pushToken },
      create: { ...data, pushToken: dto.pushToken },
      update: data,
      select: { id: true, platform: true, appVersion: true, lastSeenAt: true },
    });
  }

  list(auth: AuthContext) {
    return this.prisma.device.findMany({
      where: { userId: auth.userId },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, platform: true, appVersion: true, lastSeenAt: true },
    });
  }

  async remove(auth: AuthContext, id: string) {
    const res = await this.prisma.device.deleteMany({
      where: { id, userId: auth.userId },
    });
    if (res.count === 0) throw new NotFoundException();
  }
}
