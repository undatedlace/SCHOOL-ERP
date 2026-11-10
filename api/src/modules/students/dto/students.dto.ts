import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
  ArrayMaxSize,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PageQueryDto } from '../../../common/dto/page-query.dto.js';
import {
  DATE_MESSAGE,
  DATE_PATTERN,
  queryBool,
} from '../../../common/dto/filters.js';
import {
  Gender,
  GuardianRelationship,
  StudentStatus,
} from '../../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const trimLower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class ListStudentsQueryDto extends PageQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  divisionId?: string;

  /** Which year's class to show and filter by. Defaults to the current year. */
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  /** Joined the school on or after this day. */
  @IsOptional()
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  joinedFrom?: string;

  /** Joined the school on or before this day. */
  @IsOptional()
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  joinedTo?: string;

  /** Whether the student has a login. */
  @IsOptional()
  @queryBool()
  @IsBoolean()
  hasLogin?: boolean;
}

/** A parent or guardian, as typed in at admission or added later. */
export class GuardianInputDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @IsEnum(GuardianRelationship)
  relationship: GuardianRelationship;

  @IsOptional()
  @Transform(trim)
  @Matches(/^\+?[0-9]{10,15}$/, { message: 'mobile must be 10 to 15 digits' })
  mobile?: string;

  @IsOptional()
  @Transform(trimLower)
  @IsEmail()
  email?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  occupation?: string;

  /** The person the school contacts first. */
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class GuardianListDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => GuardianInputDto)
  guardians: GuardianInputDto[];
}

export class UpdateStudentDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  firstName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  fatherName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  surname?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsDateString({ strict: true })
  dateOfBirth?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  admissionNo?: string;

  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;

  /** Date the student left. Defaults to today when status becomes LEFT. */
  @IsOptional()
  @IsDateString({ strict: true })
  leftOn?: string;
}

export class UpdateGuardianDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName?: string;

  @IsOptional()
  @Transform(trim)
  @Matches(/^\+?[0-9]{10,15}$/, { message: 'mobile must be 10 to 15 digits' })
  mobile?: string;

  @IsOptional()
  @Transform(trimLower)
  @IsEmail()
  email?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  occupation?: string;
}

/** Taking a student off the lists. A reason is required and kept. */
export class RemoveStudentDto {
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'Say why the student is being removed' })
  @MaxLength(300)
  reason: string;
}

/** Putting a student in another class or division for this academic year. */
export class MoveStudentDto {
  @IsUUID()
  divisionId: string;
}
