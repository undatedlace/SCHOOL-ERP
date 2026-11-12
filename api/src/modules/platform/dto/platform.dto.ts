import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { SCHOOL_CODE_PATTERN } from '../school-defaults.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class PlatformLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password: string;
}

export class PlatformChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  currentPassword: string;

  @IsString()
  @MinLength(12, { message: 'newPassword must be at least 12 characters' })
  @MaxLength(128)
  newPassword: string;
}

const CODE_MESSAGE =
  'The school code is 2 to 30 lower-case letters, digits and hyphens, for example "hesj"';

export class OnboardSchoolDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  /** Left out: made from the name. */
  @IsOptional()
  @Transform(lower)
  @IsString()
  @MinLength(2, { message: CODE_MESSAGE })
  @MaxLength(30, { message: CODE_MESSAGE })
  @Matches(SCHOOL_CODE_PATTERN, { message: CODE_MESSAGE })
  code?: string;

  /** The trustee who becomes the school's Super Admin. */
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  superAdminName: string;

  @Transform(lower)
  @IsEmail()
  @MaxLength(100)
  superAdminEmail: string;

  /** Optional: the principal or manager, as School Admin. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  schoolAdminName?: string;

  @ValidateIf((o: OnboardSchoolDto) => !!o.schoolAdminName)
  @Transform(lower)
  @IsEmail()
  @MaxLength(100)
  schoolAdminEmail?: string;
}

export class UpdatePlatformSchoolDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(lower)
  @IsString()
  @MinLength(2, { message: CODE_MESSAGE })
  @MaxLength(30, { message: CODE_MESSAGE })
  @Matches(SCHOOL_CODE_PATTERN, { message: CODE_MESSAGE })
  code?: string;
}

export const ADMIN_ROLE_CODES = ['SUPER_ADMIN', 'SCHOOL_ADMIN'] as const;
export type AdminRoleCode = (typeof ADMIN_ROLE_CODES)[number];

export class AddSchoolAdminDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName: string;

  @Transform(lower)
  @IsEmail()
  @MaxLength(100)
  email: string;

  @IsIn(ADMIN_ROLE_CODES)
  role: AdminRoleCode;
}
