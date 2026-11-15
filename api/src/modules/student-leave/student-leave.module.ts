import { Module } from '@nestjs/common';
import { StudentLeaveController } from './student-leave.controller.js';
import { StudentLeaveService } from './student-leave.service.js';

@Module({
  controllers: [StudentLeaveController],
  providers: [StudentLeaveService],
})
export class StudentLeaveModule {}
