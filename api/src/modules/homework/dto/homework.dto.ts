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
} from 'class-validator';
import { DATE_MESSAGE, DATE_PATTERN } from '../../../common/dto/filters.js';
import { PageQueryDto } from '../../../common/dto/page-query.dto.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateHomeworkDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  title: string;

  /** Plain text, shown exactly as written. */
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  instructions: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  /** The last day to hand it in. */
  @IsOptional()
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  dueOn?: string;

  /** Whether students hand work in through the app. */
  @IsOptional()
  @IsBoolean()
  handIn?: boolean;

  /** Marks are given out of this number when a hand-in is marked. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1000)
  maxMarks?: number;

  /** Files uploaded with the purpose "homework-attachment" (worksheets, pictures). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID('all', { each: true })
  @Type(() => String)
  attachmentFileIds?: string[];

  /** Whole divisions it goes to. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  @Type(() => String)
  divisionIds?: string[];

  /** Individual students it goes to (with or without divisions). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  @Type(() => String)
  studentIds?: string[];
}

export class UpdateHomeworkDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  instructions?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  /** Send an empty value to remove the due date. */
  @IsOptional()
  @Matches(/^(\d{4}-\d{2}-\d{2})?$/, { message: DATE_MESSAGE })
  dueOn?: string;

  /** Whether students hand work in through the app. */
  @IsOptional()
  @IsBoolean()
  handIn?: boolean;

  /** Marks are given out of this number when a hand-in is marked. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1000)
  maxMarks?: number;

  /** Files uploaded with the purpose "homework-attachment" (worksheets, pictures). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID('all', { each: true })
  @Type(() => String)
  attachmentFileIds?: string[];
}

export class ListHomeworkQueryDto extends PageQueryDto {
  /** open: not past its due day (the default). all: everything, including past due. */
  @IsOptional()
  @IsIn(['open', 'all'])
  status?: 'open' | 'all';

  @IsOptional()
  @IsUUID()
  divisionId?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;
}

export class SubmitHomeworkDto {
  /** Plain text. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  note?: string;

  /** Files uploaded with the purpose "homework-submission". */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID('all', { each: true })
  @Type(() => String)
  fileIds?: string[];
}

export class ReviewHomeworkDto {
  /** REVIEWED locks the hand-in; REDO asks the student to hand in again. */
  @IsIn(['REVIEWED', 'REDO'])
  status: 'REVIEWED' | 'REDO';

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  marks?: number;

  /** Plain text. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  feedback?: string;
}
