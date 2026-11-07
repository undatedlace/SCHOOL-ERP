import { DEFAULT_ADMISSION_FORM } from './default-admission-form.js';
import {
  FormSchema,
  SYSTEM_FIELDS,
  SystemFieldKey,
  allFields,
  publishErrors,
  validateAnswers,
  validateFormSchema,
} from './form-schema.js';

const clone = <T>(v: T): T => structuredClone(v);
const REQUIRED_SYSTEM = Object.keys(SYSTEM_FIELDS).filter(
  (k) => SYSTEM_FIELDS[k as SystemFieldKey].required,
) as SystemFieldKey[];

const form = (...fields: object[]) => ({
  sections: [{ id: 's1', title: 'Section', fields }],
});
const CLASS_A = '00000000-0000-7000-8000-00000000000a';
const ctx = { classIds: new Set([CLASS_A]) };

describe('validateFormSchema', () => {
  it('accepts the default admission form and keeps it unchanged', () => {
    const { schema, errors } = validateFormSchema(DEFAULT_ADMISSION_FORM);
    expect(errors).toEqual([]);
    expect(schema).toEqual(DEFAULT_ADMISSION_FORM);
  });

  it('the default admission form is publishable', () => {
    expect(publishErrors(DEFAULT_ADMISSION_FORM, REQUIRED_SYSTEM)).toEqual([]);
  });

  it('drops unknown properties instead of storing them', () => {
    const { schema, errors } = validateFormSchema(
      form({
        id: 'a',
        type: 'text',
        label: 'A',
        evil: '<script>',
        extra: { x: 1 },
      }),
    );
    expect(errors).toEqual([]);
    expect(allFields(schema)[0]).toEqual({ id: 'a', type: 'text', label: 'A' });
  });

  it.each([
    ['null', null],
    ['no sections', { sections: [] }],
    ['sections not a list', { sections: 'x' }],
  ])('rejects %s', (_name, raw) => {
    expect(validateFormSchema(raw).errors.length).toBeGreaterThan(0);
  });

  it('rejects duplicate field ids, bad ids and missing labels', () => {
    const dup = validateFormSchema(
      form(
        { id: 'a', type: 'text', label: 'A' },
        { id: 'a', type: 'text', label: 'B' },
      ),
    );
    expect(dup.errors.join()).toMatch(/used twice/);

    expect(
      validateFormSchema(
        form({ id: '1bad', type: 'text', label: 'A' }),
      ).errors.join(),
    ).toMatch(/must be letters/);
    expect(
      validateFormSchema(form({ id: 'has space', type: 'text', label: 'A' }))
        .errors.length,
    ).toBeGreaterThan(0);
    expect(
      validateFormSchema(
        form({ id: 'a', type: 'text', label: '  ' }),
      ).errors.join(),
    ).toMatch(/label/);
  });

  it('rejects unknown field types', () => {
    expect(
      validateFormSchema(
        form({ id: 'a', type: 'signature', label: 'A' }),
      ).errors.join(),
    ).toMatch(/unknown type/);
  });

  it('requires options for select and radio, with unique valid values', () => {
    expect(
      validateFormSchema(
        form({ id: 'a', type: 'select', label: 'A' }),
      ).errors.join(),
    ).toMatch(/at least one option/);
    expect(
      validateFormSchema(
        form({
          id: 'a',
          type: 'radio',
          label: 'A',
          options: [
            { value: 'x', label: 'X' },
            { value: 'x', label: 'Y' },
          ],
        }),
      ).errors.join(),
    ).toMatch(/used twice/);
    expect(
      validateFormSchema(
        form({
          id: 'a',
          type: 'select',
          label: 'A',
          options: [{ value: 'a b', label: 'X' }],
        }),
      ).errors.length,
    ).toBeGreaterThan(0);
  });

  it('checks number limits', () => {
    expect(
      validateFormSchema(
        form({ id: 'a', type: 'number', label: 'A', min: 5, max: 1 }),
      ).errors.join(),
    ).toMatch(/min cannot/);
    expect(
      validateFormSchema(
        form({ id: 'a', type: 'number', label: 'A', min: 1, max: 5 }),
      ).errors,
    ).toEqual([]);
  });

  describe('repeating groups', () => {
    const group = (over: object = {}) =>
      form({
        id: 'g',
        type: 'group',
        label: 'G',
        fields: [
          { id: 'name', type: 'text', label: 'Name' },
          { id: 'age', type: 'number', label: 'Age' },
        ],
        ...over,
      });

    it('accepts a group of simple columns', () => {
      expect(validateFormSchema(group({ maxItems: 4 })).errors).toEqual([]);
    });

    it('needs columns, and does not nest groups or allow other types', () => {
      expect(
        validateFormSchema(
          form({ id: 'g', type: 'group', label: 'G' }),
        ).errors.join(),
      ).toMatch(/at least one column/);
      expect(
        validateFormSchema(
          group({
            fields: [
              {
                id: 'x',
                type: 'group',
                label: 'X',
                fields: [{ id: 'y', type: 'text', label: 'Y' }],
              },
            ],
          }),
        ).errors.join(),
      ).toMatch(/can only hold/);
      expect(
        validateFormSchema(
          group({ fields: [{ id: 'x', type: 'checkbox', label: 'X' }] }),
        ).errors.join(),
      ).toMatch(/can only hold/);
    });

    it('limits the number of rows', () => {
      expect(validateFormSchema(group({ maxItems: 0 })).errors.join()).toMatch(
        /maxItems/,
      );
      expect(validateFormSchema(group({ maxItems: 21 })).errors.join()).toMatch(
        /maxItems/,
      );
    });
  });

  describe('core (system) fields', () => {
    const sys = (overrides: object) => ({
      id: 'dob',
      type: 'date',
      label: 'DOB',
      system: 'student.dateOfBirth',
      ...overrides,
    });

    it('rejects an unknown core field, a wrong type and a duplicate', () => {
      expect(
        validateFormSchema(
          form(sys({ system: 'student.shoeSize' })),
        ).errors.join(),
      ).toMatch(/unknown core field/);
      expect(
        validateFormSchema(form(sys({ type: 'text' }))).errors.join(),
      ).toMatch(/must be of type date/);
      expect(
        validateFormSchema(form(sys({}), sys({ id: 'dob2' }))).errors.join(),
      ).toMatch(/more than one field/);
    });

    it('the class field must take its options from the classes', () => {
      const bad = form({
        id: 'c',
        type: 'select',
        label: 'Class',
        system: 'student.class',
        options: [{ value: 'a', label: 'A' }],
      });
      expect(validateFormSchema(bad).errors.join()).toMatch(
        /options from the classes/,
      );
    });

    it('gender options are limited to MALE, FEMALE and OTHER', () => {
      const bad = form({
        id: 'g',
        type: 'radio',
        label: 'Gender',
        system: 'student.gender',
        options: [{ value: 'robot', label: 'Robot' }],
      });
      expect(validateFormSchema(bad).errors.join()).toMatch(
        /MALE, FEMALE, OTHER/,
      );
    });
  });
});

