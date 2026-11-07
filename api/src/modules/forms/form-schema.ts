/**
 * The shape of a configurable form, and the two checks everything relies on:
 *  - validateFormSchema: is this a well-formed form definition?
 *  - validateAnswers: do these answers fit that form?
 * Both are pure functions with no database access, so they are easy to test.
 */

export const FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'date',
  'select',
  'radio',
  'checkbox',
  'image',
  'group',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** Types allowed inside a repeating group (one level only). */
const GROUP_FIELD_TYPES: FieldType[] = [
  'text',
  'textarea',
  'number',
  'date',
  'select',
];

export type FieldWidth = 'full' | 'half' | 'third' | 'quarter';
export const FIELD_WIDTHS: FieldWidth[] = ['full', 'half', 'third', 'quarter'];

export interface FieldOption {
  value: string;
  label: string;
}

/**
 * Fields the rest of the system depends on (for example, to create the student
 * when an application is granted). They can be relabelled and moved, but not
 * removed or retyped. Everything else on a form is free for the school to change.
 */
export const SYSTEM_FIELDS = {
  'student.class': { type: 'select', required: true },
  'student.surname': { type: 'text', required: true },
  'student.firstName': { type: 'text', required: true },
  'student.fatherName': { type: 'text', required: false },
  'student.gender': { type: 'radio', required: true },
  'student.dateOfBirth': { type: 'date', required: true },
  'student.photo': { type: 'image', required: false },
} as const satisfies Record<string, { type: FieldType; required: boolean }>;
export type SystemFieldKey = keyof typeof SYSTEM_FIELDS;

export const GENDER_VALUES = ['MALE', 'FEMALE', 'OTHER'];

export interface FormField {
  /** Answers are stored under this id, so it must never change once data exists. */
  id: string;
  type: FieldType;
  label: string;
  required?: boolean;
  helpText?: string;
  placeholder?: string;
  width?: FieldWidth;
  /** Starts on a new row instead of continuing the row above. */
  newRow?: boolean;
  options?: FieldOption[];
  /** For a select: take the options from the school's classes instead of a fixed list. */
  optionsFrom?: 'classes';
  system?: SystemFieldKey;
  maxLength?: number;
  min?: number;
  max?: number;
  /** For type "group": the columns of each repeated row. */
  fields?: FormField[];
  maxItems?: number;
}

export interface FormSection {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
}

export interface FormSchema {
  sections: FormSection[];
}

export const LIMITS = {
  sections: 30,
  fields: 200,
  groupFields: 15,
  options: 50,
  defaultTextLength: 500,
  defaultTextareaLength: 2000,
  defaultGroupRows: 10,
  maxGroupRows: 20,
} as const;

const ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9]{0,39}$/;
const OPTION_VALUE_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined =>
  typeof v === 'string' ? v.trim() : undefined;

// ---------------------------------------------------------------------------
// Form structure
// ---------------------------------------------------------------------------

export interface SchemaResult {
  /** A cleaned copy: only known properties survive. Use this, not the input. */
  schema: FormSchema;
  errors: string[];
}

export function validateFormSchema(raw: unknown): SchemaResult {
  const errors: string[] = [];
  const fail = (message: string) => errors.push(message);
  const sections: FormSection[] = [];

  if (!isObj(raw) || !Array.isArray(raw['sections'])) {
    return {
      schema: { sections },
      errors: ['The form must have a list of sections'],
    };
  }
  if (raw['sections'].length === 0) fail('The form needs at least one section');
  if (raw['sections'].length > LIMITS.sections)
    fail(`A form can have at most ${LIMITS.sections} sections`);

  const fieldIds = new Set<string>();
  const sectionIds = new Set<string>();
  const systemSeen = new Set<string>();
  let fieldCount = 0;

  for (const rawSection of raw['sections'].slice(0, LIMITS.sections)) {
    if (!isObj(rawSection)) {
      fail('Each section must be an object');
      continue;
    }
    const id = str(rawSection['id']) ?? '';
    const title = str(rawSection['title']) ?? '';
    if (!ID_PATTERN.test(id))
      fail(
        `Section id "${id}" must be letters and digits, starting with a letter`,
      );
    else if (sectionIds.has(id)) fail(`Section id "${id}" is used twice`);
    sectionIds.add(id);
    if (!title || title.length > 150)
      fail(`Section "${id}" needs a title of 1 to 150 characters`);
    const description = str(rawSection['description']);
    if (description && description.length > 500)
      fail(`Section "${id}" description is too long`);

    const fields: FormField[] = [];
    if (!Array.isArray(rawSection['fields'])) {
      fail(`Section "${id}" must have a list of fields`);
    } else {
      for (const rawField of rawSection['fields']) {
        fieldCount++;
        const field = readField(rawField, {
          fail,
          fieldIds,
          systemSeen,
          topLevel: true,
        });
        if (field) fields.push(field);
      }
    }
    sections.push({
      id,
      title,
      ...(description ? { description } : {}),
      fields,
    });
  }

  if (fieldCount > LIMITS.fields)
    fail(`A form can have at most ${LIMITS.fields} fields`);
  return { schema: { sections }, errors };
}

