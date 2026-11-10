import type { FormSchema } from './form-schema.js';

/**
 * The starting onboarding forms for staff. The school changes them in the form builder (add, remove
 * and reword questions, mark documents required) and publishes. Name, contact and joining details
 * are always asked for on the staff screen itself, so these forms hold only what differs by type.
 */

/** For staff who teach. */
export const DEFAULT_TEACHER_FORM: FormSchema = {
  sections: [
    {
      id: 'professional',
      title: 'Professional details',
      fields: [
        {
          id: 'subjects',
          type: 'text',
          label: 'Subjects taught',
          placeholder: 'For example Mathematics, Science',
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
        {
          id: 'previousSchool',
          type: 'text',
          label: 'Previous school or employer',
          width: 'half',
        },
        {
          id: 'teachingQualification',
          type: 'text',
          label: 'Teaching qualification',
          placeholder: 'For example B.Ed',
          width: 'half',
        },
      ],
    },
    {
      id: 'documents',
      title: 'Documents',
      description: 'A PDF or a clear photograph of each paper.',
      fields: [
        { id: 'idProof', type: 'document', label: 'Identity proof' },
        { id: 'addressProof', type: 'document', label: 'Address proof' },
        {
          id: 'degreeCertificate',
          type: 'document',
          label: 'Degree and teaching qualification certificates',
        },
        {
          id: 'experienceLetter',
          type: 'document',
          label: 'Experience letter',
        },
      ],
    },
  ],
};

/** For everyone else: clerks, peons, drivers and so on. */
export const DEFAULT_NON_TEACHING_FORM: FormSchema = {
  sections: [
    {
      id: 'work',
      title: 'Work details',
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
      ],
    },
    {
      id: 'documents',
      title: 'Documents',
      description: 'A PDF or a clear photograph of each paper.',
      fields: [
        { id: 'idProof', type: 'document', label: 'Identity proof' },
        { id: 'addressProof', type: 'document', label: 'Address proof' },
      ],
    },
  ],
};
