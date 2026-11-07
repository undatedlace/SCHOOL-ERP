import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { DatabaseModule } from './database/database.module.js';
import { AcademicsModule } from './modules/academics/academics.module.js';
import { AdmissionsModule } from './modules/admissions/admissions.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { FormsModule } from './modules/forms/forms.module.js';
import { SessionGuard } from './modules/auth/session.guard.js';
import { PermissionsGuard } from './modules/rbac/permissions.guard.js';
import { RbacModule } from './modules/rbac/rbac.module.js';
import { SchoolModule } from './modules/school/school.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // Tests make many logins from one address; rate limiting is verified separately.
        skipIf: () => config.get('NODE_ENV') === 'test',
        throttlers: [{ ttl: 60_000, limit: 100 }],
      }),
    }),
    DatabaseModule,
    AuditModule,
    SchoolModule,
    AuthModule,
    RbacModule,
    UsersModule,
    AcademicsModule,
    FormsModule,
    FilesModule,
    AdmissionsModule,
  ],
  controllers: [AppController],
  providers: [
    // Order matters: rate limit, then "who are you", then "what may you do".
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
