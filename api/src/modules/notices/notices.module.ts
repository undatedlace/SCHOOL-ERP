import { Module } from '@nestjs/common';
import { NoticesController } from './notices.controller.js';
import { NoticesService } from './notices.service.js';

@Module({
  controllers: [NoticesController],
  providers: [NoticesService],
})
export class NoticesModule {}
