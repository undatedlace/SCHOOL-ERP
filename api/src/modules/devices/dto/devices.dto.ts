import { DevicePlatform } from '../../../generated/prisma/enums.js';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class RegisterDeviceDto {
  @IsEnum(DevicePlatform)
  platform: DevicePlatform;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  pushToken: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;
}
