import { Controller, Get } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { PrismaService } from '../../database/prisma.service.js';

@Controller('rbac')
export class RbacController {
  constructor(private readonly prisma: PrismaService) {}

  /** Roles (with their permission codes), for the user-management screens. */
  @Get('roles')
  @RequirePermissions('users.manage')
  async roles() {
    const roles = await this.prisma.role.findMany({
      orderBy: { code: 'asc' },
      include: {
        permissions: { include: { permission: { select: { code: true } } } },
      },
    });
    return roles.map((r) => ({
      code: r.code,
      name: r.name,
      permissions: r.permissions.map((rp) => rp.permission.code).sort(),
    }));
  }
}
