import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from '../../common/auth-context.js';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { CalendarService } from './calendar.service.js';
import {
  CreateEventDto,
  RangeQueryDto,
  UpdateEventDto,
} from './dto/calendar.dto.js';

@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  /** Events touching the days from..to that the signed-in person may see. */
  @Get()
  @RequirePermissions('calendar.read')
  list(@CurrentAuth() auth: AuthContext, @Query() q: RangeQueryDto) {
    return this.calendar.list(auth, q);
  }

  @Get('audiences')
  @RequirePermissions('calendar.manage')
  audiences(@CurrentAuth() auth: AuthContext) {
    return this.calendar.audiences(auth);
  }

  @Post()
  @RequirePermissions('calendar.manage')
  create(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateEventDto,
    @Req() req: Request,
  ) {
    return this.calendar.create(auth, dto, req.ip);
  }

  @Patch(':id')
  @RequirePermissions('calendar.manage')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventDto,
    @Req() req: Request,
  ) {
    return this.calendar.update(auth, id, dto, req.ip);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('calendar.manage')
  archive(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.calendar.archive(auth, id, req.ip);
  }
}
