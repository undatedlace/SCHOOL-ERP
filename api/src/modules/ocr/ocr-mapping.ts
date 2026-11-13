import type { FormField, FormSchema } from '../forms/form-schema.js';

/**
 * Turns what the OCR service read from a paper admission form into answers for
 * the school's published admission form, plus notes on what to check.
 *
 * The OCR service speaks in its own keys (`student.name.surname`); the ERP form
 * uses field ids (`surname`). The map below joins them. A field the school has
 * removed or retyped in the form builder is simply skipped, so editing the form
 * never breaks this.
 */

/** One field as the OCR service returns it. */
export interface OcrField {
  value: unknown;
  confidence: number | null;
  raw: unknown;
  valid?: boolean;
  check?: boolean;
  missing?: boolean;
}

export interface OcrResult {
  fields: Record<string, OcrField>;
  missingPanels: string[];
  seconds: number;
  reader?: string;
}

export interface ReviewNote {
  /** 0..1, how sure the reader was. */
  confidence: number | null;
  /** What was read from the paper, when it differs from what was filled in or could not be used. */
  read: string | null;
  note: string;
}

export interface MappedForm {
  answers: Record<string, unknown>;
  header: { formNo?: string; receivedOn?: string };
  /** Keyed like the form renderer's paths: `surname`, `siblings[0].name`. */
  review: Record<string, ReviewNote>;
  summary: {
    filled: number;
    toCheck: number;
    missingPages: string[];
    seconds: number;
    reader: string | null;
  };
}

export interface ClassRef {
  id: string;
  name: string;
}

/** Form field id -> OCR key (or keys joined into one answer). */
const FIELD_MAP: Record<string, string | string[]> = {
  classApplied: 'admissionClass',
  surname: 'student.name.surname',
  firstName: 'student.name.childName',
  fatherName: 'student.name.fatherName',
  gender: 'student.gender',
  dateOfBirth: 'student.dateOfBirth',
  placeOfBirth: 'student.placeOfBirth.townCity',
  birthState: 'student.placeOfBirth.state',
  nationality: 'student.nationality',
  religion: 'student.religion',
  community: 'student.community',
  motherTongue: 'student.motherTongue',
  permanentAddress: 'student.permanentAddress',
  communicationAddress: 'student.communicationAddress',
  languagesKnown: [
    'student.languagesKnown.0',
    'student.languagesKnown.1',
    'student.languagesKnown.2',
  ],
  languageHomeMain: 'student.languagesSpokenAtHome.main',
  languageHomeOther: 'student.languagesSpokenAtHome.other',
  lastSchoolFrom: 'student.lastSchool.attendedFrom',
  lastSchoolTo: 'student.lastSchool.attendedTo',
  lastSchoolName: 'student.lastSchool.nameAndAddress',
  lastClass: 'student.lastSchool.lastClassAttended',
  lastMedium: 'student.lastSchool.mediumOfInstruction',
  changeReason: 'student.lastSchool.reasonForChange',
  healthNotes: 'student.illnessOrDisabilities',
  fatherFullName: 'father.name',
  fatherAge: 'father.age',
  fatherQualification: 'father.qualification',
  fatherOccupation: 'father.occupation',
  fatherEmail: 'father.email',
  fatherDesignation: 'father.designation',
  fatherOfficeAddress: 'father.officeAddress',
  motherFullName: 'mother.name',
  motherOccupation: 'mother.occupation',
  motherQualification: 'mother.qualification',
  residentialAddress: 'familyContact.residentialAddress',
  familyPhone: 'familyContact.phone',
  familyMobile: 'familyContact.mobile',
  familyFax: 'familyContact.fax',
  monthlyIncome: 'familyContact.monthlyIncome',
  familyMotherTongue: 'familyContact.motherTongue',
  guardianFirstName: 'guardian.name.firstName',
  guardianMiddleName: 'guardian.name.middleName',
  guardianLastName: 'guardian.name.lastName',
  guardianRelationship: 'guardian.relationshipWithStudent',
  guardianAge: 'guardian.age',
  guardianQualification: 'guardian.qualification',
  guardianOccupation: 'guardian.occupation',
  guardianDesignation: 'guardian.designation',
  guardianEmail: 'guardian.email',
  guardianOfficeAddress: 'guardian.officeAddress',
  guardianResidentialAddress: 'guardian.residentialAddress',
  guardianPhone: 'guardian.phone',
  guardianMobile: 'guardian.mobile',
  guardianFax: 'guardian.fax',
};

/** Columns of the siblings group -> OCR sibling key. */
const SIBLING_MAP: Record<string, string> = {
  name: 'name',
  age: 'age',
  school: 'schoolCollege',
  class: 'class',
};
const SIBLING_ROWS = 4;

/** The tick boxes on the paper form, and how a school might name those classes. */
const CLASS_PATTERNS: Record<string, RegExp> = {
  PLAY_GROUP: /^(play ?group|pg|playgroup)$/,
  NURSERY: /^(nursery|nur)$/,
  JR_KG: /^(jr|junior|lower|l) ?kg$/,
  SR_KG: /^(sr|senior|upper|u) ?kg$/,
  STD_1: /^(std|standard|class|grade)? ?(1|i|one|1st)( std| standard)?$/,
  STD_2: /^(std|standard|class|grade)? ?(2|ii|two|2nd)( std| standard)?$/,
};

export function classFor(tick: string, classes: ClassRef[]): ClassRef | null {
  const pattern = CLASS_PATTERNS[tick];
  if (!pattern) return null;
  return (
    classes.find((c) =>
      pattern.test(
        c.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .replace(/\b(k) (g)\b/g, 'kg')
          .trim(),
      ),
    ) ?? null
  );
}

