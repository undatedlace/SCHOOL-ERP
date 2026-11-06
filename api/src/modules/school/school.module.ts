import { Module } from '@nestjs/common';
import { SchoolService } from './school.service.js';
import { SchoolController } from './school.controller.js';

@Module({
  controllers: [SchoolController],
  providers: [SchoolService],
})
export class SchoolModule {}
