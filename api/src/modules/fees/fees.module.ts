import { Module } from '@nestjs/common';
import { StudentsModule } from '../students/students.module.js';
import { DuesService } from './dues.service.js';
import { FeeSetupService } from './fee-setup.service.js';
import { FeesController } from './fees.controller.js';
import { InvoicesService } from './invoices.service.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [StudentsModule],
  controllers: [FeesController],
  providers: [FeeSetupService, InvoicesService, PaymentsService, DuesService],
  exports: [DuesService],
})
export class FeesModule {}
