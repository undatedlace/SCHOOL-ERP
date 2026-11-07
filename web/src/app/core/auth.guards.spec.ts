import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  RouterStateSnapshot,
  Router,
  UrlTree,
} from '@angular/router';
import {
  authGuard,
  guestGuard,
  homeGuard,
  loggedInGuard,
  permissionGuard,
  portalGuard,
  staffGuard,
} from './auth.guards';
import { AuthService } from './auth.service';
import { Me } from './models';

const me = (over: Partial<Me> = {}): Me => ({
  id: '1',
  fullName: 'Test',
  roles: ['TEACHER'],
  permissions: ['academics.read'],
  mustChangePassword: false,
  ...over,
});

describe('route guards', () => {
  let auth: AuthService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  /** Runs a guard as the given user (null = not logged in) and returns the redirect path, or true. */
  async function run(guard: CanActivateFn, user: Me | null): Promise<boolean | string> {
    auth.clear(); // marks the session as already loaded, so no request is made
    auth.me.set(user);
    const result = await TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
    return result instanceof UrlTree ? router.serializeUrl(result) : (result as boolean);
  }

  it('authGuard: login required, and a temporary password must be replaced first', async () => {
    expect(await run(authGuard, null)).toBe('/login');
    expect(await run(authGuard, me({ mustChangePassword: true }))).toBe('/change-password');
    expect(await run(authGuard, me())).toBe(true);
  });

  it('loggedInGuard: allows users who still have a temporary password', async () => {
    expect(await run(loggedInGuard, null)).toBe('/login');
    expect(await run(loggedInGuard, me({ mustChangePassword: true }))).toBe(true);
  });

  it('guestGuard: the login page is only for people who are not logged in', async () => {
    expect(await run(guestGuard, null)).toBe(true);
    expect(await run(guestGuard, me())).toBe('/app');
    expect(await run(guestGuard, me({ roles: ['PARENT'] }))).toBe('/portal');
    expect(await run(guestGuard, me({ mustChangePassword: true }))).toBe('/change-password');
  });

  it('staffGuard and portalGuard keep each audience in its own area', async () => {
    expect(await run(staffGuard, me())).toBe(true);
    expect(await run(staffGuard, me({ roles: ['STUDENT'] }))).toBe('/portal');
    expect(await run(portalGuard, me({ roles: ['PARENT'] }))).toBe(true);
    expect(await run(portalGuard, me())).toBe('/app');
  });

  it('permissionGuard: redirects home when the permission is missing', async () => {
    expect(await run(permissionGuard('academics.read'), me())).toBe(true);
    expect(await run(permissionGuard('users.manage'), me())).toBe('/app');
  });

  it('homeGuard: sends each visitor to the right place', async () => {
    expect(await run(homeGuard, null)).toBe('/login');
    expect(await run(homeGuard, me())).toBe('/app');
    expect(await run(homeGuard, me({ roles: ['PARENT'] }))).toBe('/portal');
    expect(await run(homeGuard, me({ mustChangePassword: true }))).toBe('/change-password');
  });
});