describe('publishErrors', () => {
  it('reports missing core fields', () => {
    const schema = clone(DEFAULT_ADMISSION_FORM);
    schema.sections[1].fields = schema.sections[1].fields.filter(
      (f) => f.system !== 'student.dateOfBirth',
    );
    expect(publishErrors(schema, REQUIRED_SYSTEM).join()).toMatch(
      /student.dateOfBirth/,
    );
  });

  it('requires the mandatory core fields to stay required', () => {
    const schema = clone(DEFAULT_ADMISSION_FORM);
    const surname = schema.sections[1].fields.find(
      (f) => f.system === 'student.surname',
    )!;
    surname.required = false;
    expect(publishErrors(schema, REQUIRED_SYSTEM).join()).toMatch(
      /must stay required/,
    );
  });
});

describe('validateAnswers', () => {
  const schema: FormSchema = validateFormSchema(
    form(
      {
        id: 'name',
        type: 'text',
        label: 'Name',
        required: true,
        maxLength: 10,
      },
      { id: 'bio', type: 'textarea', label: 'Bio' },
      { id: 'age', type: 'number', label: 'Age', min: 3, max: 10 },
      { id: 'dob', type: 'date', label: 'Date of birth' },
      {
        id: 'colour',
        type: 'select',
        label: 'Colour',
        options: [{ value: 'red', label: 'Red' }],
      },
      {
        id: 'gender',
        type: 'radio',
        label: 'Gender',
        options: [{ value: 'MALE', label: 'Male' }],
      },
      { id: 'cls', type: 'select', label: 'Class', optionsFrom: 'classes' },
      { id: 'agreed', type: 'checkbox', label: 'Agreed', required: true },
      {
        id: 'siblings',
        type: 'group',
        label: 'Siblings',
        maxItems: 2,
        fields: [
          { id: 'name', type: 'text', label: 'Name', required: true },
          { id: 'age', type: 'number', label: 'Age' },
        ],
      },
    ),
  ).schema;

  const valid = { name: 'Asha', agreed: true };

  it('accepts valid answers and returns them cleaned', () => {
    const { answers, errors } = validateAnswers(
      schema,
      {
        name: '  Asha  ',
        bio: '',
        age: 7,
        dob: '2019-02-28',
        colour: 'red',
        gender: 'MALE',
        cls: CLASS_A,
        agreed: true,
        junk: 'ignored',
        siblings: [
          { name: 'Zayd', age: 9 },
          { name: '', age: null },
        ],
      },
      ctx,
    );
    expect(errors).toEqual({});
    expect(answers).toEqual({
      name: 'Asha',
      age: 7,
      dob: '2019-02-28',
      colour: 'red',
      gender: 'MALE',
      cls: CLASS_A,
      agreed: true,
      siblings: [{ name: 'Zayd', age: 9 }], // the blank row is dropped
    });
  });

  it('reports required fields, including checkboxes that must be ticked', () => {
    const { errors } = validateAnswers(schema, {}, ctx);
    expect(errors['name']).toBe('Name is required');
    expect(errors['agreed']).toBe('Agreed must be ticked');
    expect(
      validateAnswers(schema, { name: 'A', agreed: false }, ctx).errors[
        'agreed'
      ],
    ).toBeDefined();
  });

  it('accepts no input at all as "everything empty"', () => {
    expect(
      Object.keys(validateAnswers(schema, null, ctx).errors).sort(),
    ).toEqual(['agreed', 'name']);
    expect(
      Object.keys(validateAnswers(schema, 'nonsense', ctx).errors).sort(),
    ).toEqual(['agreed', 'name']);
  });

  it.each([
    ['name too long', { name: 'x'.repeat(11) }, 'name', /at most 10/],
    ['name not text', { name: 5 }, 'name', /must be text/],
    ['age below min', { age: 2 }, 'age', /at least 3/],
    ['age above max', { age: 11 }, 'age', /at most 10/],
    ['age as text', { age: '7' }, 'age', /must be a number/],
    ['age NaN-like', { age: Infinity }, 'age', /must be a number/],
    ['impossible date', { dob: '2019-02-30' }, 'dob', /valid date/],
    ['date in wrong format', { dob: '28/02/2019' }, 'dob', /valid date/],
    ['option not offered', { colour: 'blue' }, 'colour', /choose one/],
    ['radio not offered', { gender: 'FEMALE' }, 'gender', /choose one/],
    [
      'class not in this school',
      { cls: '00000000-0000-7000-8000-0000000000ff' },
      'cls',
      /choose one/,
    ],
    ['checkbox as text', { agreed: 'yes' }, 'agreed', /yes or no/],
  ])('rejects %s', (_name, patch, field, message) => {
    const { errors } = validateAnswers(schema, { ...valid, ...patch }, ctx);
    expect(errors[field]).toMatch(message);
  });

  it('validates every row of a repeating group, and limits the rows', () => {
    const rows = validateAnswers(
      schema,
      { ...valid, siblings: [{ name: 'A', age: 'x' }, { age: 5 }] },
      ctx,
    );
    expect(rows.errors['siblings[0].age']).toMatch(/must be a number/);
    expect(rows.errors['siblings[1].name']).toBe('Name is required');

    const tooMany = validateAnswers(
      schema,
      { ...valid, siblings: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] },
      ctx,
    );
    expect(tooMany.errors['siblings']).toMatch(/at most 2 rows/);

    expect(
      validateAnswers(schema, { ...valid, siblings: 'x' }, ctx).errors[
        'siblings'
      ],
    ).toMatch(/must be a list/);
  });

  it('does not let an answer be stored for a field the form does not have', () => {
    const { answers } = validateAnswers(
      schema,
      { ...valid, hacked: 'yes', __proto__: { x: 1 } },
      ctx,
    );
    expect(answers).not.toHaveProperty('hacked');
    expect(answers).not.toHaveProperty('x');
  });

  it('applies the default admission form rules end to end', () => {
    const admission = validateFormSchema(DEFAULT_ADMISSION_FORM).schema;
    const ok = validateAnswers(
      admission,
      {
        classApplied: CLASS_A,
        surname: 'Shaikh',
        firstName: 'Ayaan',
        gender: 'MALE',
        dateOfBirth: '2021-06-15',
        undertakingReceived: true,
        monthlyIncome: 25000,
        siblings: [{ name: 'Sara', age: 8, school: 'Hera', class: '3' }],
      },
      ctx,
    );
    expect(ok.errors).toEqual({});

    const missing = validateAnswers(admission, { classApplied: CLASS_A }, ctx);
    expect(Object.keys(missing.errors).sort()).toEqual(
      [
        'dateOfBirth',
        'firstName',
        'gender',
        'surname',
        'undertakingReceived',
      ].sort(),
    );
  });
});
