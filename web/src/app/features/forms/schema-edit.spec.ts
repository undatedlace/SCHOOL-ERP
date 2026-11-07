import { FormField, FormSchema } from '../../core/models';
import {
  addField,
  addSection,
  canRemoveSection,
  fieldIds,
  moveField,
  moveSection,
  optionsFromLines,
  removeField,
  removeSection,
  renameSection,
  toFieldId,
  toOptionValue,
  updateField,
} from './schema-edit';

const text = (id: string, extra: Partial<FormField> = {}): FormField => ({
  id,
  type: 'text',
  label: id,
  ...extra,
});
const schema = (): FormSchema => ({
  sections: [
    {
      id: 'a',
      title: 'A',
      fields: [text('one'), text('surname', { system: 'student.surname' }), text('three')],
    },
    { id: 'b', title: 'B', fields: [text('four')] },
  ],
});

describe('toFieldId', () => {
  it('makes a camelCase id from a label', () => {
    expect(toFieldId('Blood group', [])).toBe('bloodGroup');
    expect(toFieldId("Father's name (as per ID)", [])).toBe('fatherSNameAsPerId');
  });

  it('always returns a valid id', () => {
    expect(toFieldId('', [])).toBe('field');
    expect(toFieldId('!!!', [])).toBe('field');
    expect(toFieldId('3rd language', [])).toBe('f3rdLanguage');
    expect(toFieldId('x'.repeat(80), []).length).toBeLessThanOrEqual(40);
    expect(toFieldId('Blood group', [])).toMatch(/^[a-zA-Z][a-zA-Z0-9]{0,39}$/);
  });

  it('does not reuse an id that is taken', () => {
    expect(toFieldId('Blood group', ['bloodGroup'])).toBe('bloodGroup2');
    expect(toFieldId('Blood group', ['bloodGroup', 'bloodGroup2'])).toBe('bloodGroup3');
  });
});

describe('option helpers', () => {
  it('makes option values from labels', () => {
    expect(toOptionValue('Type A+', [])).toBe('TYPE_A');
    expect(toOptionValue('', [])).toBe('OPTION');
    expect(toOptionValue('Red', ['RED'])).toBe('RED_2');
  });

  it('turns lines into options, skipping blanks and duplicates', () => {
    expect(optionsFromLines(['Red', ' Blue ', '', 'red'])).toEqual([
      { value: 'RED', label: 'Red' },
      { value: 'BLUE', label: 'Blue' },
    ]);
  });

  it('keeps the value of a label that already existed, so old answers still match', () => {
    const existing = [
      { value: 'A_POS', label: 'A+' },
      { value: 'O_POS', label: 'O+' },
    ];
    const out = optionsFromLines(['O+', 'AB+', 'A+'], existing);
    expect(out).toEqual([
      { value: 'O_POS', label: 'O+' },
      { value: 'AB', label: 'AB+' },
      { value: 'A_POS', label: 'A+' },
    ]);
  });

  it('never gives two options the same value', () => {
    const out = optionsFromLines(['A+', 'A-']);
    expect(new Set(out.map((o) => o.value)).size).toBe(2);
  });
});

describe('sections', () => {
  it('adds a section with a unique id', () => {
    const s = addSection(addSection(schema(), 'Health'), 'Health');
    expect(s.sections.map((x) => x.id)).toEqual(['a', 'b', 'health', 'health2']);
  });

  it('renames and moves sections without mutating the original', () => {
    const original = schema();
    const renamed = renameSection(original, 'a', 'Student', 'About the child');
    expect(renamed.sections[0]).toMatchObject({ title: 'Student', description: 'About the child' });
    expect(original.sections[0].title).toBe('A');

    expect(moveSection(original, 'b', -1).sections.map((x) => x.id)).toEqual(['b', 'a']);
    expect(moveSection(original, 'a', -1).sections.map((x) => x.id)).toEqual(['a', 'b']); // already first
    expect(moveSection(original, 'b', 1).sections.map((x) => x.id)).toEqual(['a', 'b']); // already last
  });

  it('refuses to remove a section that holds a core field', () => {
    const s = schema();
    expect(canRemoveSection(s.sections[0])).toBe(false);
    expect(removeSection(s, 'a').sections).toHaveLength(2);
    expect(canRemoveSection(s.sections[1])).toBe(true);
    expect(removeSection(s, 'b').sections.map((x) => x.id)).toEqual(['a']);
  });
});

describe('fields', () => {
  it('adds, updates and lists fields', () => {
    let s = addField(schema(), 'b', text('five'));
    expect(fieldIds(s)).toEqual(['one', 'surname', 'three', 'four', 'five']);
    s = updateField(s, { ...text('five'), label: 'Five!', required: true });
    expect(s.sections[1].fields[1]).toMatchObject({ label: 'Five!', required: true });
  });

  it('moves a field within its section only', () => {
    const s = schema();
    expect(moveField(s, 'a', 'three', -1).sections[0].fields.map((f) => f.id)).toEqual([
      'one',
      'three',
      'surname',
    ]);
    expect(moveField(s, 'a', 'one', -1).sections[0].fields.map((f) => f.id)).toEqual([
      'one',
      'surname',
      'three',
    ]);
    expect(moveField(s, 'b', 'four', 1).sections[1].fields.map((f) => f.id)).toEqual(['four']);
  });

  it('removes ordinary fields but never a core field', () => {
    expect(fieldIds(removeField(schema(), 'three'))).toEqual(['one', 'surname', 'four']);
    expect(fieldIds(removeField(schema(), 'surname'))).toContain('surname');
  });
});
