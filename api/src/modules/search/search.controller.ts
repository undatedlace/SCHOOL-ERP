import { Controller, Get, Query } from '@nestjs/common';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { AuthContext } from '../../common/auth-context.js';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator.js';
import { MAX_PER_GROUP, SearchService } from './search.service.js';

class SearchQueryDto {
  @IsString()
  @MaxLength(100)
  q: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PER_GROUP)
  limit?: number;
}

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /** Students, staff and applications matching a few letters, limited to what the caller may see. */
  @Get()
  find(@CurrentAuth() auth: AuthContext, @Query() q: SearchQueryDto) {
    return this.search.search(auth, q.q, q.limit);
  }
}