interface ReadContext {
  fail: (message: string) => void;
  fieldIds: Set<string>;
  systemSeen: Set<string>;
  topLevel: boolean;
}

function readField(raw: unknown, ctx: ReadContext): FormField | null {
  if (!isObj(raw)) {
    ctx.fail('Each field must be an object');
    return null;
  }
  const { fail } = ctx;
  const id = str(raw['id']) ?? '';
  const label = str(raw['label']) ?? '';
  const type = raw['type'] as FieldType;
  const name = id || '(no id)';

  if (!ID_PATTERN.test(id))
    fail(
      `Field id "${id}" must be letters and digits, starting with a letter (up to 40)`,
    );
  else if (ctx.fieldIds.has(id)) fail(`Field id "${id}" is used twice`);
  ctx.fieldIds.add(id);
  if (!label || label.length > 150)
    fail(`Field "${name}" needs a label of 1 to 150 characters`);
  if (!FIELD_TYPES.includes(type)) {
    fail(`Field "${name}" has an unknown type`);
    return null;
  }
  if (!ctx.topLevel && !GROUP_FIELD_TYPES.includes(type)) {
    fail(
      `Field "${name}": a repeating group can only hold text, number, date and select fields`,
    );
  }

  const field: FormField = { id, type, label };
  if (raw['required'] === true) field.required = true;

  const helpText = str(raw['helpText']);
  if (helpText) {
    if (helpText.length > 300) fail(`Field "${name}" help text is too long`);
    field.helpText = helpText;
  }
  const placeholder = str(raw['placeholder']);
  if (placeholder) {
    if (placeholder.length > 100)
      fail(`Field "${name}" placeholder is too long`);
    field.placeholder = placeholder;
  }
  if (raw['width'] !== undefined) {
    if (FIELD_WIDTHS.includes(raw['width'] as FieldWidth))
      field.width = raw['width'] as FieldWidth;
    else fail(`Field "${name}" has an unknown width`);
  }
  if (raw['newRow'] !== undefined) {
    if (typeof raw['newRow'] === 'boolean') field.newRow = raw['newRow'];
    else fail(`Field "${name}": newRow must be true or false`);
  }

  readLimits(raw, field, name, fail);
  readOptions(raw, field, name, fail);
  readSystem(raw, field, name, ctx);
  readGroup(raw, field, name, ctx);
  return field;
}

function readLimits(
  raw: Obj,
  field: FormField,
  name: string,
  fail: (m: string) => void,
) {
  const num = (key: 'maxLength' | 'min' | 'max') => {
    if (raw[key] === undefined) return;
    if (typeof raw[key] !== 'number' || !Number.isFinite(raw[key]))
      fail(`Field "${name}": ${key} must be a number`);
    else field[key] = raw[key];
  };
  if (field.type === 'text' || field.type === 'textarea') {
    num('maxLength');
    if (
      field.maxLength !== undefined &&
      (!Number.isInteger(field.maxLength) ||
        field.maxLength < 1 ||
        field.maxLength > 5000)
    ) {
      fail(`Field "${name}": maxLength must be a whole number from 1 to 5000`);
    }
  }
  if (field.type === 'number') {
    num('min');
    num('max');
    if (
      field.min !== undefined &&
      field.max !== undefined &&
      field.min > field.max
    ) {
      fail(`Field "${name}": min cannot be more than max`);
    }
  }
}

