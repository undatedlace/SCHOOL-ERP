import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  currentPassword: string;

  @IsString()
  @MinLength(10, { message: 'newPassword must be at least 10 characters' })
  @MaxLength(128)
  newPassword: string;
}
