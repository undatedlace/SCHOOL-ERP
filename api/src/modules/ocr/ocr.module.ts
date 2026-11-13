import { Module } from '@nestjs/common';
import { AdmissionsModule } from '../admissions/admissions.module.js';
import { OcrClient } from './ocr-client.service.js';
import { OcrController } from './ocr.controller.js';

/** Filling admission applications from photos of the paper form (ocr-service/). */
@Module({
  imports: [AdmissionsModule],
  controllers: [OcrController],
  providers: [OcrClient],
})
export class OcrModule {}
