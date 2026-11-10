import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  CalendarCategory,
  NoticeAudience,
} from '../../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class RangeQueryDto {
  @Matches(DATE, { message: 'from must be a date like 2026-11-01' })
  from: string;

  @Matches(DATE, { message: 'to must be a date like 2026-11-30' })
  to: string;
}

export class CreateEventDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title: string;

  /** Plain text, shown as written. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsEnum(CalendarCategory)
  category?: CalendarCategory;

  @Matches(DATE, { message: 'startsOn must be a date like 2026-12-05' })
  startsOn: string;

  /** Last day, inclusive. Leave out for a one-day event. */
  @IsOptional()
  @Matches(DATE, { message: 'endsOn must be a date like 2026-12-05' })
  endsOn?: string;

  @IsOptional()
  @Matches(TIME, { message: 'startTime must be like 09:30' })
  startTime?: string | null;

  @IsOptional()
  @Matches(TIME, { message: 'endTime must be like 11:00' })
  endTime?: string | null;

  @IsEnum(NoticeAudience)
  audience: NoticeAudience;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  @Type(() => String)
  classIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  @Type(() => String)
  divisionIds?: string[];

  /** Also post a notice about it to the same audience (only when the event is today or later). */
  @IsOptional()
  @IsBoolean()
  announce?: boolean;
}

export class UpdateEventDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsEnum(CalendarCategory)
  category?: CalendarCategory;

  @IsOptional()
  @Matches(DATE)
  startsOn?: string;

  @IsOptional()
  @Matches(DATE)
  endsOn?: string;

  @IsOptional()
  @Matches(TIME)
  startTime?: string | null;

  @IsOptional()
  @Matches(TIME)
  endTime?: string | null;

  @IsOptional()
  @IsEnum(NoticeAudience)
  audience?: NoticeAudience;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  @Type(() => String)
  classIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  @Type(() => String)
  divisionIds?: string[];
}
