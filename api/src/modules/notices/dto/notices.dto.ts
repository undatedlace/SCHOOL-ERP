import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto.js';
import { NoticeAudience } from '../../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ListNoticesQueryDto extends PageQueryDto {
  /**
   * active: what is showing now (the default). expired and all: only notices you may change
   * (your own, or any if you are the admin), including ones past their last day.
   */
  @IsOptional()
  @IsIn(['active', 'expired', 'all'])
  status?: 'active' | 'expired' | 'all';
}

export class CreateNoticeDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title: string;

  /** Plain text. It is shown as written, never as HTML. */
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body: string;

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

  /** The last day the notice is shown. Send null (or leave out) to keep it until archived. */
  @IsOptional()
  @Matches(DATE, { message: 'expiresOn must be a date like 2026-11-30' })
  expiresOn?: string | null;
}

export class UpdateNoticeDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body?: string;

  @IsOptional()
  @IsEnum(NoticeAudience)
  audience?: NoticeAudience;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  classIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  divisionIds?: string[];

  @IsOptional()
  @Matches(DATE, { message: 'expiresOn must be a date like 2026-11-30' })
  expiresOn?: string | null;
}
