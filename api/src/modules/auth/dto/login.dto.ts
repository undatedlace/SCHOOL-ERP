import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

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
}
