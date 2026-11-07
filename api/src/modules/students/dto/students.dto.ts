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
