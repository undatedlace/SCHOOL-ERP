import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module.js';
import { FormsModule } from '../forms/forms.module.js';
import { StudentsModule } from '../students/students.module.js';
import { AdmissionsController } from './admissions.controller.js';
import { AdmissionsService } from './admissions.service.js';

@Module({
  imports: [FormsModule, FilesModule, StudentsModule],
  controllers: [AdmissionsController],
  providers: [AdmissionsService],
  exports: [AdmissionsService],
})
export class AdmissionsModule {}
