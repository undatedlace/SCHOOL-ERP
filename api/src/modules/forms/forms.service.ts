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
import { FORM_KINDS, FormKind, STAFF_FORM_PREFIX } from './form-kinds.js';
import {
  FormSchema,
  publishErrors,
  validateFormSchema,
} from './form-schema.js';
import { templateFor } from './staff-form-templates.js';

/** The onboarding form of a staff type. It starts from the template that fits the kind of work. */
const staffKind = (t: { name: string; isTeaching: boolean }): FormKind => ({
  name: `Staff onboarding: ${t.name}`,
  requiredSystem: [],
  initial: templateFor(t),
});

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
    // The built-in forms, then one onboarding form for each type of staff the school has.
    const types = await this.prisma.staffType.findMany({
      where: { schoolId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, isTeaching: true, active: true },
    });
    const kinds: [string, FormKind][] = [
      ...Object.entries(FORM_KINDS),
      ...types
        .filter((t) => t.active)
        .map((t): [string, FormKind] => [
          `${STAFF_FORM_PREFIX}${t.id}`,
          staffKind(t),
        ]),
    ];
    return kinds.map(([key, kind]) => {
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
    const kind = await this.kind(schoolId, key);
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

  /**
   * The form to fill in right now: the live version, or the built-in starting form when the school has
   * not published one yet (in which case the first record saved publishes it as version 1).
   */
  async current(schoolId: string, key: string) {
    const kind = await this.kind(schoolId, key);
    const published = await this.findPublished(schoolId, key);
    return {
      key,
      name: published?.name ?? kind.name,
      version: published?.version ?? 1,
      schema: (published?.schema ?? kind.initial) as unknown as FormSchema,
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
    const kind = await this.kind(auth.schoolId, key);
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
    await this.kind(auth.schoolId, key);
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
    await this.kind(auth.schoolId, key);
    const draft = await this.findDraft(auth.schoolId, key);
    if (!draft) throw new NotFoundException('There is no draft to discard');
    await this.prisma.formDefinition.delete({ where: { id: draft.id } });
    await this.record(auth, 'forms.draft_discarded', draft);
  }

  /** Makes the draft the live version. The previous version is kept for the applications that used it. */
  async publish(auth: AuthContext, key: string) {
    const kind = await this.kind(auth.schoolId, key);
    const draft = await this.findDraft(auth.schoolId, key);
    if (!draft) throw new NotFoundException('There is no draft to publish');

    const { schema, errors } = validateFormSchema(draft.schema);
    const problems = [...errors, ...publishErrors(schema, kind.requiredSystem)];
    if (problems.length) throw invalid(problems);

    // Versions only go up. A draft started before another version was published (for example the
    // starting form published when the first person was added) is numbered after it.
    const latest = await this.prisma.formDefinition.aggregate({
      where: { schoolId: auth.schoolId, key, id: { not: draft.id } },
      _max: { version: true },
    });
    const version = Math.max(draft.version, (latest._max.version ?? 0) + 1);

    const [, published] = await this.prisma.$transaction([
      this.prisma.formDefinition.updateMany({
        where: { schoolId: auth.schoolId, key, status: 'PUBLISHED' },
        data: { status: 'ARCHIVED' },
      }),
      this.prisma.formDefinition.update({
        where: { id: draft.id },
        data: { status: 'PUBLISHED', publishedAt: new Date(), version },
      }),
    ]);
    await this.record(auth, 'forms.published', published);
    return view(published);
  }

  /**
   * The live version of a form, creating version 1 from the built-in starting form if the school has
   * not published one yet. Used where a record must be tied to a version (a new member of staff).
   */
  async ensurePublished(schoolId: string, key: string) {
    const existing = await this.findPublished(schoolId, key);
    if (existing) return existing;
    const kind = await this.kind(schoolId, key);
    return this.prisma.formDefinition.create({
      data: {
        schoolId,
        key,
        version: await this.nextVersion(schoolId, key),
        name: kind.name,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        schema: kind.initial as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /** What the form is: a built-in one, or the onboarding form of one of the school's staff types. */
  private async kind(schoolId: string, key: string): Promise<FormKind> {
    const builtIn = FORM_KINDS[key];
    if (builtIn) return builtIn;
    if (key.startsWith(STAFF_FORM_PREFIX)) {
      const id = key.slice(STAFF_FORM_PREFIX.length);
      if (/^[0-9a-f-]{36}$/i.test(id)) {
        const type = await this.prisma.staffType.findFirst({
          where: { id, schoolId },
          select: { name: true, isTeaching: true },
        });
        if (type) return staffKind(type);
      }
    }
    throw new NotFoundException('Unknown form');
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
