import { FieldOption, FormField, FormSchema, FormSection } from '../../core/models';

/**
 * Editing a form definition. Every function returns a new schema and leaves the
 * old one untouched, so the builder can keep its saved copy for "unsaved changes".
 */

/** "Blood group" -> "bloodGroup". Always a valid field id, and not one already in use. */
export function toFieldId(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const words = label.match(/[A-Za-z0-9]+/g) ?? [];
  let base = words
    .map((w, i) =>
      i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join('');
  if (!base) base = 'field';
  if (/^[0-9]/.test(base)) base = 'f' + base;
  base = base.slice(0, 34);

  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}${n}`;
  return id;
}

/** "Type A+" -> "TYPE_A". Option values are upper-case words, unique within the field. */
export function toOptionValue(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const words = label.match(/[A-Za-z0-9]+/g) ?? [];
  const base = words.join('_').toUpperCase().slice(0, 34) || 'OPTION';
  let value = base;
  for (let n = 2; used.has(value); n++) value = `${base}_${n}`;
  return value;
}

/** Turns one option label per line into options, keeping the value of a label that already existed. */
export function optionsFromLines(lines: string[], existing: FieldOption[] = []): FieldOption[] {
  const labels = lines.map((l) => l.trim()).filter(Boolean);
  const out: FieldOption[] = [];
  const seen = new Set<string>();
  for (const label of labels) {
    if (seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    const kept = existing.find((o) => o.label === label && !out.some((x) => x.value === o.value));
    out.push({
      label,
      value:
        kept?.value ??
        toOptionValue(label, [...out.map((o) => o.value), ...existing.map((o) => o.value)]),
    });
  }
  return out;
}

export const fieldIds = (schema: FormSchema): string[] =>
  schema.sections.flatMap((s) => s.fields.map((f) => f.id));

const mapSection = (
  schema: FormSchema,
  sectionId: string,
  change: (s: FormSection) => FormSection,
): FormSchema => ({
  sections: schema.sections.map((s) => (s.id === sectionId ? change(s) : s)),
});

function move<T>(list: T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (index < 0 || to < 0 || to >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[to]] = [copy[to], copy[index]];
  return copy;
}

// ---------- sections ----------

export function addSection(schema: FormSchema, title = 'New section'): FormSchema {
  const taken = schema.sections.map((s) => s.id);
  return { sections: [...schema.sections, { id: toFieldId(title, taken), title, fields: [] }] };
}

export function renameSection(
  schema: FormSchema,
  sectionId: string,
  title: string,
  description?: string,
): FormSchema {
  return mapSection(schema, sectionId, (s) => ({
    ...s,
    title,
    ...(description ? { description } : { description: undefined }),
  }));
}

export function moveSection(schema: FormSchema, sectionId: string, by: -1 | 1): FormSchema {
  const index = schema.sections.findIndex((s) => s.id === sectionId);
  return { sections: move(schema.sections, index, by) };
}

/** A section holding a core field cannot be removed, because the system depends on that field. */
export const canRemoveSection = (section: FormSection): boolean =>
  !section.fields.some((f) => f.system);

export function removeSection(schema: FormSchema, sectionId: string): FormSchema {
  const section = schema.sections.find((s) => s.id === sectionId);
  if (!section || !canRemoveSection(section)) return schema;
  return { sections: schema.sections.filter((s) => s.id !== sectionId) };
}

// ---------- fields ----------

export const addField = (schema: FormSchema, sectionId: string, field: FormField): FormSchema =>
  mapSection(schema, sectionId, (s) => ({ ...s, fields: [...s.fields, field] }));

export const updateField = (schema: FormSchema, field: FormField): FormSchema => ({
  sections: schema.sections.map((s) => ({
    ...s,
    fields: s.fields.map((f) => (f.id === field.id ? field : f)),
  })),
});

export const moveField = (
  schema: FormSchema,
  sectionId: string,
  fieldId: string,
  by: -1 | 1,
): FormSchema =>
  mapSection(schema, sectionId, (s) => ({
    ...s,
    fields: move(
      s.fields,
      s.fields.findIndex((f) => f.id === fieldId),
      by,
    ),
  }));

/** Core fields stay: the rest of the system relies on them. */
export function removeField(schema: FormSchema, fieldId: string): FormSchema {
  return {
    sections: schema.sections.map((s) => ({
      ...s,
      fields: s.fields.filter((f) => f.id !== fieldId || f.system),
    })),
  };
}
