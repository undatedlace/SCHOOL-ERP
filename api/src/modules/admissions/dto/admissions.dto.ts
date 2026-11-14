import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto.js';
import {
  DATE_MESSAGE,
  DATE_PATTERN,
  queryBool,
} from '../../../common/dto/filters.js';
import { GuardianInputDto } from '../../students/dto/students.dto.js';
import { ApplicationStatus } from '../../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateApplicationDto {
  /** Defaults to the current academic year. */
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  /** The number printed on the paper form. Defaults to the next number in the sequence. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  formNo?: string;

  /** The date on the form, "YYYY-MM-DD". Defaults to today. */
  @IsOptional()
  @IsDateString({ strict: true })
  receivedOn?: string;

  @IsObject()
  answers: Record<string, unknown>;
}

export class EligibilityQueryDto {
  @IsUUID()
  classId: string;

  @IsDateString({ strict: true })
  dateOfBirth: string;

  /** The date on the form, if it is not today. */
  @IsOptional()
  @IsDateString({ strict: true })
  receivedOn?: string;
}

export class UpdateApplicationDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  formNo?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  receivedOn?: string;

  @IsOptional()
  @IsObject()
  answers?: Record<string, unknown>;
}

export const DECISIONS = [
  'UNDER_REVIEW',
  'GRANTED',
  'REFUSED',
  'WITHDRAWN',
] as const;
export type Decision = (typeof DECISIONS)[number];

export class DecisionDto {
  @IsEnum(DECISIONS)
  decision: Decision;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string;

  /** For GRANTED: the class admitted to. Defaults to the class applied for. */
  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  divisionId?: string;

  /** When the decision was really taken, for a paper form decided earlier. Defaults to now. */
  @IsOptional()
  @IsDateString({ strict: true })
  decidedOn?: string;
}

export class ListApplicationsQueryDto extends PageQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(ApplicationStatus)
  status?: ApplicationStatus;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  /** Received on or after this day. */
  @IsOptional()
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  receivedFrom?: string;

  /** Received on or before this day. */
  @IsOptional()
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  receivedTo?: string;

  /** Only applications that have (true) or have not (false) been turned into a student. */
  @IsOptional()
  @queryBool()
  @IsBoolean()
  admitted?: boolean;
}

/** Turns a granted application into a student. */
export class AdmitDto {
  /** The division the student joins. It must belong to the class the application was granted for. */
  @IsUUID()
  divisionId: string;

  /** Defaults to the next number in the sequence. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  admissionNo?: string;

  /** The day the student joins, "YYYY-MM-DD". Defaults to today. */
  @IsOptional()
  @IsDateString({ strict: true })
  joinedOn?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one parent or guardian' })
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => GuardianInputDto)
  guardians: GuardianInputDto[];
}
