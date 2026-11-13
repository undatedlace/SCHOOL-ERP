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
  /** Student IDs begin with this (for example hesj gives hesj0001). */
  studentIdPrefix: string | null;
  studentIdDigits: number;
  /** A student's school e-mail is their ID at this domain. */
  studentEmailDomain: string | null;
}

/** What the move-a-student call tells the screen about the class change. */
export interface StudentMoved {
  from: string;
  to: string;
  /** Fees were billed for the old class, so the accountant should check them. */
  feesNeedReview: boolean;
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
  | 'document'
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
export type StudentStatus = 'ACTIVE' | 'LEFT' | 'REMOVED';

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
  /** The student's school e-mail, when the school has an e-mail domain set. */
  schoolEmail: string | null;
  /** Set while the student is removed. */
  removal: { at: string; reason: string; by: string | null } | null;
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
  staffType: { id: string; name: string; isTeaching: boolean } | null;
  /** The onboarding form and the answers. Only administrators receive it (it holds identity papers). */
  onboarding?: StaffOnboarding | null;
  account: StaffAccount | null;
  /** Present only in the response to creating a login. */
  temporaryPassword?: string;
}

export interface StaffOnboarding {
  formId: string;
  version: number;
  name: string;
  schema: FormSchema;
  answers: Record<string, unknown>;
}

/** A kind of employee the school has (teacher, clerk, peon...). */
export interface StaffType {
  id: string;
  name: string;
  isTeaching: boolean;
  active: boolean;
  staffCount: number;
  /** The key of its onboarding form in the form builder. */
  formKey: string;
}

