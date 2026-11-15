/** Shapes from `docs/messaging.md`. */

export interface ConversationStudent {
  id: string;
  name: string;
  className: string | null;
  divisionName: string | null;
  photoFileId: string | null;
}

export interface ConversationTeacher {
  userId: string;
  name: string;
  subjects: string[];
  isClassTeacher: boolean;
}

export interface Conversation {
  id: string;
  subject: string;
  status: 'OPEN' | 'CLOSED';
  myRole: 'family' | 'teacher' | 'admin';
  createdAt: string;
  lastMessageAt: string;
  closedAt: string | null;
  closeReason: string | null;
  student: ConversationStudent;
  teacher: ConversationTeacher;
  lastMessage: { bodyPreview: string; senderIsMe: boolean; createdAt: string } | null;
  unreadCount: number;
  canReply: boolean;
  readOnlyReason: string | null;
}

export interface MessageFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface Message {
  id: string;
  body: string;
  createdAt: string;
  senderIsMe: boolean;
  sender: { userId: string; name: string; side: 'family' | 'teacher' };
  files: MessageFile[];
}

export interface ConversationDetail extends Conversation {
  safetyNotice: string;
  messages: Message[];
  hasMore: boolean;
  nextBefore: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UnreadCounts {
  unread: number;
  unreadMessages: number;
}

export interface FamilyContact {
  studentId: string;
  studentName: string;
  className: string | null;
  divisionName: string | null;
  teacherUserId: string;
  teacherName: string;
  subjects: string[];
  isClassTeacher: boolean;
}

export interface FamilyContacts {
  kind: 'family';
  total: number;
  page: number;
  pageSize: number;
  items: FamilyContact[];
}

export interface SendResult {
  conversation: Conversation;
  message: Message;
  deliveredQuietly: boolean;
}

export const MAX_BODY = 2000;
export const MAX_SUBJECT = 120;
export const MAX_FILES = 3;
