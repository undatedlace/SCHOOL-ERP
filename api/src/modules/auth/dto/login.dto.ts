import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  /** Email address or mobile number. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  identifier: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password: string;

  /** Which school, when the system holds more than one. Left out: the home school. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  schoolCode?: string;
}
