import { Module } from '@nestjs/common';
import { AdmissionsModule } from '../admissions/admissions.module.js';
import { AdmissionsImport } from './admissions/admissions-import.js';
import { FeesImport } from './fees/fees-import.js';
import { StaffAttendanceImport } from './attendance/staff-attendance-import.js';
import { StudentAttendanceImport } from './attendance/student-attendance-import.js';
import { IMPORT_HANDLERS, ImportHandler } from './import-types.js';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';

const HANDLERS = [
  AdmissionsImport,
  FeesImport,
  StudentAttendanceImport,
  StaffAttendanceImport,
];

/** Excel templates and bulk imports. Each kind is a handler; the service does the shared work. */
@Module({
  imports: [AdmissionsModule],
  controllers: [ImportsController],
  providers: [
    ...HANDLERS,
    {
      provide: IMPORT_HANDLERS,
      inject: HANDLERS,
      useFactory: (...handlers: ImportHandler[]) => handlers,
    },
    ImportsService,
  ],
})
export class ImportsModule {}
