import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  AcademicYear,
  AuditLogItem,
  Page,
  Role,
  School,
  SchoolClass,
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
  createYear = (body: { name: string; startDate: string; endDate: string; isCurrent: boolean }) =>
    this.http.post<AcademicYear>('/api/academic-years', body);
  updateYear = (
    id: string,
    body: { name: string; startDate: string; endDate: string; isCurrent: boolean },
  ) => this.http.patch<AcademicYear>(`/api/academic-years/${id}`, body);
  setCurrentYear = (id: string) =>
    this.http.post<AcademicYear>(`/api/academic-years/${id}/set-current`, {});

  classes = () => this.http.get<SchoolClass[]>('/api/classes');
  createClass = (name: string) => this.http.post<SchoolClass>('/api/classes', { name });
  updateClass = (id: string, name: string) =>
    this.http.patch<SchoolClass>(`/api/classes/${id}`, { name });
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
}
