import { Module } from '@nestjs/common';
import { NoticesModule } from '../notices/notices.module.js';
import { CalendarController } from './calendar.controller.js';
import { CalendarService } from './calendar.service.js';

@Module({
  imports: [NoticesModule],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
