import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from '../../common/auth-context.js';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import {
  PlanQueryDto,
  RunPromotionDto,
  YearsQueryDto,
} from './dto/promotion.dto.js';
import { PromotionService } from './promotion.service.js';

@Controller('promotion')
@RequirePermissions('students.promote')
export class PromotionController {
  constructor(private readonly promotion: PromotionService) {}

  /** Every division with how many students are dealt with so far. */
  @Get('status')
  status(@CurrentAuth() auth: AuthContext, @Query() q: YearsQueryDto) {
    return this.promotion.status(auth, q);
  }

  /** The students of one division still to move, with a suggested action for each. */
  @Get('plan')
  plan(@CurrentAuth() auth: AuthContext, @Query() q: PlanQueryDto) {
    return this.promotion.plan(auth, q);
  }

  @Post('run')
  run(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: RunPromotionDto,
    @Req() req: Request,
  ) {
    return this.promotion.run(auth, dto, req.ip);
  }
}
