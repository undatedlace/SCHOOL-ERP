import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module.js';
import { UsersModule } from '../users/users.module.js';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';

@Module({
  imports: [UsersModule, FilesModule],
  controllers: [StaffController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
