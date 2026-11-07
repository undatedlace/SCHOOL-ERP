import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Me } from './models';

const staff: Me = {
  id: '1',
  fullName: 'Asha Rao',
  roles: ['TEACHER'],
  permissions: ['academics.read', 'attendance.mark'],
  mustChangePassword: false,
};

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the session once and shares the result', async () => {
    const a = auth.ensureLoaded();
    const b = auth.ensureLoaded();
    http.expectOne('/api/auth/me').flush(staff);

    expect(await a).toEqual(staff);
    expect(await b).toEqual(staff);
    expect(await auth.ensureLoaded()).toEqual(staff); // cached: no second request
    expect(auth.me()).toEqual(staff);
  });

  it('treats a 401 as "not logged in" and does not ask again', async () => {
    const result = auth.ensureLoaded();
    http.expectOne('/api/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(await result).toBeNull();
    expect(auth.me()).toBeNull();
    expect(await auth.ensureLoaded()).toBeNull();
  });

  it('does not hide other failures', async () => {
    const result = auth.ensureLoaded();
    http.expectOne('/api/auth/me').flush({}, { status: 500, statusText: 'Server Error' });
    await expect(result).rejects.toBeDefined();
  });

  it('answers permission questions', async () => {
    const result = auth.ensureLoaded();
    http.expectOne('/api/auth/me').flush(staff);
    await result;

    expect(auth.has('academics.read')).toBe(true);
    expect(auth.has('users.manage')).toBe(false);
  });

  it('sends staff to /app and parents and students to /portal', async () => {
    const first = auth.ensureLoaded();
    http.expectOne('/api/auth/me').flush(staff);
    await first;
    expect(auth.isPortalUser()).toBe(false);
    expect(auth.homeUrl()).toBe('/app');

    auth.me.set({ ...staff, roles: ['PARENT'] });
    expect(auth.homeUrl()).toBe('/portal');
    auth.me.set({ ...staff, roles: ['PARENT', 'TEACHER'] });
    expect(auth.homeUrl()).toBe('/app');
    auth.me.set({ ...staff, roles: [] });
    expect(auth.homeUrl()).toBe('/app');
  });

  it('login posts the credentials, then loads the session', async () => {
    const result = auth.login('asha@school.test', 'secret-password');
    const post = http.expectOne('/api/auth/login');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({
      identifier: 'asha@school.test',
      password: 'secret-password',
    });
    post.flush({ mustChangePassword: false });
    await Promise.resolve();
    await Promise.resolve();
    http.expectOne('/api/auth/me').flush(staff);

    expect(await result).toEqual(staff);
  });

  it('logout clears the session and goes to the login page', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    auth.me.set(staff);

    const result = auth.logout();
    http.expectOne('/api/auth/logout').flush(null);
    await result;

    expect(auth.me()).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('logs out locally even if the server call fails', async () => {
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    auth.me.set(staff);

    const result = auth.logout();
    http.expectOne('/api/auth/logout').flush({}, { status: 401, statusText: 'Unauthorized' });
    await result;

    expect(auth.me()).toBeNull();
  });
});
