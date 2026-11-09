import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto.js';
import { PaymentMode } from '../../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Money as the client sends it: digits with at most two decimals, as text ("1500" or "1500.50"). */
const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const MONEY_MESSAGE = 'must be an amount like 1500 or 1500.50';

// ---------- fee heads ----------

export class CreateFeeHeadDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;
}

export class UpdateFeeHeadDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;
}

// ---------- fee structures ----------

export class StructureItemDto {
  @IsUUID()
  feeHeadId: string;

  @IsString()
  @Matches(MONEY, { message: `amount ${MONEY_MESSAGE}` })
  amount: string;
}

export class StructureInstalmentDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  label: string;

  @IsDateString({ strict: true })
  dueDate: string;

  /** Share of the total, for example 25 or 33.33. All shares must add up to 100. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  percent: number;
}

export class SaveStructureDto {
  @IsUUID()
  academicYearId: string;

  @IsUUID()
  classId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => StructureItemDto)
  items: StructureItemDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => StructureInstalmentDto)
  instalments: StructureInstalmentDto[];
}

export class CopyStructuresDto {
  @IsUUID()
  fromAcademicYearId: string;

  @IsUUID()
  toAcademicYearId: string;

  /** Leave out to copy every class. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  classIds?: string[];
}

export class ListStructuresQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;
}

// ---------- invoices ----------

export class GenerateInvoicesDto {
  /** Defaults to the current academic year. */
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  divisionId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  studentIds?: string[];
}

export class OpeningBalanceDto {
  @IsUUID()
  studentId: string;

  /** The year the dues belong to (usually the one before the system started). */
  @IsUUID()
  academicYearId: string;

  @IsString()
  @Matches(MONEY, { message: `amount ${MONEY_MESSAGE}` })
  amount: string;

  @IsDateString({ strict: true })
  dueDate: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class AddConcessionDto {
  @IsString()
  @Matches(MONEY, { message: `amount ${MONEY_MESSAGE}` })
  amount: string;

  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  reason: string;
}

export class ReasonDto {
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'a reason is required' })
  @MaxLength(200)
  reason: string;
}

// ---------- payments ----------

export class AllocationDto {
  @IsUUID()
  invoiceId: string;

  @IsString()
  @Matches(MONEY, { message: `amount ${MONEY_MESSAGE}` })
  amount: string;
}

export class RecordPaymentDto {
  @IsString()
  @Matches(MONEY, { message: `amount ${MONEY_MESSAGE}` })
  amount: string;

  @IsEnum(PaymentMode)
  mode: PaymentMode;

  /** Cheque number, UPI reference or bank transaction id. Required for everything except cash. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  reference?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  bank?: string;

  /** Defaults to today. Cannot be in the future. */
  @IsOptional()
  @IsDateString({ strict: true })
  paidOn?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  note?: string;

  /** Leave out to pay the oldest dues first. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AllocationDto)
  allocations?: AllocationDto[];
}

export class ListPaymentsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  @IsOptional()
  @IsEnum(PaymentMode)
  mode?: PaymentMode;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class CollectionQueryDto {
  @IsDateString({ strict: true })
  from: string;

  @IsDateString({ strict: true })
  to: string;
}

// ---------- dues ----------

export class DuesQueryDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  divisionId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  /** Only students who owe something. */
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === 'true' || value === true,
  )
  @IsBoolean()
  onlyOwing?: boolean;
}
