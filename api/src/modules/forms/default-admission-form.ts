import type { FormField, FormSchema } from './form-schema.js';

/**
 * The school's paper "Application for Admission", as a form definition.
 * Used to seed the first published version. The school can then change it in
 * the form builder without a code change.
 *
 * Left out on purpose:
 *  - "Age as on" and "Date of birth (in words)": calculated from the date of birth.
 *  - Signatures: the last checkbox records that the signed undertaking was
 *    received on paper.
 *  - "For office use only": that is the application status and decision.
 */
/** The four photograph boxes at the top of the paper form. */
export const PHOTO_FIELDS: FormField[] = [
  {
    id: 'childPhoto',
    type: 'image',
    label: 'Latest photograph of child',
    system: 'student.photo',
    width: 'quarter',
    newRow: true, // the four photographs start on their own row, below the class
  },
  {
    id: 'motherPhoto',
    type: 'image',
    label: 'Latest photograph of mother',
    width: 'quarter',
  },
  {
    id: 'fatherPhoto',
    type: 'image',
    label: 'Latest photograph of father',
    width: 'quarter',
  },
  {
    id: 'guardianPhoto',
    type: 'image',
    label: 'Latest photograph of guardian',
    width: 'quarter',
  },
];

export const DEFAULT_ADMISSION_FORM_NAME = 'Application for admission';

