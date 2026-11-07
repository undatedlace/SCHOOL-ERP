import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Calls where a 401 just means "not logged in" and is handled by the caller. */
const QUIET_401 = ['/api/auth/login', '/api/auth/me'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Resolved lazily: AuthService itself uses HttpClient, which uses this interceptor.
  const injector = inject(Injector);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        if (error.status === 401 && !QUIET_401.some((u) => req.url.startsWith(u))) {
          injector.get(AuthService).clear();
          void injector.get(Router).navigateByUrl('/login');
        } else if (error.status === 403 && error.error?.code === 'PASSWORD_CHANGE_REQUIRED') {
          void injector.get(Router).navigateByUrl('/change-password');
        }
      }
      return throwError(() => error);
    }),
  );
};
