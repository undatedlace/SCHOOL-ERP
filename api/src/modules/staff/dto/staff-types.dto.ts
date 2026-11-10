import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateStaffTypeDto {
  /** For example "Teacher", "Clerk", "Peon", "Driver". */
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  /** Teaching staff start from the teacher onboarding form; others from the non-teaching one. */
  @IsOptional()
  @IsBoolean()
  isTeaching?: boolean;
}

export class UpdateStaffTypeDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isTeaching?: boolean;

  /** Switching a type off hides it from new staff. Existing staff keep it. */
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
