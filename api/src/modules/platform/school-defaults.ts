import { Prisma } from '../../generated/prisma/client.js';
import {
  DEFAULT_ADMISSION_FORM,
  DEFAULT_ADMISSION_FORM_NAME,
} from '../forms/default-admission-form.js';
import { STAFF_FORM_PREFIX } from '../forms/form-kinds.js';
import { templateFor } from '../forms/staff-form-templates.js';

type Db = Pick<Prisma.TransactionClient, 'staffType' | 'formDefinition'>;

/** The kinds of employee every school starts with; the school adds more in Settings. */
export const STARTER_STAFF_TYPES = [
  { name: 'Teacher', isTeaching: true },
  { name: 'Clerk', isTeaching: false },
  { name: 'Peon', isTeaching: false },
] as const;

/**
 * What a new school needs before anyone can work in it: the starter staff types, each with its
 * onboarding form published as version 1, and the admission form published as version 1.
 * Safe to run again: anything already there is left alone. Used by the seed and by the platform
 * owner's "onboard a school". Returns notes about things it deliberately skipped.
 */
export async function provisionSchoolDefaults(
  db: Db,
  schoolId: string,
): Promise<string[]> {
  const notes: string[] = [];
  for (const [i, t] of STARTER_STAFF_TYPES.entries()) {
    await db.staffType.upsert({
      where: { schoolId_name: { schoolId, name: t.name } },
      update: {},
      create: { schoolId, ...t, sortOrder: i + 1 },
    });
  }

  // A type that already has a live version is left alone; one with only a draft is reported,
  // because publishing over a draft someone is editing would surprise them.
  for (const type of await db.staffType.findMany({
    where: { schoolId, active: true },
  })) {
    const key = `${STAFF_FORM_PREFIX}${type.id}`;
    const existing = await db.formDefinition.findMany({
      where: { schoolId, key },
      select: { status: true },
    });
    if (existing.some((f) => f.status === 'PUBLISHED')) continue;
    if (existing.length > 0) {
      notes.push(
        `Staff form for ${type.name} has a draft but no live version; publish it from Settings, Forms.`,
      );
      continue;
    }
    await db.formDefinition.create({
      data: {
        schoolId,
        key,
        version: 1,
        name: `Staff onboarding: ${type.name}`,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        schema: templateFor(type) as unknown as Prisma.InputJsonObject,
      },
    });
  }

  const hasAdmissionForm = await db.formDefinition.findFirst({
    where: { schoolId, key: 'admission' },
    select: { id: true },
  });
  if (!hasAdmissionForm) {
    await db.formDefinition.create({
      data: {
        schoolId,
        key: 'admission',
        version: 1,
        name: DEFAULT_ADMISSION_FORM_NAME,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        schema: DEFAULT_ADMISSION_FORM as unknown as Prisma.InputJsonObject,
      },
    });
  }
  return notes;
}

/** School codes: 2 to 30 lower-case letters, digits and single hyphens, for example "hesj". */
export const SCHOOL_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSchoolCode(code: string): boolean {
  return (
    code.length >= 2 && code.length <= 30 && SCHOOL_CODE_PATTERN.test(code)
  );
}

/** A starting code from a school's name ("Heera English School" gives "heera-english-school"). */
export function schoolCodeFrom(name: string): string {
  const code = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 30)
    .replace(/^-+|-+$/g, '');
  return code.length >= 2 ? code : 'school';
}
