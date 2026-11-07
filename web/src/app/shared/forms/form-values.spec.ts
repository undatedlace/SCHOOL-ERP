import { FormArray, FormGroup } from '@angular/forms';
import { FormField } from '../../core/models';
import { buildGroup, newRow, readAnswers } from './form-values';

const fields: FormField[] = [
  { id: 'name', type: 'text', label: 'Name', required: true, maxLength: 10 },
  { id: 'notes', type: 'textarea', label: 'Notes' },
  { id: 'age', type: 'number', label: 'Age', min: 3, max: 10 },
  { id: 'dob', type: 'date', label: 'Date of birth' },
  {
    id: 'colour',
    type: 'select',
    label: 'Colour',
    required: true,
    options: [{ value: 'red', label: 'Red' }],
  },
  { id: 'gender', type: 'radio', label: 'Gender', options: [{ value: 'MALE', label: 'Male' }] },
  { id: 'agreed', type: 'checkbox', label: 'Agreed', required: true },
  { id: 'photo', type: 'image', label: 'Photograph' },
  {
    id: 'siblings',
    type: 'group',
    label: 'Siblings',
    fields: [
      { id: 'name', type: 'text', label: 'Name' },
      { id: 'age', type: 'number', label: 'Age' },
    ],
  },
];

const siblings = fields.find((f) => f.id === 'siblings')!;

describe('photograph fields', () => {
  it('start empty, hold a file id, and send it back', () => {
    const g = buildGroup(fields, {});
    expect(g.get('photo')?.value).toBeNull();
    g.get('photo')?.setValue('file-1');
    expect(readAnswers(fields, g)).toMatchObject({ photo: 'file-1' });
    expect(readAnswers(fields, buildGroup(fields, { photo: 'file-9' }))).toMatchObject({
      photo: 'file-9',
    });
  });

  it('are left out when empty, and can be required', () => {
    expect(readAnswers(fields, buildGroup(fields, {}))).not.toHaveProperty('photo');
    const required = buildGroup([{ id: 'p', type: 'image', label: 'P', required: true }], {});
    expect(required.get('p')?.hasError('required')).toBe(true);
  });
});

describe('form values', () => {
  it('starts empty with sensible defaults', () => {
    const g = buildGroup(fields, {});
    expect(g.get('name')?.value).toBe('');
    expect(g.get('age')?.value).toBeNull();
    expect(g.get('dob')?.value).toBeNull();
    expect(g.get('colour')?.value).toBeNull();
    expect(g.get('agreed')?.value).toBe(false);
    expect((g.get('siblings') as FormArray).length).toBe(0);
  });

  it('starts from existing answers, turning date strings into dates', () => {
    const g = buildGroup(fields, {
      name: 'Asha',
      dob: '2021-06-15',
      agreed: true,
      siblings: [{ name: 'Zayd', age: 9 }],
    });
    const dob = g.get('dob')?.value as Date;
    expect([dob.getFullYear(), dob.getMonth(), dob.getDate()]).toEqual([2021, 5, 15]);
    expect(g.get('agreed')?.value).toBe(true);
    expect((g.get('siblings') as FormArray).at(0).value).toEqual({ name: 'Zayd', age: 9 });
  });

  describe('validation', () => {
    it('requires what the form requires, including blank-looking text and unticked boxes', () => {
      const g = buildGroup(fields, {});
      expect(g.get('name')?.hasError('required')).toBe(true);
      expect(g.get('colour')?.hasError('required')).toBe(true);
      expect(g.get('agreed')?.hasError('required')).toBe(true);

      g.get('name')?.setValue('   ');
      expect(g.get('name')?.hasError('required')).toBe(true);
      g.get('name')?.setValue('Asha');
      expect(g.get('name')?.valid).toBe(true);
    });

    it('applies length and number limits', () => {
      const g = buildGroup(fields, {});
      g.get('name')?.setValue('x'.repeat(11));
      expect(g.get('name')?.hasError('maxlength')).toBe(true);
      g.get('age')?.setValue(2);
      expect(g.get('age')?.hasError('min')).toBe(true);
      g.get('age')?.setValue(11);
      expect(g.get('age')?.hasError('max')).toBe(true);
      g.get('age')?.setValue(5);
      expect(g.get('age')?.valid).toBe(true);
    });

    it('is valid once the required fields are filled', () => {
      const g = buildGroup(fields, { name: 'Asha', colour: 'red', agreed: true });
      expect(g.valid).toBe(true);
    });
  });

  describe('reading answers back', () => {
    it('leaves out everything that is empty', () => {
      expect(readAnswers(fields, buildGroup(fields, {}))).toEqual({});
    });

    it('trims text, formats dates as YYYY-MM-DD, and keeps numbers and choices', () => {
      const g = buildGroup(fields, {});
      g.patchValue({
        name: '  Asha  ',
        notes: '   ',
        age: 7,
        dob: new Date(2021, 5, 5),
        colour: 'red',
        gender: 'MALE',
        agreed: true,
      });
      expect(readAnswers(fields, g)).toEqual({
        name: 'Asha',
        age: 7,
        dob: '2021-06-05',
        colour: 'red',
        gender: 'MALE',
        agreed: true,
      });
    });

    it('does not send an unticked checkbox', () => {
      expect(readAnswers(fields, buildGroup(fields, { agreed: false }))).not.toHaveProperty(
        'agreed',
      );
    });

    it('sends repeating rows and drops the blank ones', () => {
      const g = buildGroup(fields, {});
      const rows = g.get('siblings') as FormArray;
      rows.push(newRow(siblings));
      rows.push(newRow(siblings));
      (rows.at(0) as FormGroup).patchValue({ name: 'Sara', age: 8 });

      expect(readAnswers(fields, g)).toEqual({ siblings: [{ name: 'Sara', age: 8 }] });
    });

    it('round-trips: what was loaded is what is sent back', () => {
      const answers = {
        name: 'Asha',
        age: 7,
        dob: '2021-06-05',
        colour: 'red',
        agreed: true,
        siblings: [{ name: 'Zayd', age: 9 }],
      };
      expect(readAnswers(fields, buildGroup(fields, answers))).toEqual(answers);
    });
  });
});