function readOptions(
  raw: Obj,
  field: FormField,
  name: string,
  fail: (m: string) => void,
) {
  const takesOptions = field.type === 'select' || field.type === 'radio';
  if (raw['optionsFrom'] !== undefined) {
    if (field.type === 'select' && raw['optionsFrom'] === 'classes')
      field.optionsFrom = 'classes';
    else
      fail(
        `Field "${name}": optionsFrom is only allowed as "classes" on a select`,
      );
  }
  if (!takesOptions) return;
  if (field.optionsFrom) return; // options come from the school's classes

  const options = raw['options'];
  if (!Array.isArray(options) || options.length === 0) {
    fail(`Field "${name}" needs at least one option`);
    return;
  }
  if (options.length > LIMITS.options)
    fail(`Field "${name}" can have at most ${LIMITS.options} options`);
  const seen = new Set<string>();
  field.options = [];
  for (const o of options.slice(0, LIMITS.options)) {
    const value = isObj(o) ? str(o['value']) : undefined;
    const label = isObj(o) ? str(o['label']) : undefined;
    if (!value || !OPTION_VALUE_PATTERN.test(value)) {
      fail(
        `Field "${name}": option values use letters, digits, "-" and "_" (up to 40)`,
      );
      continue;
    }
    if (!label || label.length > 100) {
      fail(
        `Field "${name}": option "${value}" needs a label of 1 to 100 characters`,
      );
      continue;
    }
    if (seen.has(value))
      fail(`Field "${name}": option value "${value}" is used twice`);
    seen.add(value);
    field.options.push({ value, label });
  }
}

function readSystem(
  raw: Obj,
  field: FormField,
  name: string,
  ctx: ReadContext,
) {
  if (raw['system'] === undefined) return;
  const key = raw['system'] as SystemFieldKey;
  const rule = SYSTEM_FIELDS[key];
  if (!ctx.topLevel || !rule) {
    ctx.fail(`Field "${name}" links to an unknown core field`);
    return;
  }
  if (ctx.systemSeen.has(key))
    ctx.fail(`Core field "${key}" is used on more than one field`);
  ctx.systemSeen.add(key);
  if (field.type !== rule.type)
    ctx.fail(`Field "${name}" (${key}) must be of type ${rule.type}`);
  if (key === 'student.class' && field.optionsFrom !== 'classes') {
    ctx.fail(`Field "${name}" (${key}) must take its options from the classes`);
  }
  if (
    key === 'student.gender' &&
    field.options?.some((o) => !GENDER_VALUES.includes(o.value))
  ) {
    ctx.fail(
      `Field "${name}" (${key}): option values must be ${GENDER_VALUES.join(', ')}`,
    );
  }
  field.system = key;
}

function readGroup(raw: Obj, field: FormField, name: string, ctx: ReadContext) {
  if (field.type !== 'group') return;
  const sub = raw['fields'];
  if (!Array.isArray(sub) || sub.length === 0) {
    ctx.fail(`Field "${name}" (group) needs at least one column`);
    return;
  }
  if (sub.length > LIMITS.groupFields)
    ctx.fail(
      `Field "${name}": a group can have at most ${LIMITS.groupFields} columns`,
    );

  const subIds = new Set<string>();
  field.fields = [];
  for (const s of sub.slice(0, LIMITS.groupFields)) {
    const child = readField(s, {
      fail: ctx.fail,
      fieldIds: subIds, // column ids only need to be unique within the group
      systemSeen: ctx.systemSeen,
      topLevel: false,
    });
    if (child) field.fields.push(child);
  }
  if (raw['maxItems'] !== undefined) {
    const n = raw['maxItems'];
    if (
      typeof n !== 'number' ||
      !Number.isInteger(n) ||
      n < 1 ||
      n > LIMITS.maxGroupRows
    ) {
      ctx.fail(
        `Field "${name}": maxItems must be a whole number from 1 to ${LIMITS.maxGroupRows}`,
      );
    } else field.maxItems = n;
  }
}

/** Extra rules that must hold before a form can be published. */
export function publishErrors(
  schema: FormSchema,
  requiredSystem: SystemFieldKey[],
): string[] {
  const present = new Map<string, FormField>();
  for (const section of schema.sections) {
    for (const f of section.fields) if (f.system) present.set(f.system, f);
  }
  const errors: string[] = [];
  for (const key of requiredSystem) {
    const f = present.get(key);
    if (!f) errors.push(`The core field "${key}" is missing`);
    else if (SYSTEM_FIELDS[key].required && !f.required) {
      errors.push(`The field "${f.label}" (${key}) must stay required`);
    }
  }
  return errors;
}

export const allFields = (schema: FormSchema): FormField[] =>
  schema.sections.flatMap((s) => s.fields);

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export interface AnswerContext {
  /** Ids of the school's classes, for fields that take their options from them. */
  classIds: Set<string>;
  /** Ids of uploaded photos that exist in this school, for photo fields. */
  fileIds: Set<string>;
}

export interface AnswerResult {
  /** Only known fields, trimmed and typed. Empty values are left out. */
  answers: Record<string, unknown>;
  /** field id (or `group[0].column`) to a message the user can read. */
  errors: Record<string, string>;
}

