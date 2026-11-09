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

export type DocumentType =
  | 'BIRTH_CERTIFICATE'
  | 'TRANSFER_CERTIFICATE'
  | 'ID_PROOF'
  | 'PREVIOUS_REPORT_CARD'
  | 'MEDICAL'
  | 'OTHER';

export interface StudentDocument {
  id: string;
  type: DocumentType;
  title: string | null;
  createdAt: string;
  fileId: string;
  mimeType: string | null;
  sizeBytes: number | null;
  fileName: string | null;
}

/** What the school hands over when it gives a parent or student a login. */
export interface PortalAccount {
  loginId: string | null;
  /** Absent when a parent was added to a login that already existed. */
  temporaryPassword?: string;
  shared?: boolean;
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
  hasLogin: boolean;
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

// ---------- Fees ----------

/** Money always travels as text with two decimals, for example "1500.00". */
export type Money = string;

export type PaymentMode = 'CASH' | 'CHEQUE' | 'UPI' | 'BANK_TRANSFER' | 'ONLINE';

export interface FeeHead {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export interface FeeStructure {
  id: string;
  academicYear: { id: string; name: string };
  class: { id: string; name: string };
  total: Money;
  items: { feeHeadId: string; feeHead: string; amount: Money }[];
  instalments: { seq: number; label: string; dueDate: string; percent: number }[];
  invoices: number;
}

export interface SaveStructure {
  academicYearId: string;
  classId: string;
  items: { feeHeadId: string; amount: Money }[];
  instalments: { label: string; dueDate: string; percent: number }[];
}

export interface GenerateResult {
  created: number;
  alreadyHad: number;
  noStructure: { classId: string; className: string; students: number }[];
}

export interface LedgerInstalment {
  seq: number;
  label: string;
  dueDate: string;
  due: Money;
  paid: Money;
  pending: Money;
  overdue: boolean;
}

export interface LedgerInvoice {
  id: string;
  kind: 'FEE_STRUCTURE' | 'OPENING_BALANCE';
  note: string | null;
  academicYear: { id: string; name: string };
  lines: { description: string; amount: Money }[];
  concessions: {
    id: string;
    amount: Money;
    reason: string;
    createdAt: string;
    revoked: boolean;
    revokedReason: string | null;
  }[];
  instalments: LedgerInstalment[];
  gross: Money;
  concessionTotal: Money;
  paid: Money;
  pending: Money;
}

export interface LedgerPayment {
  id: string;
  receiptNo: string;
  amount: Money;
  mode: PaymentMode;
  reference: string | null;
  bank: string | null;
  paidOn: string;
  note: string | null;
  reversed: { reason: string; on: string } | null;
  allocations: { invoiceId: string; amount: Money }[];
}

export interface StudentLedger {
  student: { id: string; admissionNo: string; fullName: string };
  totals: { gross: Money; concessions: Money; paid: Money; pending: Money };
  invoices: LedgerInvoice[];
  payments: LedgerPayment[];
}

export interface RecordPayment {
  amount: Money;
  mode: PaymentMode;
  reference?: string;
  bank?: string;
  paidOn?: string;
  note?: string;
  allocations?: { invoiceId: string; amount: Money }[];
}

export interface DuesSums {
  billed: Money;
  collected: Money;
  pending: Money;
  overdue: Money;
}

export interface DuesReport {
  academicYearId: string | null;
  totals: DuesSums & { students: number; owing: number };
  byClass: (DuesSums & { id: string; label: string; students: number; owing: number })[];
  byDivision: (DuesSums & { id: string; label: string; students: number; owing: number })[];
  students: {
    items: (DuesSums & {
      studentId: string;
      admissionNo: string;
      fullName: string;
      class: string;
      division: string;
      previousYearsPending: Money;
    })[];
    total: number;
    page: number;
    pageSize: number;
  };
}

// ---------- Attendance ----------

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'ON_LEAVE';

export interface AttendanceCounts {
  present: number;
  absent: number;
  late: number;
  onLeave: number;
}

export interface AttendanceSummary extends AttendanceCounts {
  markedDays: number;
  countedDays: number;
  attendedDays: number;
  /** Null until at least one day counts. */
  percent: number | null;
}

export interface AttendanceDivision {
  id: string;
  name: string;
  class: { id: string; name: string };
  canMark: boolean;
}

export interface AttendanceRosterStudent {
  studentId: string;
  admissionNo: string;
  name: string;
  rollNo: number | null;
  status: AttendanceStatus | null;
  note: string | null;
}

export interface AttendanceRoster {
  date: string;
  academicYear: { id: string; name: string };
  division: { id: string; name: string; class: { id: string; name: string } };
  canMark: boolean;
  marked: boolean;
  markedBy: string | null;
  markedAt: string | null;
  counts: AttendanceSummary;
  students: AttendanceRosterStudent[];
}

export interface AttendanceOverview {
  date: string;
  divisions: {
    id: string;
    name: string;
    class: { id: string; name: string };
    enrolled: number;
    marked: number;
    counts: AttendanceCounts;
    done: boolean;
  }[];
}

export interface AttendanceDivisionReport {
  from: string;
  to: string;
  daysMarked: number;
  students: (AttendanceSummary & {
    studentId: string;
    admissionNo: string;
    name: string;
    rollNo: number | null;
  })[];
}

export interface StudentAttendance {
  studentId: string;
  from: string;
  to: string;
  summary: AttendanceSummary;
  records: { date: string; status: AttendanceStatus; note: string | null }[];
}

// ---------- Year-end promotion ----------

export type PromotionAction = 'PROMOTE' | 'REPEAT' | 'LEFT';

export interface PromotionStatus {
  from: { id: string; name: string };
  to: { id: string; name: string };
  divisions: {
    id: string;
    name: string;
    class: { id: string; name: string };
    total: number;
    done: number;
    remaining: number;
  }[];
}

export interface PromotionPlan {
  from: { id: string; name: string };
  to: { id: string; name: string };
  division: { id: string; name: string; class: { id: string; name: string } };
  /** Null when this is the last class. */
  nextClass: { id: string; name: string; divisions: { id: string; name: string }[] } | null;
  sameClassDivisions: { id: string; name: string }[];
  alreadyDone: number;
  students: {
    studentId: string;
    admissionNo: string;
    name: string;
    rollNo: number | null;
    suggested: { action: PromotionAction; divisionId: string | null };
  }[];
}

export interface PromotionResult {
  promoted: number;
  repeated: number;
  left: number;
  skipped: { studentId: string; name: string; reason: string }[];
}

// ---------- Notices ----------

export type NoticeAudience = 'ALL' | 'STAFF' | 'CLASSES' | 'DIVISIONS';

export interface Notice {
  id: string;
  title: string;
  body: string;
  audience: NoticeAudience;
  classes: { id: string; name: string }[];
  divisions: { id: string; label: string }[];
  createdBy: { id: string; fullName: string };
  createdAt: string;
  expiresOn: string | null;
  expired: boolean;
  canChange: boolean;
}

export interface NoticeAudiences {
  canAddressAnyone: boolean;
  classes: { id: string; name: string }[];
  divisions: { id: string; classId: string; label: string }[];
}

export interface NoticeInput {
  title: string;
  body: string;
  audience: NoticeAudience;
  classIds?: string[];
  divisionIds?: string[];
  expiresOn?: string | null;
}

// ---------- Dashboard insights ----------

export interface AdmissionsInsight {
  years: {
    id: string;
    name: string;
    isCurrent: boolean;
    applications: number;
    received: number;
    granted: number;
    refused: number;
    withdrawn: number;
    admitted: number;
    enrolled: number;
  }[];
}

export interface StaffInsight {
  years: { id: string; name: string; joined: number; left: number; atYearEnd: number }[];
  currentlyWorking: number;
}

export interface FeesInsight {
  academicYear: { id: string; name: string };
  totals: DuesReport['totals'];
  byClass: DuesReport['byClass'];
  collectedByMonth: { month: string; total: Money; payments: number }[];
}

export interface AttendanceInsight {
  from: string;
  to: string;
  days: number;
  today: { divisions: number; marked: number };
  trend: {
    date: string;
    percent: number | null;
    present: number;
    late: number;
    absent: number;
    onLeave: number;
  }[];
  divisions: { id: string; label: string; percent: number | null; markedDays: number }[];
}
