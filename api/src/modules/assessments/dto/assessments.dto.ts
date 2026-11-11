import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
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
import { AssessmentKind } from '../../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateAssessmentDto {
  /** For example "Unit Test 1" or "Mock test". */
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsEnum(AssessmentKind)
  kind?: AssessmentKind;

  @IsUUID()
  divisionId: string;

  @IsUUID()
  subjectId: string;

  /** The most a student can score. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1000)
  maxMarks: number;

  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  conductedOn: string;
}

export class UpdateAssessmentDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEnum(AssessmentKind)
  kind?: AssessmentKind;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1000)
  maxMarks?: number;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  conductedOn?: string;
}

export class MarkEntryDto {
  @IsUUID()
  studentId: string;

  /** Leave out (or null) when absent or not yet marked. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  marks?: number | null;

  @IsOptional()
  @IsBoolean()
  absent?: boolean;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  remark?: string | null;
}

export class SaveMarksDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => MarkEntryDto)
  entries: MarkEntryDto[];
}

export class ListAssessmentsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  divisionId?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  /** draft: marks being entered; published: families can see; all (the default). */
  @IsOptional()
  @IsIn(['draft', 'published', 'all'])
  status?: 'draft' | 'published' | 'all';
}