const isEmpty = (v: unknown) =>
  v === undefined ||
  v === null ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0);

export function validateAnswers(
  schema: FormSchema,
  raw: unknown,
  ctx: AnswerContext,
): AnswerResult {
  const answers: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  const input: Obj = isObj(raw) ? raw : {};

  for (const field of allFields(schema)) {
    checkField(field, input[field.id], field.id, ctx, answers, errors);
  }
  return { answers, errors };
}

function checkField(
  field: FormField,
  value: unknown,
  path: string,
  ctx: AnswerContext,
  out: Obj,
  errors: Record<string, string>,
) {
  const key = path.includes('.')
    ? path.slice(path.lastIndexOf('.') + 1)
    : field.id;
  const bad = (message: string) => {
    errors[path] = message;
  };

  if (field.type === 'checkbox') {
    if (value === undefined || value === null || value === false) {
      if (field.required) bad(`${field.label} must be ticked`);
      else if (value === false) out[key] = false;
      return;
    }
    if (value !== true) return bad(`${field.label} must be yes or no`);
    out[key] = true;
    return;
  }

  if (isEmpty(value)) {
    if (field.required) bad(`${field.label} is required`);
    return;
  }

  switch (field.type) {
    case 'text':
    case 'textarea': {
      if (typeof value !== 'string') return bad(`${field.label} must be text`);
      const text = value.trim();
      const max =
        field.maxLength ??
        (field.type === 'text'
          ? LIMITS.defaultTextLength
          : LIMITS.defaultTextareaLength);
      if (text.length > max)
        return bad(`${field.label} must be at most ${max} characters`);
      out[key] = text;
      return;
    }
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value))
        return bad(`${field.label} must be a number`);
      if (field.min !== undefined && value < field.min)
        return bad(`${field.label} must be at least ${field.min}`);
      if (field.max !== undefined && value > field.max)
        return bad(`${field.label} must be at most ${field.max}`);
      out[key] = value;
      return;
    }
    case 'date': {
      if (typeof value !== 'string' || !isRealDate(value))
        return bad(`${field.label} must be a valid date`);
      out[key] = value;
      return;
    }
    case 'image': {
      // The value is the id of a file uploaded earlier; the service checked which ids are real.
      if (typeof value !== 'string' || !ctx.fileIds.has(value))
        return bad(`${field.label}: upload the photograph again`);
      out[key] = value;
      return;
    }
    case 'select':
    case 'radio': {
      if (typeof value !== 'string')
        return bad(`${field.label}: choose one of the options`);
      const allowed =
        field.optionsFrom === 'classes'
          ? ctx.classIds.has(value)
          : !!field.options?.some((o) => o.value === value);
      if (!allowed) return bad(`${field.label}: choose one of the options`);
      out[key] = value;
      return;
    }
    case 'group': {
      if (!Array.isArray(value)) return bad(`${field.label} must be a list`);
      const maxRows = field.maxItems ?? LIMITS.defaultGroupRows;
      if (value.length > maxRows)
        return bad(`${field.label} can have at most ${maxRows} rows`);

      const rows: Obj[] = [];
      value.forEach((rawRow, i) => {
        if (!isObj(rawRow)) return;
        // A row the user added but left completely empty is simply dropped.
        const blank = (field.fields ?? []).every((c) => isEmpty(rawRow[c.id]));
        if (blank) return;
        const row: Obj = {};
        for (const column of field.fields ?? []) {
          checkField(
            column,
            rawRow[column.id],
            `${path}[${i}].${column.id}`,
            ctx,
            row,
            errors,
          );
        }
        if (Object.keys(row).length > 0) rows.push(row); // blank rows are dropped
      });
      if (rows.length === 0 && field.required)
        bad(`${field.label} needs at least one row`);
      else if (rows.length > 0) out[key] = rows;
      return;
    }
  }
}

function isRealDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/** The answer given to the field linked to a core field, or undefined. */
export function systemValue(
  schema: FormSchema,
  answers: Record<string, unknown>,
  key: SystemFieldKey,
): unknown {
  const field = allFields(schema).find((f) => f.system === key);
  return field ? answers[field.id] : undefined;
}

/** The file ids given for photo fields, so the service can check they exist before validating. */
export function photoIds(schema: FormSchema, raw: unknown): string[] {
  if (!isObj(raw)) return [];
  return allFields(schema)
    .filter((f) => f.type === 'image')
    .flatMap((f) =>
      typeof raw[f.id] === 'string' ? [raw[f.id] as string] : [],
    );
}
