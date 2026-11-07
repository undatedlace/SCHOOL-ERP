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
