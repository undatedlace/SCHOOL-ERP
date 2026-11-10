import {
  DEFAULT_ADMISSION_FORM,
  DEFAULT_ADMISSION_FORM_NAME,
} from './default-admission-form.js';
import type { FormSchema, SystemFieldKey } from './form-schema.js';

export interface FormKind {
  name: string;
  /** Core fields that must be on the form before it can be published. */
  requiredSystem: SystemFieldKey[];
  /** The first version, used when the school has none yet. */
  initial: FormSchema;
}

/** Key prefix of a staff type's onboarding form: `staff-<staff type id>`. */
export const STAFF_FORM_PREFIX = 'staff-';

/** The forms that always exist. Each staff type adds an onboarding form of its own (see FormsService). */
export const FORM_KINDS: Record<string, FormKind> = {
  admission: {
    name: DEFAULT_ADMISSION_FORM_NAME,
    requiredSystem: [
      'student.class',
      'student.surname',
      'student.firstName',
      'student.gender',
      'student.dateOfBirth',
    ],
    initial: DEFAULT_ADMISSION_FORM,
  },
};
