import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../../common/auth-context.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { FormDefinition } from '../../generated/prisma/client.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { FORM_KINDS } from './form-kinds.js';
import {
  FormSchema,
  publishErrors,
  validateFormSchema,
} from './form-schema.js';

const view = (f: FormDefinition) => ({
  id: f.id,
  version: f.version,
  name: f.name,
  status: f.status,
  schema: f.schema as unknown as FormSchema,
  updatedAt: f.updatedAt,
  publishedAt: f.publishedAt,
});

@Injectable()
export class FormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The forms the school can configure, with where each one stands. */
  async list(schoolId: string) {
    const rows = await this.prisma.formDefinition.findMany({
      where: { schoolId, status: { in: ['PUBLISHED', 'DRAFT'] } },
      select: {
        key: true,
        version: true,
        status: true,
        publishedAt: true,
        updatedAt: true,
      },
    });
    return Object.entries(FORM_KINDS).map(([key, kind]) => {
      const published = rows.find(
        (r) => r.key === key && r.status === 'PUBLISHED',
      );
      const draft = rows.find((r) => r.key === key && r.status === 'DRAFT');
      return {
        key,
        name: kind.name,
        publishedVersion: published?.version ?? null,
        publishedAt: published?.publishedAt ?? null,
        hasDraft: !!draft,
        draftUpdatedAt: draft?.updatedAt ?? null,
      };
    });
  }

  async get(schoolId: string, key: string) {
    const kind = this.kind(key);
    const [published, draft] = await Promise.all([
      this.findPublished(schoolId, key),
      this.findDraft(schoolId, key),
    ]);
    return {
      key,
      name: kind.name,
      requiredSystem: kind.requiredSystem,
      published: published ? view(published) : null,
      draft: draft ? view(draft) : null,
    };
  }

  /** The version applications are filled in against. */
  async getPublished(schoolId: string, key: string) {
    const published = await this.findPublished(schoolId, key);
    if (!published)
      throw new NotFoundException('This form has not been published yet');
    return published;
  }

  /** Starts editing: a copy of the published form (or the built-in starting form). */
  async startDraft(auth: AuthContext, key: string) {
    const kind = this.kind(key);
    const existing = await this.findDraft(auth.schoolId, key);
    if (existing) return view(existing);

    const published = await this.findPublished(auth.schoolId, key);
    const draft = await this.prisma.formDefinition.create({
      data: {
        schoolId: auth.schoolId,
        key,
        version: await this.nextVersion(auth.schoolId, key),
        name: published?.name ?? kind.name,
        status: 'DRAFT',
        schema: (published?.schema ?? kind.initial) as Prisma.InputJsonValue,
      },
    });
    await this.record(auth, 'forms.draft_started', draft);
    return view(draft);
  }

  async saveDraft(
    auth: AuthContext,
    key: string,
    name: string | undefined,
    rawSchema: unknown,
  ) {
    this.kind(key);
    const draft = await this.findDraft(auth.schoolId, key);
    if (!draft)
      throw new NotFoundException(
        'There is no draft to save. Start editing first.',
      );

    const { schema, errors } = validateFormSchema(rawSchema);
    if (errors.length) throw invalid(errors);

    const saved = await this.prisma.formDefinition.update({
      where: { id: draft.id },
      data: {
        schema: schema as unknown as Prisma.InputJsonValue,
        ...(name ? { name } : {}),
      },
    });
    await this.record(auth, 'forms.draft_saved', saved);
    return view(saved);
  }

  async discardDraft(auth: AuthContext, key: string) {
    this.kind(key);
    const draft = await this.findDraft(auth.schoolId, key);
    if (!draft) throw new NotFoundException('There is no draft to discard');
    await this.prisma.formDefinition.delete({ where: { id: draft.id } });
    await this.record(auth, 'forms.draft_discarded', draft);
  }

  /** Makes the draft the live version. The previous version is kept for the applications that used it. */
  async publish(auth: AuthContext, key: string) {
    const kind = this.kind(key);
    const draft = await this.findDraft(auth.schoolId, key);
    if (!draft) throw new NotFoundException('There is no draft to publish');

    const { schema, errors } = validateFormSchema(draft.schema);
    const problems = [...errors, ...publishErrors(schema, kind.requiredSystem)];
    if (problems.length) throw invalid(problems);

    const [, published] = await this.prisma.$transaction([
      this.prisma.formDefinition.updateMany({
        where: { schoolId: auth.schoolId, key, status: 'PUBLISHED' },
        data: { status: 'ARCHIVED' },
      }),
      this.prisma.formDefinition.update({
        where: { id: draft.id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      }),
    ]);
    await this.record(auth, 'forms.published', published);
    return view(published);
  }

  private kind(key: string) {
    const kind = FORM_KINDS[key];
    if (!kind) throw new NotFoundException('Unknown form');
    return kind;
  }

  private findPublished(schoolId: string, key: string) {
    return this.prisma.formDefinition.findFirst({
      where: { schoolId, key, status: 'PUBLISHED' },
    });
  }

  private findDraft(schoolId: string, key: string) {
    return this.prisma.formDefinition.findFirst({
      where: { schoolId, key, status: 'DRAFT' },
    });
  }

  private async nextVersion(schoolId: string, key: string) {
    const last = await this.prisma.formDefinition.aggregate({
      where: { schoolId, key },
      _max: { version: true },
    });
    return (last._max.version ?? 0) + 1;
  }

  private record(auth: AuthContext, action: string, form: FormDefinition) {
    return this.audit.log({
      schoolId: auth.schoolId,
      actorUserId: auth.userId,
      action,
      entityType: 'form',
      entityId: form.id,
      metadata: { key: form.key, version: form.version },
    });
  }
}

const invalid = (problems: string[]) =>
  new BadRequestException({
    statusCode: 400,
    message: 'The form is not valid',
    problems,
  });
