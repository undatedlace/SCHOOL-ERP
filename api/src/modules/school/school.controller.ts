import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { UpdateSchoolDto } from './dto/update-school.dto.js';
import { SchoolService } from './school.service.js';

@Controller('school')
export class SchoolController {
  constructor(private readonly schoolService: SchoolService) {}

  /** The current school's profile. Any logged-in user may read it. */
  @Get()
  get(@CurrentAuth() auth: AuthContext) {
    return this.schoolService.getCurrent(auth.schoolId);
  }

  @Patch()
  @RequirePermissions('settings.manage')
  update(@CurrentAuth() auth: AuthContext, @Body() dto: UpdateSchoolDto) {
    return this.schoolService.update(auth, dto);
  }
}
