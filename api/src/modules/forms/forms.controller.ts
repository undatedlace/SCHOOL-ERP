import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { SaveDraftDto } from './dto/save-draft.dto.js';
import { FormsService } from './forms.service.js';

/** Configure forms such as the admission application. Admin only (forms.manage). */
@Controller('forms')
@RequirePermissions('forms.manage')
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext) {
    return this.forms.list(auth.schoolId);
  }

  @Get(':key')
  get(@CurrentAuth() auth: AuthContext, @Param('key') key: string) {
    return this.forms.get(auth.schoolId, key);
  }

  /** Begin editing: copies the published form into a draft. */
  @Post(':key/draft')
  @HttpCode(200)
  start(@CurrentAuth() auth: AuthContext, @Param('key') key: string) {
    return this.forms.startDraft(auth, key);
  }

  @Put(':key/draft')
  save(
    @CurrentAuth() auth: AuthContext,
    @Param('key') key: string,
    @Body() dto: SaveDraftDto,
  ) {
    return this.forms.saveDraft(auth, key, dto.name, dto.schema);
  }

  @Delete(':key/draft')
  @HttpCode(204)
  discard(@CurrentAuth() auth: AuthContext, @Param('key') key: string) {
    return this.forms.discardDraft(auth, key);
  }

  @Post(':key/publish')
  @HttpCode(200)
  publish(@CurrentAuth() auth: AuthContext, @Param('key') key: string) {
    return this.forms.publish(auth, key);
  }
}