/** "dd/mm/yyyy" -> "yyyy-mm-dd", or null if it is not a real date. */
export function isoDate(text: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(Date.UTC(+y, +mo - 1, +d));
  if (date.getUTCDate() !== +d || date.getUTCMonth() !== +mo - 1) return null;
  return `${y}-${mo}-${d}`;
}

const text = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
const rawText = (f: OcrField | undefined): string | null =>
  f ? (typeof f.raw === 'string' ? f.raw : text(f.value)) : null;

type Converted =
  { ok: true; value: unknown } | { ok: false; note: string } | null;

/** Convert one OCR value to what a form field of this type holds. null = nothing read. */
function convert(
  field: FormField,
  value: unknown,
  classes: ClassRef[],
): Converted {
  const t = text(value);
  if (t === null) return null;
  switch (field.type) {
    case 'text':
    case 'textarea': {
      const max = field.maxLength ?? (field.type === 'textarea' ? 2000 : 500);
      return { ok: true, value: t.slice(0, max) };
    }
    case 'number': {
      const n = Number(t.replace(/\D/g, ''));
      if (!/\d/.test(t) || !Number.isFinite(n))
        return { ok: false, note: 'Not a number' };
      if (
        (field.min !== undefined && n < field.min) ||
        (field.max !== undefined && n > field.max)
      )
        return { ok: false, note: 'Outside the allowed range' };
      return { ok: true, value: n };
    }
    case 'date': {
      const iso = isoDate(t);
      return iso
        ? { ok: true, value: iso }
        : { ok: false, note: 'Not a date that could be read' };
    }
    case 'select': {
      if (field.optionsFrom === 'classes') {
        const c = classFor(t, classes);
        return c
          ? { ok: true, value: c.id }
          : { ok: false, note: 'No class of that name' };
      }
      return field.options?.some((o) => o.value === t)
        ? { ok: true, value: t }
        : { ok: false, note: 'Not one of the choices' };
    }
    case 'radio':
      return field.options?.some((o) => o.value === t)
        ? { ok: true, value: t }
        : { ok: false, note: 'Not one of the choices' };
    default:
      return null; // photographs, documents, checkboxes are not filled from photos
  }
}

const CHECK_NOTE = 'Read with low confidence: check it against the paper';

export function mapOcrToForm(
  ocr: OcrResult,
  schema: FormSchema,
  classes: ClassRef[],
): MappedForm {
  const fields = new Map(
    schema.sections.flatMap((s) => s.fields).map((f) => [f.id, f]),
  );
  const answers: Record<string, unknown> = {};
  const review: Record<string, ReviewNote> = {};

  const apply = (
    path: string,
    field: FormField,
    keys: string[],
    put: (v: unknown) => void,
  ) => {
    const read = keys
      .map((k) => ocr.fields[k])
      .filter((f): f is OcrField => !!f);
    if (read.every((f) => f.missing)) return; // also true when nothing was read
    const value =
      keys.length === 1
        ? read[0].value
        : read
            .map((f) => text(f.value))
            .filter((v) => v !== null)
            .join(', ') || null;
    const confidences = read
      .map((f) => f.confidence)
      .filter((c): c is number => c !== null);
    const confidence = confidences.length ? Math.min(...confidences) : null;
    const raw = keys.length === 1 ? rawText(read[0]) : text(value);
    const result = convert(field, value, classes);
    if (result === null) return;
    if (!result.ok) {
      review[path] = { confidence, read: raw, note: result.note };
      return;
    }
    put(result.value);
    if (read.some((f) => f.check || f.valid === false)) {
      review[path] = { confidence, read: raw, note: CHECK_NOTE };
    }
  };

  for (const [id, keys] of Object.entries(FIELD_MAP)) {
    const field = fields.get(id);
    if (!field) continue;
    apply(
      id,
      field,
      Array.isArray(keys) ? keys : [keys],
      (v) => (answers[id] = v),
    );
  }

  const siblings = fields.get('siblings');
  if (siblings?.type === 'group') {
    const columns = new Map((siblings.fields ?? []).map((f) => [f.id, f]));
    const rows: Record<string, unknown>[] = [];
    const limit = Math.min(SIBLING_ROWS, siblings.maxItems ?? SIBLING_ROWS);
    for (let i = 0; i < limit; i++) {
      const row: Record<string, unknown> = {};
      const rowReview: Record<string, ReviewNote> = {};
      for (const [col, key] of Object.entries(SIBLING_MAP)) {
        const field = columns.get(col);
        if (!field) continue;
        const before = Object.keys(review).length;
        apply(
          `siblings[${rows.length}].${col}`,
          field,
          [`siblings.${i}.${key}`],
          (v) => (row[col] = v),
        );
        // Keep notes only for rows we keep (empty rows are dropped below).
        for (const k of Object.keys(review).slice(before)) {
          rowReview[k] = review[k];
          delete review[k];
        }
      }
      if (Object.keys(row).length > 0) {
        rows.push(row);
        Object.assign(review, rowReview);
      }
    }
    if (rows.length > 0) answers['siblings'] = rows;
  }

  const header: MappedForm['header'] = {};
  const formNo = text(ocr.fields['formNo']?.value);
  if (formNo) header.formNo = formNo.slice(0, 30);
  const onDate = text(ocr.fields['date']?.value);
  const receivedOn = onDate ? isoDate(onDate) : null;
  if (receivedOn) header.receivedOn = receivedOn;

  return {
    answers,
    header,
    review,
    summary: {
      filled: Object.keys(answers).length,
      toCheck: Object.keys(review).length,
      missingPages: ocr.missingPanels ?? [],
      seconds: ocr.seconds,
      reader: ocr.reader ?? null,
    },
  };
}
