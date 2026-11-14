import { DevicePlatform } from '../../../generated/prisma/enums.js';
import {
  IsEnum,
  IsNotEmpty,
  Matches,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { EXPO_TOKEN } from '../../push/push-sender.js';

export class RegisterDeviceDto {
  @IsEnum(DevicePlatform)
  platform: DevicePlatform;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  // The phone app gets an Expo push token (ExponentPushToken[...]); a browser (WEB) token has its own format.
  @ValidateIf((o: RegisterDeviceDto) => o.platform !== DevicePlatform.WEB)
  @Matches(EXPO_TOKEN, {
    message:
      'pushToken must be an Expo push token, like ExponentPushToken[xxxx]',
  })
  pushToken: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;
}
