import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { AttendanceStatus } from '../../../generated/prisma/enums.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'must be a date like 2026-11-08';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class DayQueryDto {
  /** Defaults to today. */
  @IsOptional()
  @Matches(DATE, { message: DATE_MESSAGE })
  date?: string;
}

export class RangeQueryDto {
  /** Defaults to the start of the academic year. */
  @IsOptional()
  @Matches(DATE, { message: DATE_MESSAGE })
  from?: string;

  /** Defaults to today. */
  @IsOptional()
  @Matches(DATE, { message: DATE_MESSAGE })
  to?: string;
}

export class AttendanceEntryDto {
  @IsUUID()
  studentId: string;

  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class MarkAttendanceDto {
  @Matches(DATE, { message: DATE_MESSAGE })
  date: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  entries: AttendanceEntryDto[];
}
