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
}

export interface SchoolClass {
  id: string;
  name: string;
  sortOrder: number;
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
  'text' | 'textarea' | 'number' | 'date' | 'select' | 'radio' | 'checkbox' | 'group';
export type FieldWidth = 'full' | 'half' | 'third';

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
}

export interface AdmissionsSummary {
  academicYearId: string | null;
  total: number;
  counts: Record<ApplicationStatus, number>;
}

/** Field id (or `group[0].column`) to a message, as returned by the API on a 400. */
export type AnswerErrors = Record<string, string>;
