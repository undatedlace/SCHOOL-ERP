import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module.js';
import { MessagingController } from './messaging.controller.js';
import { MessagingService } from './messaging.service.js';

@Module({
  imports: [FilesModule],
  controllers: [MessagingController],
  providers: [MessagingService],
})
export class MessagingModule {}
