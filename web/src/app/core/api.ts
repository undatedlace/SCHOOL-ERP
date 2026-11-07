import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  AcademicYear,
  AdmissionsSummary,
  ApplicationDetail,
  ApplicationListItem,
  AuditLogItem,
  Decision,
  Eligibility,
  FormDetail,
  GuardianInput,
  FormSchema,
  FormSummary,
  FormVersion,
  Page,
  Role,
  School,
  SchoolClass,
  StudentDetail,
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
  unlinkGuardian = (studentId: string, guardianId: string) =>
    this.http.delete<void>(`/api/students/${studentId}/guardians/${guardianId}`);
}
