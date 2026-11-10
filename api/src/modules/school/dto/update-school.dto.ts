import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateSchoolDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @Transform(trim)
  @Matches(/^\+?[0-9 -]{7,20}$/, {
    message: 'phone must be a valid phone number',
  })
  phone?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  board?: string;

  /**
   * How student IDs begin, for example "hesj" gives hesj0001. Send an empty value to go back to plain
   * numbers. Only students admitted after the change get it; issued IDs never change.
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @Matches(/^([a-z][a-z0-9]{0,11})?$/, {
    message: 'The prefix is up to 12 letters or digits, starting with a letter',
  })
  studentIdPrefix?: string;

  /** How many digits the number part has (hesj0001 has 4). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(8)
  studentIdDigits?: number;

  /** The school's e-mail domain, for example school.in. A student's e-mail is their ID at this domain. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @Matches(/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$|^$/, {
    message: 'Use a domain like school.in',
  })
  studentEmailDomain?: string;
}
