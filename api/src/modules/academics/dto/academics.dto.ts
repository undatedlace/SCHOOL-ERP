import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// ---------- Academic years ----------

export class CreateAcademicYearDto {
  /** For example "2026-27". */
  @Transform(trim)
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  name: string;

  /** Calendar dates, "YYYY-MM-DD". */
  @IsDateString({ strict: true })
  startDate: string;

  @IsDateString({ strict: true })
  endDate: string;

  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;
}

export class UpdateAcademicYearDto extends PartialType(CreateAcademicYearDto) {}

// ---------- Classes (standards) ----------

export class CreateClassDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;

  /** Position in lists. Defaults to the end. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;
}

export class UpdateClassDto extends PartialType(CreateClassDto) {}

// ---------- Divisions ----------

export class CreateDivisionDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  name: string;
}

export class UpdateDivisionDto extends CreateDivisionDto {}

// ---------- Subjects ----------

export class CreateSubjectDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  code?: string;
}

export class UpdateSubjectDto extends PartialType(CreateSubjectDto) {}
