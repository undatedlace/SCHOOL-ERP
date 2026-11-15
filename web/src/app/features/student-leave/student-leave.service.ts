import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Page } from '../../core/models';

export type StudentLeaveStatus = 'PENDING' | 'APPROVED' | 'REFUSED' | 'WITHDRAWN';

export interface StudentLeave {
  id: string;
  student: { id: string; name: string; className: string | null; divisionName: string | null };
  fromDate: string;
  toDate: string;
  halfDay: boolean;
  days: number;
  reason: string;
  status: StudentLeaveStatus;
  requestedBy: { name: string | null };
  decidedBy: { name: string | null } | null;
  decidedAt: string | null;
  decisionNote: string | null;
  withdrawnAt: string | null;
  createdAt: string;
  canWithdraw: boolean;
  canDecide: boolean;
}

export type StudentLeavePage = Page<StudentLeave> & {
  counts: Record<StudentLeaveStatus, number>;
};

export interface StudentLeavePreview {
  studentId: string | null;
  fromDate: string;
  toDate: string;
  halfDay: boolean;
  days: number;
  countedDates: string[];
  skipped: { date: string; reason: 'SUNDAY' | 'HOLIDAY' }[];
  /** Why the request would be refused, in a sentence; null when it is fine. */
  problem: string | null;
}

export interface StudentLeaveQuery {
  page?: number;
  pageSize?: number;
  status?: StudentLeaveStatus | null;
  studentId?: string | null;
  divisionId?: string | null;
  from?: string | null;
  to?: string | null;
}

const params = (values: Record<string, string | number | boolean | null | undefined>) => {
  let p = new HttpParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined && value !== '') p = p.set(key, String(value));
  }
  return p;
};

/** Calls to the student leave ("Report absence") API. */
@Injectable({ providedIn: 'root' })
export class StudentLeaveApi {
  private readonly http = inject(HttpClient);

  list = (q: StudentLeaveQuery = {}) =>
    this.http.get<StudentLeavePage>('/api/student-leave', { params: params({ ...q }) });
  preview = (q: { studentId?: string; fromDate: string; toDate?: string; halfDay?: boolean }) =>
    this.http.get<StudentLeavePreview>('/api/student-leave/preview', { params: params({ ...q }) });
  request = (body: {
    studentId?: string;
    fromDate: string;
    toDate?: string;
    halfDay?: boolean;
    reason: string;
  }) => this.http.post<StudentLeave>('/api/student-leave', body);
  decide = (id: string, approve: boolean, note?: string) =>
    this.http.post<StudentLeave>(`/api/student-leave/${id}/decision`, { approve, note });
  withdraw = (id: string) => this.http.post<StudentLeave>(`/api/student-leave/${id}/withdraw`, {});
}
