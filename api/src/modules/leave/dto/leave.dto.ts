import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
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
import { DATE_MESSAGE, DATE_PATTERN } from '../../../common/dto/filters.js';
import { PageQueryDto } from '../../../common/dto/page-query.dto.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateLeaveTypeDto {
  /** For example "Casual leave", "Sick leave", "Earned leave", "Unpaid leave". */
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  /** No yearly limit, for example unpaid leave. */
  @IsOptional()
  @IsBoolean()
  unlimited?: boolean;
}

export class UpdateLeaveTypeDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsBoolean()
  unlimited?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class EntitlementItemDto {
  @IsUUID()
  leaveTypeId: string;

  /** Leave out for everyone; give a staff type to set a different allowance for that type. */
  @IsOptional()
  @IsUUID()
  staffTypeId?: string;

  /** Days a year, in whole or half days. */
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(366)
  days: number;
}

export class SaveEntitlementsDto {
  @IsUUID()
  academicYearId: string;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => EntitlementItemDto)
  items: EntitlementItemDto[];
}

export class CopyEntitlementsDto {
  @IsUUID()
  fromAcademicYearId: string;

  @IsUUID()
  toAcademicYearId: string;
}

export class YearQueryDto {
  /** Defaults to the current academic year. */
  @IsOptional()
  @IsUUID()
  academicYearId?: string;
}

export class BalanceQueryDto extends YearQueryDto {
  /** Whose balance (administrators only). Defaults to the signed-in person. */
  @IsOptional()
  @IsUUID()
  staffId?: string;
}

export class ApplyLeaveDto {
  @IsUUID()
  leaveTypeId: string;

  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  startsOn: string;

  /** Leave out for a single day. */
  @IsOptional()
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  endsOn?: string;

  @IsOptional()
  @IsBoolean()
  halfDay?: boolean;

  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'Give a reason' })
  @MaxLength(300)
  reason: string;

  /** An administrator can record leave for someone else; it is approved straight away. */
  @IsOptional()
  @IsUUID()
  staffId?: string;
}

export class DecideLeaveDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision: 'APPROVED' | 'REJECTED';

  /** Required when rejecting. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class CancelLeaveDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class ListLeaveQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'])
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

  /** Administrators only; everyone else sees their own whatever they ask. */
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @IsOptional()
  @IsUUID()
  leaveTypeId?: string;

  /** Leave touching this day or later. */
  @IsOptional()
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  from?: string;

  /** Leave touching this day or earlier. */
  @IsOptional()
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  to?: string;
}

export class LeaveCalendarQueryDto {
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  from: string;

  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  to: string;
}
