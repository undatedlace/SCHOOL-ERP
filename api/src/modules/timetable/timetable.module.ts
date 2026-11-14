import { Module } from '@nestjs/common';
import { DayChangesService } from './day-changes.service.js';
import { TimetableData } from './timetable-data.js';
import { TimetableController } from './timetable.controller.js';
import { TimetableService } from './timetable.service.js';
import { TimingsService } from './timings.service.js';

@Module({
  controllers: [TimetableController],
  providers: [
    TimetableData,
    TimetableService,
    TimingsService,
    DayChangesService,
  ],
  exports: [TimetableService, TimetableData],
})
export class TimetableModule {}
