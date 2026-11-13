import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** One student's year of fees, entered by hand: the same fields as a row of the fees file. */
export class SingleFeesDto {
  @IsUUID()
  studentId: string;

  @IsUUID()
  academicYearId: string;

  /** Rupees, as text. */
  @Matches(MONEY, { message: 'billed must be an amount in rupees' })
  billed: string;

  @IsOptional()
  @Matches(MONEY, { message: 'paid must be an amount in rupees' })
  paid?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  paidOn?: string;

  @IsOptional()
  @IsEnum(['CASH', 'CHEQUE', 'UPI', 'BANK_TRANSFER'])
  mode?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  note?: string;
}
