import { Module } from '@nestjs/common';
import { FormsModule } from '../forms/forms.module.js';
import { AdmissionsController } from './admissions.controller.js';
import { AdmissionsService } from './admissions.service.js';

@Module({
  imports: [FormsModule],
  controllers: [AdmissionsController],
  providers: [AdmissionsService],
})
export class AdmissionsModule {}
