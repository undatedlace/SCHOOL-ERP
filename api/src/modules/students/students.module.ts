import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';

@Module({
  imports: [FilesModule],
  controllers: [StudentsController, DocumentsController],
  providers: [StudentsService, DocumentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
