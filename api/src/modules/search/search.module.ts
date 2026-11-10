import { Module } from '@nestjs/common';
import { AdmissionsModule } from '../admissions/admissions.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { StudentsModule } from '../students/students.module.js';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';

@Module({
  imports: [StudentsModule, StaffModule, AdmissionsModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
