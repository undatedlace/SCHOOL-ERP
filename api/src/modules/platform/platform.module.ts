import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { PlatformAuditService } from './platform-audit.service.js';
import { PlatformAuthService } from './platform-auth.service.js';
import { PlatformController } from './platform.controller.js';
import { PlatformGuard } from './platform.guard.js';
import { PlatformSchoolsService } from './platform-schools.service.js';

/** The platform owner: onboarding schools and their first administrators. */
@Module({
  imports: [UsersModule],
  controllers: [PlatformController],
  providers: [
    PlatformAuditService,
    PlatformAuthService,
    PlatformSchoolsService,
    PlatformGuard,
  ],
  exports: [PlatformAuthService],
})
export class PlatformModule {}
