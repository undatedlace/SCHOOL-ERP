import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PlatformService } from './platform.service';

/** The owner's pages: signed in as an owner, with no temporary password left to change. */
export const ownerGuard: CanActivateFn = async () => {
  const platform = inject(PlatformService);
  const router = inject(Router);
  const me = await platform.ensureLoaded();
  if (!me) return router.createUrlTree(['/platform/login']);
  if (me.mustChangePassword) return router.createUrlTree(['/platform/change-password']);
  return true;
};

/** The owner's change-password page: signed in, even with a temporary password. */
export const ownerSignedInGuard: CanActivateFn = async () => {
  const platform = inject(PlatformService);
  const router = inject(Router);
  return (await platform.ensureLoaded()) ? true : router.createUrlTree(['/platform/login']);
};

/** The owner's sign-in page: an owner already signed in goes to their schools. */
export const ownerGuestGuard: CanActivateFn = async () => {
  const platform = inject(PlatformService);
  const router = inject(Router);
  const me = await platform.ensureLoaded();
  if (!me) return true;
  return router.createUrlTree([me.mustChangePassword ? '/platform/change-password' : '/platform']);
};
