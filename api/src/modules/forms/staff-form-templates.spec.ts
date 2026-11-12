import {
  STAFF_TEMPLATES,
  StaffTemplateKey,
  templateKeyFor,
} from './staff-form-templates.js';
import {
  allFields,
  publishErrors,
  validateAnswers,
  validateFormSchema,
} from './form-schema.js';

const KEYS = Object.keys(STAFF_TEMPLATES) as StaffTemplateKey[];
const NO_CONTEXT = { classIds: new Set<string>(), fileIds: new Set<string>() };

describe('staff form templates', () => {
  it.each(KEYS)('%s is a valid form that can be published', (key) => {
    const template = STAFF_TEMPLATES[key];
    const { schema, errors } = validateFormSchema(template);
    expect(errors).toEqual([]);
    expect(publishErrors(schema, [])).toEqual([]);
    // The cleaned copy loses nothing the template meant to say.
    expect(schema).toEqual(template);
  });

  it.each(KEYS)(
    '%s requires nothing, so a person can be added before the details and papers arrive',
    (key) => {
      const { errors } = validateAnswers(STAFF_TEMPLATES[key], {}, NO_CONTEXT);
      expect(errors).toEqual({});
      expect(allFields(STAFF_TEMPLATES[key]).some((f) => f.required)).toBe(
        false,
      );
    },
  );

  it.each(KEYS)('%s accepts a complete set of answers', (key) => {
    const answers = {
      emergencyName: 'Asha',
      emergencyPhone: '9876543210',
      maritalStatus: 'MARRIED',
      bloodGroup: 'Opos',
    };
    const { errors } = validateAnswers(
      STAFF_TEMPLATES[key],
      answers,
      NO_CONTEXT,
    );
    expect(errors).toEqual({});
  });

  it.each(KEYS)('%s asks for identity, address and clearance papers', (key) => {
    const ids = allFields(STAFF_TEMPLATES[key])
      .filter((f) => f.type === 'document')
      .map((f) => f.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'idProof',
        'addressProof',
        'policeVerification',
        'medicalFitness',
      ]),
    );
  });

  it('never asks for Aadhaar, PAN or bank details', () => {
    for (const key of KEYS) {
      const text = JSON.stringify(STAFF_TEMPLATES[key]).toLowerCase();
      expect(text).not.toMatch(/aadhaar|aadhar|\bpan\b|bank|salary|ifsc/);
    }
  });

  it('the teacher form has qualifications and experience as repeating rows', () => {
    const groups = allFields(STAFF_TEMPLATES.teacher).filter(
      (f) => f.type === 'group',
    );
    expect(groups.map((g) => g.id)).toEqual([
      'qualificationList',
      'previousJobs',
    ]);
  });

  it('picks the starting form from the kind of work', () => {
    const pick = (name: string, isTeaching = false) =>
      templateKeyFor({ name, isTeaching });
    expect(pick('Teacher', true)).toBe('teacher');
    expect(pick('Clerk')).toBe('office');
    expect(pick('Accountant')).toBe('office');
    expect(pick('Peon')).toBe('support');
    expect(pick('Driver')).toBe('support');
    // Anything the school adds that we do not recognise gets the short form, never the long one.
    expect(pick('Gardener')).toBe('support');
  });
});
