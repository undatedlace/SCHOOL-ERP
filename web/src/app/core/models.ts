export interface Me {
  id: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  mustChangePassword: boolean;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface School {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  board: string | null;
}

export interface Role {
  code: string;
  name: string;
  permissions: string[];
}

export interface UserRow {
  id: string;
  fullName: string;
  email: string | null;
  mobile: string | null;
  status: 'ACTIVE' | 'DISABLED';
  mustChangePassword: boolean;
  createdAt: string;
  roles: { code: string; name: string }[];
  /** Present only in the response to creating a user without a password. */
  temporaryPassword?: string;
}

export interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  /** Ages are counted as on this date. Empty = the day the form was received. */
  ageCutoffDate: string | null;
}

export interface SchoolClass {
  id: string;
  name: string;
  sortOrder: number;
  /** The youngest age, in whole years, a child may be admitted at. */
  minAgeYears: number | null;
  /** Whether the school is taking applications for this class. */
  admissionsOpen: boolean;
  divisions: { id: string; name: string }[];
}

export interface Subject {
  id: string;
  name: string;
  code: string | null;
}

export interface AuditLogItem {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  ip: string | null;
  createdAt: string;
  actorName: string | null;
}

// ---------- Configurable forms ----------

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'image'
  | 'ageLimits'
  | 'group';
export type FieldWidth = 'full' | 'half' | 'third' | 'quarter';

export interface FieldOption {
  value: string;
  label: string;
}

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  required?: boolean;
  helpText?: string;
  placeholder?: string;
  width?: FieldWidth;
  /** Starts on a new row instead of continuing the row above. */
  newRow?: boolean;
  options?: FieldOption[];
  /** Options come from the school's classes. */
  optionsFrom?: 'classes';
  /** Linked to a core field the system relies on: it cannot be removed or retyped. */
  system?: string;
  maxLength?: number;
  min?: number;
  max?: number;
  fields?: FormField[];
  maxItems?: number;
}

export interface FormSection {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
}

export interface FormSchema {
  sections: FormSection[];
}

export interface FormVersion {
  id: string;
  version: number;
  name: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  schema: FormSchema;
  updatedAt: string;
  publishedAt: string | null;
}

export interface FormSummary {
  key: string;
  name: string;
  publishedVersion: number | null;
  publishedAt: string | null;
  hasDraft: boolean;
  draftUpdatedAt: string | null;
}

export interface FormDetail {
  key: string;
  name: string;
  requiredSystem: string[];
  published: FormVersion | null;
  draft: FormVersion | null;
}

// ---------- Admissions ----------

export type ApplicationStatus = 'RECEIVED' | 'UNDER_REVIEW' | 'GRANTED' | 'REFUSED' | 'WITHDRAWN';
export type Decision = 'UNDER_REVIEW' | 'GRANTED' | 'REFUSED' | 'WITHDRAWN';

export interface ApplicationListItem {
  id: string;
  formNo: string;
  seq: number;
  status: ApplicationStatus;
  studentName: string;
  dateOfBirth: string | null;
  receivedOn: string;
  class: { id: string; name: string } | null;
  academicYear: { id: string; name: string };
}

export interface ApplicationDetail extends ApplicationListItem {
  answers: Record<string, unknown>;
  form: { id: string; version: number; name: string; schema: FormSchema };
  decision: {
    decidedAt: string | null;
    note: string | null;
    grantedClass: { id: string; name: string } | null;
    grantedDivision: { id: string; name: string } | null;
  };
  allowedDecisions: Decision[];
  editable: boolean;
  createdAt: string;
  /** Set once the application has been turned into a student. */
  studentId: string | null;
  admittedAt: string | null;
  /** Guardians read from the answers, offered when admitting. */
  suggestedGuardians: GuardianInput[];
  /** Null when the application has no class. */
  eligibility: Eligibility | null;
}

export interface AdmissionsSummary {
  academicYearId: string | null;
  total: number;
  counts: Record<ApplicationStatus, number>;
}

/** Field id (or `group[0].column`) to a message, as returned by the API on a 400. */
export type AnswerErrors = Record<string, string>;

// ---------- Students ----------

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type Relationship = 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'OTHER';
export type StudentStatus = 'ACTIVE' | 'LEFT';

export interface StudentListItem {
  id: string;
  admissionNo: string;
  fullName: string;
  firstName: string;
  surname: string;
  gender: Gender;
  dateOfBirth: string;
  status: StudentStatus;
  photoFileId: string | null;
  current: {
    academicYear: { id: string; name: string };
    class: { id: string; name: string };
    division: { id: string; name: string };
  } | null;
}

export interface GuardianInput {
  fullName: string;
  relationship: Relationship;
  mobile?: string;
  email?: string;
  occupation?: string;
  isPrimary?: boolean;
}

export interface StudentGuardian {
  id: string;
  fullName: string;
  relationship: Relationship;
  isPrimary: boolean;
  hasLogin: boolean;
  mobile: string | null;
  email: string | null;
  occupation: string | null;
}

export interface StudentDetail {
  id: string;
  admissionNo: string;
  fullName: string;
  firstName: string;
  fatherName: string | null;
  surname: string;
  gender: Gender;
  dateOfBirth: string;
  status: StudentStatus;
  joinedOn: string;
  leftOn: string | null;
  photoFileId: string | null;
  guardians: StudentGuardian[];
  enrollments: {
    id: string;
    academicYear: { id: string; name: string };
    class: { id: string; name: string };
    division: { id: string; name: string };
    startedOn: string;
    endedOn: string | null;
  }[];
  application: { id: string; formNo: string } | null;
}

/** Advice on whether a child's age suits a class. It never blocks saving. */
export interface Eligibility {
  eligible: boolean;
  issues: string[];
  ageMonths: number | null;
  ageText: string | null;
  asOn: string;
}

// ---------- Staff ----------

export type StaffStatus = 'ACTIVE' | 'LEFT';

export interface StaffAccount {
  userId: string;
  status: 'ACTIVE' | 'DISABLED';
  mustChangePassword: boolean;
  roles: { code: string; name: string }[];
}

export interface StaffMember {
  id: string;
  employeeNo: string;
  fullName: string;
  firstName: string;
  surname: string;
  gender: Gender;
  dateOfBirth: string | null;
  mobile: string | null;
  email: string | null;
  designation: string;
  qualification: string | null;
  address: string | null;
  photoFileId: string | null;
  status: StaffStatus;
  joinedOn: string;
  leftOn: string | null;
  account: StaffAccount | null;
  /** Present only in the response to creating a login. */
  temporaryPassword?: string;
}

export interface NewStaff {
  firstName: string;
  surname: string;
  gender: Gender;
  designation: string;
  dateOfBirth?: string;
  mobile?: string;
  email?: string;
  qualification?: string;
  address?: string;
  photoFileId?: string;
  joinedOn?: string;
  employeeNo?: string;
  account?: { roleCodes: string[] };
}

// ---------- Teaching assignments ----------

export interface Assignment {
  id: string;
  kind: 'CLASS_TEACHER' | 'SUBJECT';
  academicYear: { id: string; name: string };
  division: { id: string; name: string; class: { id: string; name: string } };
  subject: { id: string; name: string } | null;
  staff: { id: string; fullName: string; status: StaffStatus };
}
