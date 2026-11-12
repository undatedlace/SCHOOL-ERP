import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Me } from './models';

const PORTAL_ROLES = ['PARENT', 'STUDENT'];

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  /** The logged-in user, or null. Never trust this for security: the API enforces access. */
  readonly me = signal<Me | null>(null);
  private loading?: Promise<Me | null>;
  private resolved = false;

  readonly isPortalUser = computed(() => {
    const roles = this.me()?.roles ?? [];
    return roles.length > 0 && roles.every((r) => PORTAL_ROLES.includes(r));
  });

  /** Where this user lands after login. */
  readonly homeUrl = computed(() => (this.isPortalUser() ? '/portal' : '/app'));

  /** Loads the session once per page load, then returns the cached result. */
  ensureLoaded(): Promise<Me | null> {
    if (this.resolved) return Promise.resolve(this.me());
    this.loading ??= this.fetchMe();
    return this.loading;
  }

  async login(identifier: string, password: string, schoolCode?: string): Promise<Me> {
    await firstValueFrom(
      this.http.post('/api/auth/login', {
        identifier,
        password,
        ...(schoolCode ? { schoolCode } : {}),
      }),
    );
    this.resolved = false;
    this.loading = undefined;
    const me = await this.ensureLoaded();
    if (!me) throw new Error('Login succeeded but the session could not be loaded');
    return me;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await firstValueFrom(
      this.http.post('/api/auth/change-password', { currentPassword, newPassword }),
    );
    this.resolved = false;
    this.loading = undefined;
    await this.ensureLoaded();
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}));
    } catch {
      // The cookie may already be invalid; either way we are logged out here.
    }
    this.clear();
    await this.router.navigateByUrl('/login');
  }

  /** Forget the local session (for example after the server returned 401). */
  clear(): void {
    this.me.set(null);
    this.resolved = true;
    this.loading = undefined;
  }

  has(permission: string): boolean {
    return this.me()?.permissions.includes(permission) ?? false;
  }

  private async fetchMe(): Promise<Me | null> {
    try {
      const me = await firstValueFrom(this.http.get<Me>('/api/auth/me'));
      this.me.set(me);
    } catch (error) {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) throw error;
      this.me.set(null);
    }
    this.resolved = true;
    return this.me();
  }
}
