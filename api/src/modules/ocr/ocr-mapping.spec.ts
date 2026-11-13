import { DEFAULT_ADMISSION_FORM } from '../forms/default-admission-form.js';
import {
  classFor,
  isoDate,
  mapOcrToForm,
  type OcrField,
  type OcrResult,
} from './ocr-mapping.js';

const f = (
  value: unknown,
  confidence = 0.9,
  extra: Partial<OcrField> = {},
): OcrField => ({
  value,
  confidence,
  raw: typeof value === 'string' ? value : null,
  valid: true,
  check: confidence < 0.6,
  ...extra,
});

const classes = [
  { id: 'c-pg', name: 'Play Group' },
  { id: 'c-nur', name: 'Nursery' },
  { id: 'c-jr', name: 'Jr. K.G.' },
  { id: 'c-sr', name: 'Senior KG' },
  { id: 'c-1', name: 'Std. I' },
  { id: 'c-2', name: '2nd Standard' },
];

const result = (fields: Record<string, OcrField>): OcrResult => ({
  fields,
  missingPanels: [],
  seconds: 3.2,
  reader: 'rapidocr',
});

describe('classFor', () => {
  it.each([
    ['PLAY_GROUP', 'c-pg'],
    ['NURSERY', 'c-nur'],
    ['JR_KG', 'c-jr'],
    ['SR_KG', 'c-sr'],
    ['STD_1', 'c-1'],
    ['STD_2', 'c-2'],
  ])('matches the %s tick box to the school class', (tick, id) => {
    expect(classFor(tick, classes)?.id).toBe(id);
  });

  it('returns null when the school has no such class', () => {
    expect(classFor('STD_2', [{ id: 'x', name: 'Nursery' }])).toBeNull();
  });
});

describe('isoDate', () => {
  it('turns dd/mm/yyyy into ISO and refuses impossible dates', () => {
    expect(isoDate('04/08/2022')).toBe('2022-08-04');
    expect(isoDate('31/02/2022')).toBeNull();
    expect(isoDate('4/8/22')).toBeNull();
  });
});

describe('mapOcrToForm', () => {
  it('fills the form by field id with the right types', () => {
    const out = mapOcrToForm(
      result({
        admissionClass: f('NURSERY', 0.95),
        'student.name.surname': f('MEMON'),
        'student.name.childName': f('ASRA'),
        'student.gender': f('FEMALE'),
        'student.dateOfBirth': f('04/08/2022'),
        'student.languagesKnown.0': f('English'),
        'student.languagesKnown.1': f('Hindi'),
        'student.languagesKnown.2': f(null),
        'father.age': f('38'),
        'familyContact.monthlyIncome': f('40000'),
        formNo: f('15'),
        date: f('10/11/2026'),
      }),
      DEFAULT_ADMISSION_FORM,
      classes,
    );
    expect(out.answers).toMatchObject({
      classApplied: 'c-nur',
      surname: 'MEMON',
      firstName: 'ASRA',
      gender: 'FEMALE',
      dateOfBirth: '2022-08-04',
      languagesKnown: 'English, Hindi',
      fatherAge: 38,
      monthlyIncome: 40000,
    });
    expect(out.header).toEqual({ formNo: '15', receivedOn: '2026-11-10' });
    expect(out.review).toEqual({});
    expect(out.summary).toMatchObject({ toCheck: 0, reader: 'rapidocr' });
  });

  it('fills low-confidence answers but marks them to check', () => {
    const out = mapOcrToForm(
      result({ 'father.email': f('imran@gmial.com', 0.4) }),
      DEFAULT_ADMISSION_FORM,
      classes,
    );
    expect(out.answers['fatherEmail']).toBe('imran@gmial.com');
    expect(out.review['fatherEmail']).toMatchObject({
      confidence: 0.4,
      read: 'imran@gmial.com',
    });
  });

  it('leaves out what cannot be used and says what was read', () => {
    const out = mapOcrToForm(
      result({
        'student.dateOfBirth': f('31/02/2022', 0.8, { valid: false }),
        'father.age': f('7'), // below the form's minimum of 18
        admissionClass: f('STD_2'),
      }),
      DEFAULT_ADMISSION_FORM,
      [{ id: 'c-nur', name: 'Nursery' }],
    );
    expect(out.answers).toEqual({});
    expect(out.review['dateOfBirth'].read).toBe('31/02/2022');
    expect(out.review['fatherAge'].note).toMatch(/range/);
    expect(out.review['classApplied'].note).toMatch(/class/);
  });

  it('keeps only sibling rows with something written, numbered from 0', () => {
    const out = mapOcrToForm(
      result({
        'siblings.0.name': f(null),
        'siblings.1.name': f('ZAINAB MEMON'),
        'siblings.1.age': f('9', 0.3),
        'siblings.1.schoolCollege': f('Hera English School'),
      }),
      DEFAULT_ADMISSION_FORM,
      classes,
    );
    expect(out.answers['siblings']).toEqual([
      { name: 'ZAINAB MEMON', age: 9, school: 'Hera English School' },
    ]);
    expect(Object.keys(out.review)).toEqual(['siblings[0].age']);
  });

  it('skips fields the school removed from its form', () => {
    const schema = {
      sections: [
        {
          id: 's',
          title: 'S',
          fields: [{ id: 'surname', type: 'text' as const, label: 'Surname' }],
        },
      ],
    };
    const out = mapOcrToForm(
      result({
        'student.name.surname': f('KHAN'),
        'father.name': f('ARIF KHAN'),
      }),
      schema,
      classes,
    );
    expect(out.answers).toEqual({ surname: 'KHAN' });
  });

  it('ignores pages that were not photographed', () => {
    const out = mapOcrToForm(
      {
        ...result({
          'father.name': {
            value: null,
            confidence: 0,
            raw: null,
            missing: true,
          },
        }),
        missingPanels: ['page2'],
      },
      DEFAULT_ADMISSION_FORM,
      classes,
    );
    expect(out.answers).toEqual({});
    expect(out.review).toEqual({});
    expect(out.summary.missingPages).toEqual(['page2']);
  });
});
