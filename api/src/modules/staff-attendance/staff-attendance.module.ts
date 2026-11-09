import { Module } from '@nestjs/common';
import { StaffAttendanceController } from './staff-attendance.controller.js';
import { StaffAttendanceService } from './staff-attendance.service.js';

@Module({
  controllers: [StaffAttendanceController],
  providers: [StaffAttendanceService],
})
export class StaffAttendanceModule {}
