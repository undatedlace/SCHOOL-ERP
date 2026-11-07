import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { PortalAccountsController } from './portal-accounts.controller.js';
import { PortalAccountsService } from './portal-accounts.service.js';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [StudentsController, PortalAccountsController],
  providers: [StudentsService, PortalAccountsService],
  exports: [StudentsService],
})
export class StudentsModule {}