export const DEFAULT_ADMISSION_FORM: FormSchema = {
  sections: [
    {
      id: 'admission',
      title: 'Admission sought for',
      fields: [
        {
          id: 'classApplied',
          type: 'select',
          label: 'Class applied for',
          required: true,
          optionsFrom: 'classes',
          system: 'student.class',
          width: 'half',
        },
        ...PHOTO_FIELDS,
      ],
    },
    {
      id: 'student',
      title: "Student's details",
      fields: [
        {
          id: 'surname',
          type: 'text',
          label: 'Surname',
          required: true,
          system: 'student.surname',
          width: 'third',
        },
        {
          id: 'firstName',
          type: 'text',
          label: "Child's name",
          required: true,
          system: 'student.firstName',
          width: 'third',
        },
        {
          id: 'fatherName',
          type: 'text',
          label: "Father's name",
          system: 'student.fatherName',
          width: 'third',
        },
        {
          id: 'gender',
          type: 'radio',
          label: 'Gender',
          required: true,
          system: 'student.gender',
          width: 'third',
          options: [
            { value: 'MALE', label: 'Male' },
            { value: 'FEMALE', label: 'Female' },
          ],
        },
        {
          id: 'dateOfBirth',
          type: 'date',
          label: 'Date of birth',
          required: true,
          system: 'student.dateOfBirth',
          width: 'third',
        },
        {
          id: 'placeOfBirth',
          type: 'text',
          label: 'Place of birth (town / city)',
          width: 'third',
        },
        {
          id: 'birthState',
          type: 'text',
          label: 'State of birth',
          width: 'third',
        },
        {
          id: 'nationality',
          type: 'text',
          label: 'Nationality',
          width: 'third',
        },
        { id: 'religion', type: 'text', label: 'Religion', width: 'third' },
        { id: 'community', type: 'text', label: 'Community', width: 'third' },
        {
          id: 'motherTongue',
          type: 'text',
          label: 'Mother tongue',
          width: 'third',
        },
        {
          id: 'permanentAddress',
          type: 'textarea',
          label: 'Permanent address',
        },
        {
          id: 'communicationAddress',
          type: 'textarea',
          label: 'Communication address',
        },
      ],
    },
    {
      id: 'languagesAndSchool',
      title: 'Languages and previous school',
      fields: [
        {
          id: 'languagesKnown',
          type: 'text',
          label: 'Languages known (can speak, read and write)',
          helpText: 'For example: English, Hindi, Urdu',
        },
        {
          id: 'languageHomeMain',
          type: 'text',
          label: 'Main language spoken at home',
          width: 'half',
        },
        {
          id: 'languageHomeOther',
          type: 'text',
          label: 'Other languages spoken at home',
          width: 'half',
        },
        {
          id: 'lastSchoolFrom',
          type: 'date',
          label: 'Last school attended: from',
          width: 'half',
        },
        {
          id: 'lastSchoolTo',
          type: 'date',
          label: 'Last school attended: to',
          width: 'half',
        },
        {
          id: 'lastSchoolName',
          type: 'textarea',
          label: 'Name and address of the last school',
        },
        {
          id: 'lastClass',
          type: 'text',
          label: 'Last class attended',
          width: 'half',
        },
        {
          id: 'lastMedium',
          type: 'text',
          label: 'Medium of instruction',
          width: 'half',
        },
        {
          id: 'changeReason',
          type: 'textarea',
          label: 'Reason for seeking a change of school',
        },
        {
          id: 'healthNotes',
          type: 'textarea',
          label: 'Significant illness or disabilities, now or in the past',
          helpText: 'Brief details',
        },
      ],
    },
    {
      id: 'father',
      title: "Father's particulars",
      fields: [
        { id: 'fatherFullName', type: 'text', label: "Father's name" },
        {
          id: 'fatherAge',
          type: 'number',
          label: 'Age (years)',
          min: 18,
          max: 100,
          width: 'third',
        },
        {
          id: 'fatherQualification',
          type: 'text',
          label: 'Qualification',
          width: 'third',
        },
        {
          id: 'fatherOccupation',
          type: 'text',
          label: 'Occupation',
          width: 'third',
        },
        { id: 'fatherEmail', type: 'text', label: 'Email', width: 'half' },
        {
          id: 'fatherDesignation',
          type: 'text',
          label: 'Designation',
          width: 'half',
        },
        {
          id: 'fatherOfficeAddress',
          type: 'textarea',
          label: 'Office address',
        },
      ],
    },
    {
      id: 'mother',
      title: "Mother's particulars",
      fields: [
        { id: 'motherFullName', type: 'text', label: "Mother's name" },
        {
          id: 'motherOccupation',
          type: 'text',
          label: 'Occupation',
          width: 'half',
        },
        {
          id: 'motherQualification',
          type: 'text',
          label: 'Qualification',
          width: 'half',
        },
      ],
    },
    {
      id: 'family',
      title: 'Family contact details',
      fields: [
        {
          id: 'residentialAddress',
          type: 'textarea',
          label: 'Residential address',
        },
        { id: 'familyPhone', type: 'text', label: 'Phone', width: 'third' },
        { id: 'familyMobile', type: 'text', label: 'Mobile', width: 'third' },
        { id: 'familyFax', type: 'text', label: 'Fax', width: 'third' },
        {
          id: 'monthlyIncome',
          type: 'number',
          label: 'Monthly income (Rs.)',
          min: 0,
          width: 'half',
        },
        {
          id: 'familyMotherTongue',
          type: 'text',
          label: 'Mother tongue',
          width: 'half',
        },
        {
          id: 'siblings',
          type: 'group',
          label: "Information about the child's siblings",
          maxItems: 4,
          fields: [
            { id: 'name', type: 'text', label: 'Name' },
            { id: 'age', type: 'number', label: 'Age', min: 0, max: 40 },
            { id: 'school', type: 'text', label: 'School / college' },
            { id: 'class', type: 'text', label: 'Class' },
          ],
        },
      ],
    },
    {
      id: 'guardian',
      title: "Guardian's particulars",
      description: 'Only if the student is not living with their parents.',
      fields: [
        {
          id: 'guardianFirstName',
          type: 'text',
          label: 'First name',
          width: 'third',
        },
        {
          id: 'guardianMiddleName',
          type: 'text',
          label: 'Middle name',
          width: 'third',
        },
        {
          id: 'guardianLastName',
          type: 'text',
          label: 'Last name',
          width: 'third',
        },
        {
          id: 'guardianRelationship',
          type: 'text',
          label: 'Relationship with the student',
          width: 'half',
        },
        {
          id: 'guardianAge',
          type: 'number',
          label: 'Age (years)',
          min: 18,
          max: 100,
          width: 'half',
        },
        {
          id: 'guardianQualification',
          type: 'text',
          label: 'Qualification',
          width: 'half',
        },
        {
          id: 'guardianOccupation',
          type: 'text',
          label: 'Occupation',
          width: 'half',
        },
        {
          id: 'guardianDesignation',
          type: 'text',
          label: 'Designation',
          width: 'half',
        },
        { id: 'guardianEmail', type: 'text', label: 'Email', width: 'half' },
        {
          id: 'guardianOfficeAddress',
          type: 'textarea',
          label: 'Office address',
        },
        {
          id: 'guardianResidentialAddress',
          type: 'textarea',
          label: 'Residential address',
        },
        { id: 'guardianPhone', type: 'text', label: 'Phone', width: 'third' },
        { id: 'guardianMobile', type: 'text', label: 'Mobile', width: 'third' },
        { id: 'guardianFax', type: 'text', label: 'Fax', width: 'third' },
      ],
    },
    {
      id: 'declaration',
      title: 'Undertaking cum declaration',
      fields: [
        {
          id: 'undertakingReceived',
          type: 'checkbox',
          label:
            'The signed undertaking and declaration (father and mother) has been received',
          required: true,
        },
      ],
    },
  ],
};
