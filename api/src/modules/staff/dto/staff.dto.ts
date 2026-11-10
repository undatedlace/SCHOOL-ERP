import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto.js';
import {
  DATE_MESSAGE,
  DATE_PATTERN,
  queryBool,
} from '../../../common/dto/filters.js';
import { Gender, StaffStatus } from '../../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const trimLower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Roles a member of staff can be given. Parents and students have their own accounts. */
export const STAFF_ROLES = [
  'SCHOOL_ADMIN',
  'OFFICE_STAFF',
  'ACCOUNTANT',
  'TEACHER',
  'STAFF',
];

export class ListStaffQueryDto extends PageQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(StaffStatus)
  status?: StaffStatus;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  /** Part of the designation, for example "teacher". */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  designation?: string;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  joinedFrom?: string;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  joinedTo?: string;

  /** Whether the person has a login. */
  @IsOptional()
  @queryBool()
  @IsBoolean()
  hasLogin?: boolean;

  /** Only people whose login holds this role, for example TEACHER. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  role?: string;

  /** Only this kind of employee. */
  @IsOptional()
  @IsUUID()
  staffTypeId?: string;
}

/** Give a member of staff a login. The temporary password is generated and shown once. */
export class AccountDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(STAFF_ROLES.length)
  @IsString({ each: true })
  roleCodes: string[];
}

export class CreateStaffDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  firstName: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  surname: string;

  @IsEnum(Gender)
  gender: Gender;

  @IsOptional()
  @IsDateString({ strict: true })
  dateOfBirth?: string;

  @IsOptional()
  @Transform(trim)
  @Matches(/^\+?[0-9]{10,15}$/, { message: 'mobile must be 10 to 15 digits' })
  mobile?: string;

  @IsOptional()
  @Transform(trimLower)
  @IsEmail()
  email?: string;

  /** For example "Teacher", "Clerk", "Peon". */
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  designation: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  qualification?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsUUID()
  photoFileId?: string;

  /** The day they joined, "YYYY-MM-DD". Defaults to today. */
  @IsOptional()
  @IsDateString({ strict: true })
  joinedOn?: string;

  /** Defaults to the next number in the sequence. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  employeeNo?: string;

  /** Also create a login. Uses the email or mobile number given above. */
  @IsOptional()
  @ValidateNested()
  @Type(() => AccountDto)
  account?: AccountDto;

  /** The kind of employee (from the school's staff types). It decides the onboarding form. */
  @IsOptional()
  @IsUUID()
  staffTypeId?: string;

  /** Answers to that type's onboarding form: { fieldId: value }. Documents are uploaded file ids. */
  @IsOptional()
  @IsObject()
  answers?: Record<string, unknown>;
}

export class UpdateStaffDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  firstName?: string;

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
  @Matches(/^\+?[0-9]{10,15}$/, { message: 'mobile must be 10 to 15 digits' })
  mobile?: string;

  @IsOptional()
  @Transform(trimLower)
  @IsEmail()
  email?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  designation?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  qualification?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsUUID()
  photoFileId?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  joinedOn?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  employeeNo?: string;

  /** The kind of employee (from the school's staff types). It decides the onboarding form. */
  @IsOptional()
  @IsUUID()
  staffTypeId?: string;

  /** Answers to that type's onboarding form: { fieldId: value }. Documents are uploaded file ids. */
  @IsOptional()
  @IsObject()
  answers?: Record<string, unknown>;

  /** LEFT also switches their login off; ACTIVE switches it back on. */
  @IsOptional()
  @IsEnum(StaffStatus)
  status?: StaffStatus;

  /** The day they left. Defaults to today when status becomes LEFT. */
  @IsOptional()
  @IsDateString({ strict: true })
  leftOn?: string;
}
