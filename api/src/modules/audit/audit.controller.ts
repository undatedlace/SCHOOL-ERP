import { Controller, Get, Query } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { AuthContext } from '../../common/auth-context.js';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { PageQueryDto } from '../../common/dto/page-query.dto.js';
import { AuditService } from './audit.service.js';

class AuditQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;
}

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit.read')
  list(@CurrentAuth() auth: AuthContext, @Query() query: AuditQueryDto) {
    return this.audit.list(auth.schoolId, query);
  }
}
