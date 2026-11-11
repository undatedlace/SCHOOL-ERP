import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module.js';
import { HomeworkController } from './homework.controller.js';
import { HomeworkSubmissionsService } from './homework-submissions.service.js';
import { HomeworkService } from './homework.service.js';

@Module({
  imports: [FilesModule],
  controllers: [HomeworkController],
  providers: [HomeworkService, HomeworkSubmissionsService],
})
export class HomeworkModule {}
