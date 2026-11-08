import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FilesModule } from '../files/files.module.js';
import { UsersModule } from '../users/users.module.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { PortalAccountsController } from './portal-accounts.controller.js';
import { PortalAccountsService } from './portal-accounts.service.js';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';

@Module({
  imports: [AuthModule, UsersModule, FilesModule],
  controllers: [
    StudentsController,
    PortalAccountsController,
    DocumentsController,
  ],
  providers: [StudentsService, PortalAccountsService, DocumentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
