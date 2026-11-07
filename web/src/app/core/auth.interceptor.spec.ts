import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { MockInstance } from 'vitest';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('authInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let navigate: MockInstance<Router['navigateByUrl']>;
  let clear: MockInstance<AuthService['clear']>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    clear = vi.spyOn(TestBed.inject(AuthService), 'clear');
  });

  afterEach(() => controller.verify());

  it('sends the user to the login page when the session has ended (401)', () => {
    http.get('/api/users').subscribe({ error: () => undefined });
    controller.expectOne('/api/users').flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(clear).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('leaves 401s from login and me to the caller', () => {
    http.post('/api/auth/login', {}).subscribe({ error: () => undefined });
    controller.expectOne('/api/auth/login').flush({}, { status: 401, statusText: 'Unauthorized' });
    http.get('/api/auth/me').subscribe({ error: () => undefined });
    controller.expectOne('/api/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(navigate).not.toHaveBeenCalled();
  });

  it('sends the user to change their temporary password', () => {
    http.get('/api/school').subscribe({ error: () => undefined });
    controller
      .expectOne('/api/school')
      .flush({ code: 'PASSWORD_CHANGE_REQUIRED' }, { status: 403, statusText: 'Forbidden' });

    expect(navigate).toHaveBeenCalledWith('/change-password');
  });

  it('does not redirect on an ordinary 403', () => {
    http.get('/api/users').subscribe({ error: () => undefined });
    controller.expectOne('/api/users').flush({}, { status: 403, statusText: 'Forbidden' });

    expect(navigate).not.toHaveBeenCalled();
  });

  it('still passes the error on to the caller', () => {
    const onError = vi.fn();
    http.get('/api/users').subscribe({ error: onError });
    controller.expectOne('/api/users').flush({}, { status: 500, statusText: 'Server Error' });

    expect(onError).toHaveBeenCalled();
  });
});
