import type { FormField, FormSchema, FormSection } from './form-schema.js';

/**
 * The starting onboarding forms for staff. Each staff type gets one of these as its published
 * version 1 (when the type is created, and by the seed for the types the school starts with); the
 * school then changes it in the form builder (add, remove and reword questions, mark answers
 * required) and publishes a new version.
 *
 * Name, gender, designation, contact, date of birth, address and joining details are always asked for
 * on the staff screen itself, so these forms hold only what differs by kind of work.
 *
 * What is deliberately NOT asked: Aadhaar, PAN, bank and salary details (payroll is not in V1, and
 * the less of this the school holds the less it has to protect under the DPDP Act). Identity is
 * kept as a scanned paper, which administrators alone can open.
 *
 * Nothing is required to start with. Details and papers usually arrive after the person starts, so
 * the staff page lists which papers are still missing instead of blocking the save. The school can
 * mark any question required in the form builder; that is then enforced when staff are saved.
 *
 * Question ids are shared by every template, so a person who changes type keeps nothing by accident
 * and the same question means the same thing everywhere.
 */

export type StaffTemplateKey = 'teacher' | 'office' | 'support';

const MARITAL = [
  { value: 'SINGLE', label: 'Single' },
  { value: 'MARRIED', label: 'Married' },
  { value: 'OTHER', label: 'Other' },
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(
  (g) => ({ value: g.replace('+', 'pos').replace('-', 'neg'), label: g }),
);

const personal = (): FormSection => ({
  id: 'personal',
  title: 'Personal details',
  fields: [
    {
      id: 'parentOrSpouseName',
      type: 'text',
      label: "Father's or spouse's name",
      width: 'half',
    },
    {
      id: 'maritalStatus',
      type: 'select',
      label: 'Marital status',
      width: 'quarter',
      options: MARITAL,
    },
    {
      id: 'bloodGroup',
      type: 'select',
      label: 'Blood group',
      width: 'quarter',
      options: BLOOD_GROUPS,
    },
    {
      id: 'permanentAddress',
      type: 'textarea',
      label: 'Permanent address',
      helpText:
        'If it is the same as the address above, write "Same as above".',
    },
  ],
});

const emergency = (): FormSection => ({
  id: 'emergency',
  title: 'Emergency contact',
  description: 'Someone the school can call if the person is ill or hurt.',
  fields: [
    {
      id: 'emergencyName',
      type: 'text',
      label: 'Name',
      width: 'third',
    },
    {
      id: 'emergencyRelation',
      type: 'text',
      label: 'Relationship',
      width: 'third',
    },
    {
      id: 'emergencyPhone',
      type: 'text',
      label: 'Mobile number',
      width: 'third',
      maxLength: 20,
    },
  ],
});

const experienceGroup = (): FormField => ({
  id: 'previousJobs',
  type: 'group',
  label: 'Previous jobs, most recent first',
  maxItems: 8,
  fields: [
    { id: 'jobEmployer', type: 'text', label: 'School or employer' },
    { id: 'jobRole', type: 'text', label: 'Role' },
    {
      id: 'jobFrom',
      type: 'number',
      label: 'From (year)',
      min: 1960,
      max: 2100,
    },
    { id: 'jobTo', type: 'number', label: 'To (year)', min: 1960, max: 2100 },
  ],
});

/** The school works with children, so a signed undertaking and a clearance are asked of everyone. */
const safeguarding = (): FormSection => ({
  id: 'safeguarding',
  title: 'Child safety',
  fields: [
    {
      id: 'conductUndertaking',
      type: 'checkbox',
      label:
        'The signed child safety and code of conduct undertaking has been received',
    },
  ],
});

const doc = (id: string, label: string): FormField => ({
  id,
  type: 'document',
  label,
});

const idDocs = (): FormField[] => [
  doc('idProof', 'Identity proof'),
  doc('addressProof', 'Address proof'),
];

const clearanceDocs = (): FormField[] => [
  doc('policeVerification', 'Police verification certificate'),
  doc('medicalFitness', 'Medical fitness certificate'),
];

const documents = (...fields: FormField[]): FormSection => ({
  id: 'documents',
  title: 'Documents',
  description:
    'A PDF or a clear photograph of each paper. They can be added later; the staff page shows which are still missing.',
  fields,
});

/** Teachers: qualifications, eligibility, subjects, experience and the papers a school collects. */
export const TEACHER_FORM: FormSchema = {
  sections: [
    personal(),
    emergency(),
    {
      id: 'qualifications',
      title: 'Qualifications',
      fields: [
        {
          id: 'qualificationList',
          type: 'group',
          label: 'Degrees and diplomas, highest first',
          maxItems: 8,
          fields: [
            { id: 'qualName', type: 'text', label: 'Degree or diploma' },
            {
              id: 'qualInstitution',
              type: 'text',
              label: 'University or board',
            },
            {
              id: 'qualYear',
              type: 'number',
              label: 'Year',
              min: 1960,
              max: 2100,
            },
            { id: 'qualGrade', type: 'text', label: 'Grade or percentage' },
          ],
        },
        {
          id: 'teachingQualification',
          type: 'select',
          label: 'Teaching qualification',
          width: 'third',
          options: [
            { value: 'BED', label: 'B.Ed' },
            { value: 'DELED', label: 'D.El.Ed' },
            { value: 'MED', label: 'M.Ed' },
            { value: 'MONTESSORI', label: 'Montessori or early years' },
            { value: 'NONE', label: 'None' },
            { value: 'OTHER', label: 'Other' },
          ],
        },
        {
          id: 'eligibilityTest',
          type: 'select',
          label: 'TET / CTET',
          width: 'third',
          options: [
            { value: 'CLEARED', label: 'Cleared' },
            { value: 'NOT_CLEARED', label: 'Not cleared' },
            { value: 'NOT_REQUIRED', label: 'Not required' },
          ],
        },
        {
          id: 'eligibilityCertNo',
          type: 'text',
          label: 'TET / CTET certificate number',
          width: 'third',
        },
      ],
    },
    {
      id: 'teaching',
      title: 'Teaching',
      fields: [
        {
          id: 'subjects',
          type: 'text',
          label: 'Subjects taught',
          placeholder: 'For example Mathematics, Science',
          width: 'half',
        },
        {
          id: 'levels',
          type: 'text',
          label: 'Classes comfortable teaching',
          placeholder: 'For example Nursery to Std 2',
          width: 'half',
        },
        {
          id: 'languages',
          type: 'text',
          label: 'Languages spoken',
          width: 'half',
        },
        {
          id: 'experienceYears',
          type: 'number',
          label: 'Years of teaching experience',
          min: 0,
          max: 60,
          width: 'half',
        },
        experienceGroup(),
      ],
    },
    safeguarding(),
    documents(
      ...idDocs(),
      doc('degreeCertificates', 'Degree certificates and mark sheets'),
      doc(
        'teachingCertificate',
        'Teaching qualification certificate (B.Ed or similar)',
      ),
      doc('eligibilityCertificate', 'TET / CTET certificate'),
      doc('experienceLetters', 'Experience letters'),
      doc('relievingLetter', 'Relieving letter from the last school'),
      ...clearanceDocs(),
    ),
  ],
};

/** Office work: clerks, accountants, receptionists. */
export const OFFICE_FORM: FormSchema = {
  sections: [
    personal(),
    emergency(),
    {
      id: 'work',
      title: 'Education and work',
      fields: [
        {
          id: 'highestQualification',
          type: 'text',
          label: 'Highest qualification',
          width: 'half',
        },
        {
          id: 'skills',
          type: 'text',
          label: 'Computer and office skills',
          placeholder: 'For example Tally, MS Office, typing',
          width: 'half',
        },
        {
          id: 'experienceYears',
          type: 'number',
          label: 'Years of experience',
          min: 0,
          max: 60,
          width: 'half',
        },
        experienceGroup(),
      ],
    },
    safeguarding(),
    documents(
      ...idDocs(),
      doc('qualificationCertificate', 'Qualification certificate'),
      doc('experienceLetters', 'Experience letters'),
      ...clearanceDocs(),
    ),
  ],
};

/** Support work: peons, drivers, attendants, guards. Short, with the papers that matter. */
export const SUPPORT_FORM: FormSchema = {
  sections: [
    personal(),
    emergency(),
    {
      id: 'work',
      title: 'Work',
      fields: [
        {
          id: 'experienceYears',
          type: 'number',
          label: 'Years of experience',
          min: 0,
          max: 60,
          width: 'half',
        },
        {
          id: 'previousEmployer',
          type: 'text',
          label: 'Previous employer',
          width: 'half',
        },
        {
          id: 'languages',
          type: 'text',
          label: 'Languages spoken',
          width: 'half',
        },
      ],
    },
    safeguarding(),
    documents(
      ...idDocs(),
      doc('reference', 'Reference or experience letter'),
      ...clearanceDocs(),
    ),
  ],
};

export const STAFF_TEMPLATES: Record<StaffTemplateKey, FormSchema> = {
  teacher: TEACHER_FORM,
  office: OFFICE_FORM,
  support: SUPPORT_FORM,
};

const OFFICE_WORDS =
  /clerk|office|account|admin|reception|secretary|cashier|librarian/i;

/**
 * Which starting form a staff type begins with. This only picks the *starting content*: the school
 * changes the form afterwards, and a type whose name is not recognised gets the short support form.
 */
export function templateKeyFor(type: {
  name: string;
  isTeaching: boolean;
}): StaffTemplateKey {
  if (type.isTeaching) return 'teacher';
  return OFFICE_WORDS.test(type.name) ? 'office' : 'support';
}

export const templateFor = (type: { name: string; isTeaching: boolean }) =>
  STAFF_TEMPLATES[templateKeyFor(type)];
