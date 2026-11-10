import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  AcademicYear,
  Collection,
  PaymentRow,
  CopyResult,
  AdmissionsInsight,
  AttendanceInsight,
  FeesInsight,
  StaffInsight,
  CalendarEvent,
  SearchGroup,
  CalendarEventInput,
  Notice,
  NoticeAudiences,
  NoticeInput,
  PromotionAction,
  PromotionPlan,
  PromotionResult,
  PromotionStatus,
  AttendanceDivision,
  AttendanceDivisionReport,
  AttendanceOverview,
  AttendanceRoster,
  AttendanceStatus,
  MyStaffAttendance,
  StaffAttendanceReport,
  StaffAttendanceRoster,
  StudentAttendance,
  AdmissionsSummary,
  ApplicationDetail,
  ApplicationListItem,
  Assignment,
  AuditLogItem,
  Decision,
  Eligibility,
  FormDetail,
  GuardianInput,
  NewStaff,
  StaffMember,
  FormSchema,
  FormSummary,
  FormVersion,
  DocumentType,
  DuesReport,
  FeeHead,
  FeeStructure,
  GenerateResult,
  LedgerPayment,
  RecordPayment,
  SaveStructure,
  StudentLedger,
  Page,
  PortalAccount,
  Role,
  School,
  SchoolClass,
  StudentDetail,
  StudentDocument,
  StudentListItem,
  Subject,
  UserRow,
} from './models';

/** Only keeps parameters that have a value. */
const params = (values: Record<string, string | number | null | undefined>) => {
  let p = new HttpParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined && value !== '') p = p.set(key, String(value));
  }
  return p;
};

