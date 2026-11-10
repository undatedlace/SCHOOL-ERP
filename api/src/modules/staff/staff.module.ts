import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module.js';
import { FormsModule } from '../forms/forms.module.js';
import { UsersModule } from '../users/users.module.js';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';
import { StaffTypesController } from './staff-types.controller.js';
import { StaffTypesService } from './staff-types.service.js';

@Module({
  imports: [UsersModule, FilesModule, FormsModule],
  controllers: [StaffController, StaffTypesController],
  providers: [StaffService, StaffTypesService],
  exports: [StaffService],
})
export class StaffModule {}
