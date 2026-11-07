import { Module } from '@nestjs/common';
import { AcademicsController } from './academics.controller.js';
import { AcademicsService } from './academics.service.js';

@Module({
  controllers: [AcademicsController],
  providers: [AcademicsService],
  exports: [AcademicsService],
})
export class AcademicsModule {}
