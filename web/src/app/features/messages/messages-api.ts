import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { FileRef, Page } from '../../core/models';

export type ConversationStatus = 'OPEN' | 'CLOSED';
export type ConversationRole = 'family' | 'teacher' | 'admin';

/** One conversation as shown in the inbox. */
export interface Conversation {
  id: string;
  subject: string;
  status: ConversationStatus;
  /** How the signed-in person takes part: as the family, as the teacher, or only reading (administrator). */
  myRole: ConversationRole;
  createdAt: string;
  lastMessageAt: string;
  closedAt: string | null;
  closeReason: string | null;
  student: {
    id: string;
    name: string;
    className: string | null;
    divisionName: string | null;
    photoFileId: string | null;
  };
  teacher: { userId: string; name: string; subjects: string[]; isClassTeacher: boolean };
  lastMessage: { bodyPreview: string; senderIsMe: boolean; createdAt: string } | null;
  unreadCount: number;
  canReply: boolean;
  readOnlyReason: string | null;
}

export interface ChatMessage {
  id: string;
  body: string;
  createdAt: string;
  senderIsMe: boolean;
  sender: { userId: string; name: string; side: 'family' | 'teacher' };
  files: FileRef[];
}

export interface ConversationDetail extends Conversation {
  safetyNotice: string;
  messages: ChatMessage[];
  hasMore: boolean;
  nextBefore: string | null;
}

export interface SendResult {
  conversation: Conversation;
  message: ChatMessage;
  /** True when a family message reached the teacher in quiet hours: they will see it in school hours. */
  deliveredQuietly: boolean;
}

export interface FamilyContact {
  studentId: string;
  studentName: string;
  className: string;
  divisionName: string;
  teacherUserId: string;
  teacherName: string;
  subjects: string[];
  isClassTeacher: boolean;
}
export interface StudentContact {
  studentId: string;
  name: string;
  admissionNo: string;
  className: string;
  divisionId: string;
  divisionName: string;
  photoFileId: string | null;
}
export type Contacts =
  (Page<FamilyContact> & { kind: 'family' }) | (Page<StudentContact> & { kind: 'teacher' });

export interface ConversationQuery {
  page: number;
  pageSize: number;
  all?: boolean;
  unread?: boolean;
  q?: string;
  classId?: string;
  divisionId?: string;
  teacherUserId?: string;
  from?: string;
  to?: string;
}

export interface NewConversation {
  studentId?: string;
  teacherUserId?: string;
  subject: string;
  body: string;
  fileIds?: string[];
}

const params = (values: Record<string, string | number | boolean | null | undefined>) => {
  let p = new HttpParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined && value !== '' && value !== false) {
      p = p.set(key, String(value));
    }
  }
  return p;
};

/** The calls of the Messages screens (see docs/messaging.md). */
@Injectable({ providedIn: 'root' })
export class MessagesApi {
  private readonly http = inject(HttpClient);

  conversations = (q: ConversationQuery) =>
    this.http.get<Page<Conversation>>('/api/messages', { params: params({ ...q }) });
  conversation = (id: string, before?: string) =>
    this.http.get<ConversationDetail>(`/api/messages/${id}`, {
      params: params({ before, limit: 30 }),
    });
  unreadCount = () =>
    this.http.get<{ unread: number; unreadMessages: number }>('/api/messages/unread-count');
  contacts = (q: { q?: string; page?: number; pageSize?: number; as?: string }) =>
    this.http.get<Contacts>('/api/messages/contacts', {
      params: params({ page: 1, pageSize: 20, ...q }),
    });
  start = (body: NewConversation) => this.http.post<SendResult>('/api/messages', body);
  send = (id: string, body: { body: string; fileIds?: string[] }) =>
    this.http.post<SendResult>(`/api/messages/${id}/messages`, body);
  markRead = (id: string) => this.http.post<{ unread: number }>(`/api/messages/${id}/read`, {});
  close = (id: string, reason: string) =>
    this.http.post<Conversation>(`/api/messages/${id}/close`, { reason });
  fileUrl = (id: string, fileId: string) => `/api/messages/${id}/files/${fileId}`;
}
