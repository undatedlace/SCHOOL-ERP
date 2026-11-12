import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

export interface PlatformOwner {
  id: string;
  fullName: string;
  email: string;
  mustChangePassword: boolean;
}

export type SchoolStatus = 'ACTIVE' | 'SUSPENDED';

export interface PlatformSchoolRow {
  id: string;
  name: string;
  code: string;
  status: SchoolStatus;
  createdAt: string;
  isHome: boolean;
  students: number;
  staff: number;
  logins: number;
}

export interface PlatformAdmin {
  id: string;
  fullName: string;
  email: string | null;
  status: 'ACTIVE' | 'DISABLED';
  mustChangePassword: boolean;
  createdAt: string;
  roles: { code: string; name: string }[];
}

export interface PlatformSchool {
  id: string;
  name: string;
  code: string;
  status: SchoolStatus;
  createdAt: string;
  isHome: boolean;
  students: number;
  staff: number;
  admins: PlatformAdmin[];
}

export interface IssuedLogin {
  fullName: string;
  email: string;
  role: string;
  temporaryPassword: string;
}

export interface OnboardInput {
  name: string;
  code?: string;
  superAdminName: string;
  superAdminEmail: string;
  schoolAdminName?: string;
  schoolAdminEmail?: string;
}

export type AdminRole = 'SUPER_ADMIN' | 'SCHOOL_ADMIN';

export const ADMIN_ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  SCHOOL_ADMIN: 'School Admin',
};

/**
 * The platform owner's session and API. Entirely separate from the school sign-in (its own cookie,
 * sent only to /api/platform), so an owner is never a school user and the other way round.
 */
@Injectable({ providedIn: 'root' })
export class PlatformService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly me = signal<PlatformOwner | null>(null);
  private loading?: Promise<PlatformOwner | null>;
  private resolved = false;

  ensureLoaded(): Promise<PlatformOwner | null> {
    if (this.resolved) return Promise.resolve(this.me());
    this.loading ??= this.fetchMe();
    return this.loading;
  }

  async login(email: string, password: string): Promise<PlatformOwner> {
    await firstValueFrom(this.http.post('/api/platform/auth/login', { email, password }));
    this.reload();
    const me = await this.ensureLoaded();
    if (!me) throw new Error('Signed in, but the session could not be loaded');
    return me;
  }

  async changePassword(currentPassword: string, newPassword: string) {
    await firstValueFrom(
      this.http.post('/api/platform/auth/change-password', { currentPassword, newPassword }),
    );
    this.reload();
    await this.ensureLoaded();
  }

  async logout() {
    try {
      await firstValueFrom(this.http.post('/api/platform/auth/logout', {}));
    } catch {
      // Already signed out on the server; either way we are signed out here.
    }
    this.clear();
    await this.router.navigateByUrl('/platform/login');
  }

  clear() {
    this.me.set(null);
    this.resolved = true;
    this.loading = undefined;
  }

  schools = () => this.http.get<PlatformSchoolRow[]>('/api/platform/schools');
  school = (id: string) => this.http.get<PlatformSchool>(`/api/platform/schools/${id}`);
  onboard = (body: OnboardInput) =>
    this.http.post<{ school: { id: string; name: string; code: string }; logins: IssuedLogin[] }>(
      '/api/platform/schools',
      body,
    );
  updateSchool = (id: string, body: { name?: string; code?: string }) =>
    this.http.patch<PlatformSchool>(`/api/platform/schools/${id}`, body);
  setStatus = (id: string, status: SchoolStatus) =>
    this.http.post<PlatformSchool>(
      `/api/platform/schools/${id}/${status === 'SUSPENDED' ? 'suspend' : 'resume'}`,
      {},
    );
  addAdmin = (id: string, body: { fullName: string; email: string; role: AdminRole }) =>
    this.http.post<IssuedLogin>(`/api/platform/schools/${id}/admins`, body);
  resetAdmin = (id: string, userId: string) =>
    this.http.post<{ fullName: string; email: string; temporaryPassword: string }>(
      `/api/platform/schools/${id}/admins/${userId}/reset-password`,
      {},
    );

  private reload() {
    this.resolved = false;
    this.loading = undefined;
  }

  private async fetchMe(): Promise<PlatformOwner | null> {
    try {
      this.me.set(await firstValueFrom(this.http.get<PlatformOwner>('/api/platform/auth/me')));
    } catch (error) {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) throw error;
      this.me.set(null);
    }
    this.resolved = true;
    return this.me();
  }
}

/** "Heera English School" gives "heera-english-school" (the server makes the same suggestion). */
export function suggestSchoolCode(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 30)
    .replace(/^-+|-+$/g, '');
}
