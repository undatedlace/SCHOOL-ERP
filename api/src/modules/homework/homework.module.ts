import { Module } from '@nestjs/common';
import { HomeworkController } from './homework.controller.js';
import { HomeworkService } from './homework.service.js';

@Module({
  controllers: [HomeworkController],
  providers: [HomeworkService],
})
export class HomeworkModule {}
