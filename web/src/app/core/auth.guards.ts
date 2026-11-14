import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Needs a logged-in user who has no temporary password to replace. */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const me = await auth.ensureLoaded();
  if (!me) return router.createUrlTree(['/login']);
  if (me.mustChangePassword) return router.createUrlTree(['/change-password']);
  return true;
};

/** Needs a logged-in user, even one who must still change their password. */
export const loggedInGuard: CanActivateFn = async () => {
  // inject() only works before the first await.
  const auth = inject(AuthService);
  const router = inject(Router);
  const me = await auth.ensureLoaded();
  return me ? true : router.createUrlTree(['/login']);
};

/** For the login page: send people who are already logged in to their home. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const me = await auth.ensureLoaded();
  if (!me) return true;
  return router.createUrlTree([me.mustChangePassword ? '/change-password' : auth.homeUrl()]);
};

/** The staff area is for everyone except portal-only users (parents, students). */
export const staffGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isPortalUser() ? inject(Router).createUrlTree(['/portal']) : true;
};

/** The portal is for portal-only users. */
export const portalGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isPortalUser() ? true : inject(Router).createUrlTree(['/app']);
};

/** Hides a page (the API still enforces it): `canActivate: [permissionGuard('users.manage')]`. */
export const permissionGuard =
  (permission: string): CanActivateFn =>
  () => {
    const auth = inject(AuthService);
    return auth.has(permission) ? true : inject(Router).createUrlTree([auth.homeUrl()]);
  };

/** The user must hold at least one of the permissions. */
export const anyPermissionGuard =
  (permissions: string[]): CanActivateFn =>
  () => {
    const auth = inject(AuthService);
    return permissions.some((p) => auth.has(p))
      ? true
      : inject(Router).createUrlTree([auth.homeUrl()]);
  };

/** For `/`: go to the right place. */
export const homeGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const me = await auth.ensureLoaded();
  if (!me) return router.createUrlTree(['/login']);
  return router.createUrlTree([me.mustChangePassword ? '/change-password' : auth.homeUrl()]);
};