export interface NewStaff {
  staffTypeId?: string;
  answers?: Record<string, unknown>;
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
  /** When it was billed. */
  createdAt: string;
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

/** Where a student stands on fees: all paid, part paid, nothing paid yet, overdue, or nothing billed. */
export type DuesStatus = 'PAID' | 'PARTIAL' | 'UNPAID' | 'OVERDUE' | 'NONE';

export interface DuesStudent extends DuesSums {
  studentId: string;
  admissionNo: string;
  fullName: string;
  class: string;
  division: string;
  previousYearsPending: Money;
  status: DuesStatus;
  /** The oldest instalment date still unpaid and passed. */
  oldestOverdueOn: string | null;
  /** The next instalment date still unpaid and not yet passed. */
  nextDueOn: string | null;
  lastPaidOn: string | null;
}

export interface DuesReport {
  academicYearId: string | null;
  /** Students in each status, before the status filter (so every tab can show its count). */
  counts: Record<DuesStatus, number>;
  /** Those who have waited longest since a due date passed. */
  longestOverdue: DuesStudent[];
  /** Boys and girls side by side (always both, whatever gender filter is chosen). */
  byGender: (DuesSums & { gender: Gender; students: number; owing: number })[];
  totals: DuesSums & { students: number; owing: number };
  byClass: (DuesSums & { id: string; label: string; students: number; owing: number })[];
  byDivision: (DuesSums & { id: string; label: string; students: number; owing: number })[];
  students: {
    items: DuesStudent[];
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
  /** The days attendance was taken for this division, oldest first. */
  markedDates: string[];
  students: (AttendanceSummary & {
    studentId: string;
    admissionNo: string;
    name: string;
    rollNo: number | null;
    /** The student's status on each day it was taken. */
    days: Record<string, AttendanceStatus>;
  })[];
}

export interface StaffAttendanceRoster {
  date: string;
  canMark: boolean;
  marked: boolean;
  counts: AttendanceSummary;
  staff: {
    staffId: string;
    employeeNo: string;
    name: string;
    designation: string;
    status: AttendanceStatus | null;
    note: string | null;
    markedBy: string | null;
    /** The kind of leave, when the status comes from approved leave and not from a mark. */
    fromLeave?: string | null;
  }[];
}

export interface StaffAttendanceReport {
  from: string;
  to: string;
  daysMarked: number;
  markedDates: string[];
  people: (AttendanceSummary & {
    staffId: string;
    employeeNo: string;
    name: string;
    designation: string;
    days: Record<string, AttendanceStatus>;
  })[];
}

export interface MyStaffAttendance extends StaffAttendanceReport {
  records: { date: string; status: AttendanceStatus; note: string | null }[];
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

// ---------- Search ----------

export interface SearchHit {
  id: string;
  title: string;
  subtitle: string;
  /** Where the app opens it. */
  path: string;
}

export interface SearchGroup {
  type: 'students' | 'staff' | 'applications';
  label: string;
  hits: SearchHit[];
  /** More matches exist than are shown. */
  more: boolean;
}

// ---------- Tests and results ----------

export type AssessmentKind = 'UNIT' | 'MOCK' | 'TERM' | 'OTHER';

export interface AssessmentSummary {
  id: string;
  name: string;
  kind: AssessmentKind;
  subject: { id: string; name: string };
  division: { id: string; label: string };
  maxMarks: number;
  conductedOn: string;
  published: boolean;
  publishedAt: string | null;
  createdBy: { id: string; fullName: string };
  /** Students with marks or marked absent, out of all students in the division. */
  entered: number;
  students: number;
}

export interface AssessmentMarkRow {
  studentId: string;
  admissionNo: string;
  name: string;
  rollNo: number | null;
  marks: number | null;
  absent: boolean;
  remark: string | null;
  percent: number | null;
}

export interface AssessmentStats {
  entered: number;
  scored: number;
  absent: number;
  average: number | null;
  highest: number | null;
  lowest: number | null;
}

/** A test with every student of the division. (`students` is the list here; in a summary it is a count.) */
export type AssessmentDetail = Omit<AssessmentSummary, 'students'> & {
  stats: AssessmentStats;
  students: AssessmentMarkRow[];
};

export interface AssessmentOptions {
  divisions: { id: string; label: string; subjectIds: string[] }[];
  subjects: { id: string; name: string }[];
}

export interface StudentResultRow {
  assessment: {
    id: string;
    name: string;
    kind: AssessmentKind;
    subject: { id: string; name: string };
    conductedOn: string;
    maxMarks: number;
  };
  marks: number | null;
  absent: boolean;
  remark: string | null;
  percent: number | null;
  classAverage: number | null;
  classHighest: number | null;
}

export interface StudentResults {
  student: { id: string; name: string };
  results: StudentResultRow[];
}

// ---------- Homework ----------

export interface Homework {
  id: string;
  title: string;
  instructions: string;
  subject: { id: string; name: string } | null;
  dueOn: string | null;
  overdue: boolean;
  createdBy: { id: string; fullName: string };
  createdAt: string;
  divisions: { id: string; label: string }[];
  students: { id: string; name: string }[];
  /** For a parent or student: which of their children it is for. */
  forChildren: string[];
  canChange: boolean;
  /** Whether students hand work in through the app. */
  handIn: boolean;
  /** Marks are given out of this number (a decimal as text), if any. */
  maxMarks: string | null;
  attachments: FileRef[];
  /** For a parent or student: each child it is for, with the hand-in so far. */
  children: { studentId: string; name: string; submission: HomeworkSubmission | null }[];
}

export interface FileRef {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export type SubmissionStatus = 'SUBMITTED' | 'REVIEWED' | 'REDO';

export interface HomeworkSubmission {
  id: string;
  studentId: string;
  status: SubmissionStatus;
  note: string | null;
  submittedAt: string;
  late: boolean;
  files: FileRef[];
  marks: string | null;
  feedback: string | null;
  reviewedAt: string | null;
}

export interface HandInRoster {
  handIn: boolean;
  maxMarks: string | null;
  counts: { students: number; handedIn: number; marked: number };
  students: {
    studentId: string;
    name: string;
    admissionNo: string;
    division: string;
    submission: HomeworkSubmission | null;
  }[];
}

export interface HomeworkInput {
  title: string;
  instructions: string;
  subjectId?: string;
  dueOn?: string;
  divisionIds?: string[];
  studentIds?: string[];
  handIn?: boolean;
  maxMarks?: number;
  /** Files uploaded with the purpose "homework-attachment". */
  attachmentFileIds?: string[];
}

// ---------- Notifications ----------

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  /** Where in the app it leads. */
  link: string | null;
  read: boolean;
  createdAt: string;
}

// ---------- Staff leave ----------

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface LeaveType {
  id: string;
  name: string;
  unlimited: boolean;
  active: boolean;
  /** Days of unused allowance that move into the next academic year, at most (0 = none). */
  carryForwardDays: number;
}

export interface LeaveBalanceRow {
  leaveType: { id: string; name: string; unlimited: boolean };
  entitled: number;
  /** Unused days brought in from earlier years. */
  carriedOver: number;
  taken: number;
  upcoming: number;
  pending: number;
  /** Null for a kind with no yearly limit. */
  remaining: number | null;
}

export interface LeaveBalance {
  staff: { id: string; name: string };
  academicYear: { id: string; name: string };
  balances: LeaveBalanceRow[];
}

export interface LeaveRequest {
  id: string;
  staff: { id: string; name: string; designation: string };
  leaveType: { id: string; name: string };
  startsOn: string;
  endsOn: string;
  halfDay: boolean;
  days: number;
  reason: string;
  status: LeaveStatus;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  mine: boolean;
}

export interface LeaveEntitlementRow {
  leaveTypeId: string;
  staffTypeId: string | null;
  days: number;
}

export interface LeaveCalendarItem {
  id: string;
  title: string;
  startsOn: string;
  endsOn: string;
  status: 'PENDING' | 'APPROVED';
  halfDay: boolean;
}

// ---------- Calendar ----------

export type CalendarCategory = 'EVENT' | 'HOLIDAY' | 'EXAM' | 'MEETING' | 'LEAVE';

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  category: CalendarCategory;
  startsOn: string;
  endsOn: string;
  startTime: string | null;
  endTime: string | null;
  audience: NoticeAudience;
  classes: { id: string; name: string }[];
  divisions: { id: string; label: string }[];
  /** A notice about it was sent to the same audience. */
  announced: boolean;
  canChange: boolean;
}

export interface CalendarEventInput {
  title: string;
  description?: string | null;
  category: CalendarCategory;
  startsOn: string;
  endsOn?: string;
  startTime?: string | null;
  endTime?: string | null;
  audience: NoticeAudience;
  classIds?: string[];
  divisionIds?: string[];
  announce?: boolean;
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

export interface CopyResult {
  from: string;
  to: string;
  copied: string[];
  skipped: { class: string; reason: string }[];
}

export interface TeachingCopyResult {
  from: string;
  to: string;
  copied: { classTeachers: number; subjectTeachers: number };
  skipped: { place: string; role: string; reason: string }[];
}

export interface PaymentRow {
  id: string;
  receiptNo: string;
  studentId: string;
  admissionNo: string;
  studentName: string;
  amount: Money;
  mode: PaymentMode;
  reference: string | null;
  paidOn: string;
  reversed: boolean;
}

export interface Collection {
  from: string;
  to: string;
  /** The gender the totals were limited to, if any. */
  gender: Gender | null;
  total: Money;
  byMode: { mode: PaymentMode; total: Money; count: number }[];
  /** Money from boys' and girls' fees, always for everyone. */
  byGender: { gender: Gender; total: Money; count: number; students: number }[];
}

/** A field filled in from a photo of the paper form that a person should check. */
export interface ReviewNote {
  confidence: number | null;
  /** What was read from the paper. */
  read: string | null;
  note: string;
}

/** What the server read from photos of a paper admission form. */
export interface FormPhotoRead {
  /** Answers for the published admission form, by field id. */
  answers: Record<string, unknown>;
  header: { formNo?: string; receivedOn?: string };
  review: Record<string, ReviewNote>;
  summary: {
    filled: number;
    toCheck: number;
    /** Pages of the paper form not found in any photo (page1 to page4). */
    missingPages: string[];
    seconds: number;
    reader: string | null;
  };
}
