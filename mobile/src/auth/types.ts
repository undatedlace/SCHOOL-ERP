/** Which set of tabs an account gets. Worked out from what `/auth/me` says the account may do. */
export type RoleKind = 'family' | 'teacher' | 'other';

/** A saved account: just enough to show in the account switcher. The token is stored apart. */
export interface Account {
  /** The user id from the API. */
  id: string;
  fullName: string;
  kind: RoleKind;
  /** "Student", "Teacher" and so on, shown under the name. */
  roleLabel: string;
  /** A private photo file on the API (fetched with this account's token). */
  photoFileId: string | null;
  /** A short line such as "Nursery · A". */
  subtitle: string | null;
}

/** `GET /auth/me` */
export interface MeResponse {
  id: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  mustChangePassword: boolean;
}

/** `POST /auth/login` when the request carries `X-Client: mobile`. */
export interface LoginResponse {
  mustChangePassword: boolean;
  token: string;
  expiresInMs: number;
}

/** `POST /auth/change-password` when the request carries `X-Client: mobile`. */
export interface ChangePasswordResponse {
  token: string;
  expiresInMs: number;
}

/** `GET /app-info` (public). */
export interface AppInfo {
  environmentLabel: string | null;
  feedbackUrl: string | null;
  schoolCodeOffered: boolean;
}
