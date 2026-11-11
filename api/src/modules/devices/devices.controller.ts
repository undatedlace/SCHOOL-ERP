import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator.js';
import { DevicesService } from './devices.service.js';
import { RegisterDeviceDto } from './dto/devices.dto.js';

/** No permission needed beyond being signed in: a person only ever touches their own phones. */
@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post()
  @HttpCode(200)
  register(@CurrentAuth() auth: AuthContext, @Body() dto: RegisterDeviceDto) {
    return this.devices.register(auth, dto);
  }

  @Get()
  list(@CurrentAuth() auth: AuthContext) {
    return this.devices.list(auth);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.devices.remove(auth, id);
  }
}