/** All calls to the School ERP API, in one place. */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  // ---------- School ----------
  school = () => this.http.get<School>('/api/school');
  updateSchool = (body: Partial<School>) => this.http.patch<School>('/api/school', body);

  // ---------- Users and roles ----------
  roles = () => this.http.get<Role[]>('/api/rbac/roles');
  users = (q: {
    page: number;
    pageSize: number;
    search?: string;
    role?: string | null;
    status?: string | null;
  }) => this.http.get<Page<UserRow>>('/api/users', { params: params(q) });
  createUser = (body: { fullName: string; email?: string; mobile?: string; roleCodes: string[] }) =>
    this.http.post<UserRow>('/api/users', body);
  updateUser = (
    id: string,
    body: {
      fullName?: string;
      email?: string;
      mobile?: string;
      roleCodes?: string[];
      status?: string;
    },
  ) => this.http.patch<UserRow>(`/api/users/${id}`, body);
  resetPassword = (id: string) =>
    this.http.post<{ temporaryPassword: string }>(`/api/auth/users/${id}/reset-password`, {});

  // ---------- Academic setup ----------
  years = () => this.http.get<AcademicYear[]>('/api/academic-years');
  createYear = (body: {
    name: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
    ageCutoffDate?: string | null;
  }) => this.http.post<AcademicYear>('/api/academic-years', body);
  updateYear = (
    id: string,
    body: {
      name: string;
      startDate: string;
      endDate: string;
      isCurrent: boolean;
      ageCutoffDate?: string | null;
    },
  ) => this.http.patch<AcademicYear>(`/api/academic-years/${id}`, body);
  setCurrentYear = (id: string) =>
    this.http.post<AcademicYear>(`/api/academic-years/${id}/set-current`, {});

  classes = () => this.http.get<SchoolClass[]>('/api/classes');
  createClass = (body: { name: string; minAgeYears?: number | null; admissionsOpen?: boolean }) =>
    this.http.post<SchoolClass>('/api/classes', body);
  updateClass = (
    id: string,
    body: { name?: string; minAgeYears?: number | null; admissionsOpen?: boolean },
  ) => this.http.patch<SchoolClass>(`/api/classes/${id}`, body);
  deleteClass = (id: string) => this.http.delete<void>(`/api/classes/${id}`);
  createDivision = (classId: string, name: string) =>
    this.http.post(`/api/classes/${classId}/divisions`, { name });
  deleteDivision = (id: string) => this.http.delete<void>(`/api/divisions/${id}`);

  subjects = () => this.http.get<Subject[]>('/api/subjects');
  createSubject = (body: { name: string; code?: string }) =>
    this.http.post<Subject>('/api/subjects', body);
  updateSubject = (id: string, body: { name: string; code?: string }) =>
    this.http.patch<Subject>(`/api/subjects/${id}`, body);
  deleteSubject = (id: string) => this.http.delete<void>(`/api/subjects/${id}`);

  // ---------- Audit ----------
  auditLogs = (q: { page: number; pageSize: number; action?: string }) =>
    this.http.get<Page<AuditLogItem>>('/api/audit-logs', { params: params(q) });

  // ---------- Forms (form builder) ----------
  forms = () => this.http.get<FormSummary[]>('/api/forms');
  form = (key: string) => this.http.get<FormDetail>(`/api/forms/${key}`);
  startFormDraft = (key: string) => this.http.post<FormVersion>(`/api/forms/${key}/draft`, {});
  saveFormDraft = (key: string, body: { name?: string; schema: FormSchema }) =>
    this.http.put<FormVersion>(`/api/forms/${key}/draft`, body);
  discardFormDraft = (key: string) => this.http.delete<void>(`/api/forms/${key}/draft`);
  publishForm = (key: string) => this.http.post<FormVersion>(`/api/forms/${key}/publish`, {});

  // ---------- Admissions: age advice ----------
  eligibility = (q: { classId: string; dateOfBirth: string; receivedOn?: string }) =>
    this.http.get<Eligibility>('/api/admissions/eligibility', { params: params(q) });

  // ---------- Files ----------
  /** Uploads one image. The result's id is what a photograph answer holds. */
  uploadFile = (file: File, purpose: string) => {
    const body = new FormData();
    body.append('purpose', purpose);
    body.append('file', file);
    return this.http.post<{ id: string; mimeType: string; sizeBytes: number }>('/api/files', body);
  };

  // ---------- Admissions ----------
  admissionForm = () =>
    this.http.get<{ id: string; version: number; name: string; schema: FormSchema }>(
      '/api/admissions/form',
    );
  applications = (q: {
    page: number;
    pageSize: number;
    search?: string;
    status?: string | null;
    classId?: string | null;
    receivedFrom?: string | null;
    receivedTo?: string | null;
    admitted?: string | null;
  }) =>
    this.http.get<Page<ApplicationListItem>>('/api/admissions/applications', { params: params(q) });
  applicationsSummary = () =>
    this.http.get<AdmissionsSummary>('/api/admissions/applications/summary');
  application = (id: string) =>
    this.http.get<ApplicationDetail>(`/api/admissions/applications/${id}`);
  createApplication = (body: {
    formNo?: string;
    receivedOn?: string;
    answers: Record<string, unknown>;
  }) => this.http.post<ApplicationDetail>('/api/admissions/applications', body);
  updateApplication = (
    id: string,
    body: { formNo?: string; receivedOn?: string; answers?: Record<string, unknown> },
  ) => this.http.patch<ApplicationDetail>(`/api/admissions/applications/${id}`, body);
  decideApplication = (
    id: string,
    body: { decision: Decision; note?: string; classId?: string; divisionId?: string },
  ) => this.http.post<ApplicationDetail>(`/api/admissions/applications/${id}/decision`, body);

  admitApplication = (
    id: string,
    body: {
      divisionId: string;
      admissionNo?: string;
      joinedOn?: string;
      guardians: GuardianInput[];
    },
  ) =>
    this.http.post<{ studentId: string; admissionNo: string }>(
      `/api/admissions/applications/${id}/admit`,
      body,
    );

  // ---------- Students ----------
  students = (q: {
    page: number;
    pageSize: number;
    search?: string;
    status?: string | null;
    classId?: string | null;
    divisionId?: string | null;
    gender?: string | null;
    joinedFrom?: string | null;
    joinedTo?: string | null;
    hasLogin?: string | null;
  }) => this.http.get<Page<StudentListItem>>('/api/students', { params: params(q) });
  student = (id: string) => this.http.get<StudentDetail>(`/api/students/${id}`);
  updateStudent = (
    id: string,
    body: {
      firstName?: string;
      fatherName?: string;
      surname?: string;
      gender?: string;
      dateOfBirth?: string;
      admissionNo?: string;
      status?: string;
      leftOn?: string;
    },
  ) => this.http.patch<StudentDetail>(`/api/students/${id}`, body);
  addGuardian = (studentId: string, body: GuardianInput) =>
    this.http.post<StudentDetail>(`/api/students/${studentId}/guardians`, body);
  updateGuardian = (
    id: string,
    body: { fullName?: string; mobile?: string; email?: string; occupation?: string },
  ) => this.http.patch(`/api/guardians/${id}`, body);
  studentDocuments = (studentId: string) =>
    this.http.get<StudentDocument[]>(`/api/students/${studentId}/documents`);
  addStudentDocument = (
    studentId: string,
    body: { fileId: string; type: DocumentType; title?: string },
  ) => this.http.post(`/api/students/${studentId}/documents`, body);
  removeStudentDocument = (studentId: string, documentId: string) =>
    this.http.delete<void>(`/api/students/${studentId}/documents/${documentId}`);

  // ---------- Fees ----------
  feeHeads = () => this.http.get<FeeHead[]>('/api/fee-heads');
  createFeeHead = (body: { name: string }) => this.http.post<FeeHead>('/api/fee-heads', body);
  updateFeeHead = (id: string, body: { name?: string; isActive?: boolean }) =>
    this.http.patch<FeeHead>(`/api/fee-heads/${id}`, body);
  feeStructures = (academicYearId: string) =>
    this.http.get<FeeStructure[]>('/api/fee-structures', { params: { academicYearId } });
  saveFeeStructure = (body: SaveStructure) =>
    this.http.put<FeeStructure>('/api/fee-structures', body);
  generateInvoices = (body: { academicYearId?: string; classId?: string; studentIds?: string[] }) =>
    this.http.post<GenerateResult>('/api/fee-invoices/generate', body);
  studentFees = (studentId: string) =>
    this.http.get<StudentLedger>(`/api/students/${studentId}/fees`);
  recordPayment = (studentId: string, body: RecordPayment) =>
    this.http.post<LedgerPayment>(`/api/students/${studentId}/payments`, body);
  reversePayment = (id: string, reason: string) =>
    this.http.post(`/api/payments/${id}/reverse`, { reason });
  addConcession = (invoiceId: string, body: { amount: string; reason: string }) =>
    this.http.post(`/api/fee-invoices/${invoiceId}/concessions`, body);
  revokeConcession = (id: string, reason: string) =>
    this.http.delete<void>(`/api/concessions/${id}`, { body: { reason } });
  addOpeningBalance = (body: {
    studentId: string;
    academicYearId: string;
    amount: string;
    dueDate: string;
    note?: string;
  }) => this.http.post('/api/fee-invoices/opening-balance', body);
  dues = (q: {
    page: number;
    pageSize: number;
    academicYearId?: string | null;
    classId?: string | null;
    search?: string;
    onlyOwing?: boolean;
  }) => {
    let params = new HttpParams().set('page', q.page).set('pageSize', q.pageSize);
    if (q.academicYearId) params = params.set('academicYearId', q.academicYearId);
    if (q.classId) params = params.set('classId', q.classId);
    if (q.search) params = params.set('search', q.search);
    if (q.onlyOwing) params = params.set('onlyOwing', 'true');
    return this.http.get<DuesReport>('/api/fees/dues', { params });
  };
  guardianAccount = (guardianId: string) =>
    this.http.post<PortalAccount>(`/api/guardians/${guardianId}/account`, {});
  resetGuardianPassword = (guardianId: string) =>
    this.http.post<PortalAccount>(`/api/guardians/${guardianId}/account/reset-password`, {});
  studentAccount = (studentId: string) =>
    this.http.post<PortalAccount>(`/api/students/${studentId}/account`, {});
  resetStudentPassword = (studentId: string) =>
    this.http.post<PortalAccount>(`/api/students/${studentId}/account/reset-password`, {});
  unlinkGuardian = (studentId: string, guardianId: string) =>
    this.http.delete<void>(`/api/students/${studentId}/guardians/${guardianId}`);

  // ---------- Staff ----------
  staffList = (q: {
    page: number;
    pageSize: number;
    search?: string;
    status?: string | null;
    gender?: string | null;
    designation?: string | null;
    joinedFrom?: string | null;
    joinedTo?: string | null;
    hasLogin?: string | null;
    role?: string | null;
  }) => this.http.get<Page<StaffMember>>('/api/staff', { params: params(q) });
  staffMember = (id: string) => this.http.get<StaffMember>(`/api/staff/${id}`);
  createStaff = (body: NewStaff) => this.http.post<StaffMember>('/api/staff', body);
  updateStaff = (
    id: string,
    body: Partial<Omit<NewStaff, 'account'>> & { status?: string; leftOn?: string },
  ) => this.http.patch<StaffMember>(`/api/staff/${id}`, body);
  addStaffAccount = (id: string, roleCodes: string[]) =>
    this.http.post<StaffMember>(`/api/staff/${id}/account`, { roleCodes });

  // ---------- Teaching assignments ----------
  assignments = (q: { divisionId?: string | null; staffId?: string | null } = {}) =>
    this.http.get<Assignment[]>('/api/teaching-assignments', { params: params(q) });
  myAssignments = () => this.http.get<Assignment[]>('/api/teaching-assignments/mine');
  assign = (body: { staffId: string; divisionId: string; subjectId?: string }) =>
    this.http.post<Assignment>('/api/teaching-assignments', body);
  changeTeacher = (id: string, staffId: string) =>
    this.http.patch<Assignment>(`/api/teaching-assignments/${id}`, { staffId });
  removeAssignment = (id: string) => this.http.delete<void>(`/api/teaching-assignments/${id}`);

  // ---------- Attendance ----------
  attendanceDivisions = () => this.http.get<AttendanceDivision[]>('/api/attendance/divisions');
  attendanceOverview = (date?: string) =>
    this.http.get<AttendanceOverview>('/api/attendance/overview', { params: params({ date }) });
  attendanceRoster = (divisionId: string, date: string) =>
    this.http.get<AttendanceRoster>(`/api/attendance/divisions/${divisionId}`, {
      params: params({ date }),
    });
  markAttendance = (
    divisionId: string,
    date: string,
    entries: { studentId: string; status: AttendanceStatus; note?: string }[],
  ) =>
    this.http.put<AttendanceRoster>(`/api/attendance/divisions/${divisionId}`, { date, entries });
  clearAttendance = (divisionId: string, studentId: string, date: string) =>
    this.http.delete<AttendanceRoster>(
      `/api/attendance/divisions/${divisionId}/students/${studentId}`,
      { params: { date } },
    );
  attendanceReport = (divisionId: string, q: { from?: string; to?: string }) =>
    this.http.get<AttendanceDivisionReport>(`/api/attendance/divisions/${divisionId}/report`, {
      params: params(q),
    });
  studentAttendance = (studentId: string, q: { from?: string; to?: string } = {}) =>
    this.http.get<StudentAttendance>(`/api/attendance/students/${studentId}`, {
      params: params(q),
    });

  // ---------- Year-end promotion ----------
  promotionStatus = (fromAcademicYearId: string, toAcademicYearId: string) =>
    this.http.get<PromotionStatus>('/api/promotion/status', {
      params: params({ fromAcademicYearId, toAcademicYearId }),
    });
  promotionPlan = (fromAcademicYearId: string, toAcademicYearId: string, divisionId: string) =>
    this.http.get<PromotionPlan>('/api/promotion/plan', {
      params: params({ fromAcademicYearId, toAcademicYearId, divisionId }),
    });
  runPromotion = (body: {
    fromAcademicYearId: string;
    toAcademicYearId: string;
    divisionId: string;
    entries: { studentId: string; action: PromotionAction; divisionId?: string }[];
  }) => this.http.post<PromotionResult>('/api/promotion/run', body);

  // ---------- Staff attendance ----------
  staffAttendance = (date: string) =>
    this.http.get<StaffAttendanceRoster>('/api/staff-attendance', { params: { date } });
  markStaffAttendance = (
    date: string,
    entries: { staffId: string; status: AttendanceStatus; note?: string }[],
  ) => this.http.put<StaffAttendanceRoster>('/api/staff-attendance', { date, entries });
  clearStaffAttendance = (staffId: string, date: string) =>
    this.http.delete<StaffAttendanceRoster>(`/api/staff-attendance/${staffId}`, {
      params: { date },
    });
  staffAttendanceReport = (q: { from?: string; to?: string }) =>
    this.http.get<StaffAttendanceReport>('/api/staff-attendance/report', {
      params: params(q),
    });
  myStaffAttendance = (q: { from?: string; to?: string }) =>
    this.http.get<MyStaffAttendance>('/api/staff-attendance/me', { params: params(q) });

  // ---------- Search ----------
  search = (q: string) =>
    this.http.get<{ query: string; groups: SearchGroup[] }>('/api/search', { params: { q } });

  // ---------- Calendar ----------
  calendarEvents = (from: string, to: string) =>
    this.http.get<CalendarEvent[]>('/api/calendar', { params: { from, to } });
  calendarAudiences = () => this.http.get<NoticeAudiences>('/api/calendar/audiences');
  createCalendarEvent = (body: CalendarEventInput) =>
    this.http.post<CalendarEvent>('/api/calendar', body);
  updateCalendarEvent = (id: string, body: Partial<CalendarEventInput>) =>
    this.http.patch<CalendarEvent>(`/api/calendar/${id}`, body);
  archiveCalendarEvent = (id: string) => this.http.delete<void>(`/api/calendar/${id}`);

  // ---------- Notices ----------
  notices = (q: { page: number; pageSize: number; status?: 'active' | 'expired' | 'all' }) =>
    this.http.get<Page<Notice>>('/api/notices', { params: params(q) });
  noticeAudiences = () => this.http.get<NoticeAudiences>('/api/notices/audiences');
  createNotice = (body: NoticeInput) => this.http.post<Notice>('/api/notices', body);
  updateNotice = (id: string, body: Partial<NoticeInput>) =>
    this.http.patch<Notice>(`/api/notices/${id}`, body);
  archiveNotice = (id: string) => this.http.delete<void>(`/api/notices/${id}`);

  payments = (q: {
    page: number;
    pageSize: number;
    from?: string;
    to?: string;
    mode?: string | null;
    search?: string;
  }) => this.http.get<Page<PaymentRow>>('/api/payments', { params: params(q) });
  collection = (from: string, to: string) =>
    this.http.get<Collection>('/api/payments/collection', { params: params({ from, to }) });
  copyFeeStructures = (fromAcademicYearId: string, toAcademicYearId: string) =>
    this.http.post<CopyResult>('/api/fee-structures/copy', {
      fromAcademicYearId,
      toAcademicYearId,
    });

  // ---------- Dashboard insights ----------
  admissionsInsight = () => this.http.get<AdmissionsInsight>('/api/insights/admissions');
  staffInsight = () => this.http.get<StaffInsight>('/api/insights/staff');
  feesInsight = () => this.http.get<FeesInsight | null>('/api/insights/fees');
  attendanceInsight = (days = 30) =>
    this.http.get<AttendanceInsight>('/api/insights/attendance', { params: params({ days }) });
}
