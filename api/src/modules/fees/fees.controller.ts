import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthContext } from '../../common/auth-context.js';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { DuesService } from './dues.service.js';
import {
  AddConcessionDto,
  CollectionQueryDto,
  CreateFeeHeadDto,
  DuesQueryDto,
  CopyStructuresDto,
  GenerateInvoicesDto,
  ListPaymentsQueryDto,
  ListStructuresQueryDto,
  OpeningBalanceDto,
  ReasonDto,
  RecordPaymentDto,
  SaveStructureDto,
  UpdateFeeHeadDto,
} from './dto/fees.dto.js';
import { RemindTeacherDto } from './dto/remind.dto.js';
import { FeeSetupService } from './fee-setup.service.js';
import { InvoicesService } from './invoices.service.js';
import { PaymentsService } from './payments.service.js';

/**
 * Fees. Setup and money movements need their own permissions. Reading a student's fees is
 * checked in the service: school-wide with fees.read_all, otherwise only your own child.
 */
@Controller()
export class FeesController {
  constructor(
    private readonly setup: FeeSetupService,
    private readonly invoices: InvoicesService,
    private readonly payments: PaymentsService,
    private readonly dues: DuesService,
  ) {}

  // ---------- fee heads ----------

  @Get('fee-heads')
  @RequirePermissions('fees.read_all')
  heads(@CurrentAuth() auth: AuthContext) {
    return this.setup.listHeads(auth.schoolId);
  }

  @Post('fee-heads')
  @RequirePermissions('fees.structure.manage')
  createHead(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateFeeHeadDto,
    @Req() req: Request,
  ) {
    return this.setup.createHead(auth, dto, req.ip);
  }

  @Patch('fee-heads/:id')
  @RequirePermissions('fees.structure.manage')
  updateHead(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFeeHeadDto,
    @Req() req: Request,
  ) {
    return this.setup.updateHead(auth, id, dto, req.ip);
  }

  // ---------- fee structures ----------

  @Get('fee-structures')
  @RequirePermissions('fees.read_all')
  structures(
    @CurrentAuth() auth: AuthContext,
    @Query() q: ListStructuresQueryDto,
  ) {
    return this.setup.listStructures(auth.schoolId, q.academicYearId);
  }

  @Put('fee-structures')
  @RequirePermissions('fees.structure.manage')
  saveStructure(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: SaveStructureDto,
    @Req() req: Request,
  ) {
    return this.setup.saveStructure(auth, dto, req.ip);
  }

  /** Starts a new year from an old one: copies the fee structures and moves the due dates on. */
  @Post('fee-structures/copy')
  @RequirePermissions('fees.structure.manage')
  @HttpCode(200)
  copyStructures(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CopyStructuresDto,
    @Req() req: Request,
  ) {
    return this.setup.copyStructures(auth, dto, req.ip);
  }

  // ---------- invoices and concessions ----------

  @Post('fee-invoices/generate')
  @RequirePermissions('fees.structure.manage')
  @HttpCode(200)
  generate(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: GenerateInvoicesDto,
    @Req() req: Request,
  ) {
    return this.invoices.generate(auth, dto, req.ip);
  }

  @Post('fee-invoices/opening-balance')
  @RequirePermissions('fees.structure.manage')
  openingBalance(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: OpeningBalanceDto,
    @Req() req: Request,
  ) {
    return this.invoices.openingBalance(auth, dto, req.ip);
  }

  @Post('fee-invoices/:id/concessions')
  @RequirePermissions('fees.concession.manage')
  addConcession(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddConcessionDto,
    @Req() req: Request,
  ) {
    return this.invoices.addConcession(auth, id, dto, req.ip);
  }

  @Delete('concessions/:id')
  @RequirePermissions('fees.concession.manage')
  @HttpCode(204)
  revokeConcession(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
    @Req() req: Request,
  ) {
    return this.invoices.revokeConcession(auth, id, dto, req.ip);
  }

  // ---------- a student's fees ----------

  /** Tells the student's class teacher that fees are pending. Accountant and administrators. */
  @Post('students/:id/remind-teacher')
  @HttpCode(200)
  @RequirePermissions('fees.read_all', 'fees.reminder.send')
  remindTeacher(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RemindTeacherDto,
    @Req() req: Request,
  ) {
    return this.invoices.remindClassTeacher(auth, id, dto.note, req.ip);
  }

  @Get('students/:id/fees')
  @RequirePermissions('fees.read')
  ledger(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoices.ledger(auth, id);
  }

  @Post('students/:id/payments')
  @RequirePermissions('fees.payment.create')
  record(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordPaymentDto,
    @Req() req: Request,
  ) {
    return this.payments.record(auth, id, dto, req.ip);
  }

  // ---------- payments ----------

  @Get('payments')
  @RequirePermissions('fees.read_all')
  listPayments(
    @CurrentAuth() auth: AuthContext,
    @Query() q: ListPaymentsQueryDto,
  ) {
    return this.payments.list(auth.schoolId, q);
  }

  @Get('payments/collection')
  @RequirePermissions('fees.read_all')
  collection(@CurrentAuth() auth: AuthContext, @Query() q: CollectionQueryDto) {
    return this.payments.collection(auth.schoolId, q);
  }

  @Get('payments/:id')
  @RequirePermissions('fees.read')
  payment(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.payments.detail(auth, id);
  }

  @Get('payments/:id/receipt')
  @RequirePermissions('fees.read')
  async receipt(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pdf = await this.payments.receiptPdf(auth, id);
    res.set({
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      length: pdf.length,
      disposition: 'attachment; filename="receipt.pdf"',
    });
  }

  @Post('payments/:id/reverse')
  @RequirePermissions('fees.payment.reverse')
  @HttpCode(200)
  reverse(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
    @Req() req: Request,
  ) {
    return this.payments.reverse(auth, id, dto, req.ip);
  }

  // ---------- dues ----------

  @Get('fees/dues')
  @RequirePermissions('fees.read_all')
  duesReport(@CurrentAuth() auth: AuthContext, @Query() q: DuesQueryDto) {
    return this.dues.report(auth.schoolId, q);
  }
}
