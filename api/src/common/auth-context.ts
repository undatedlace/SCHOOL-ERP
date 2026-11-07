import type { Request } from 'express';

/** What the session guard attaches to every authenticated request. */
export interface AuthContext {
  userId: string;
  schoolId: string;
  sessionId: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  mustChangePassword: boolean;
}

export type AuthedRequest = Request & { auth?: AuthContext };
