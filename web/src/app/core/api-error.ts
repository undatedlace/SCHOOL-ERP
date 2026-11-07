import { HttpErrorResponse } from '@angular/common/http';

/** A readable message from a failed API call. */
export function apiError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const message: unknown = error.error?.message;
    if (Array.isArray(message)) return message.join('. ');
    if (typeof message === 'string') return message;
    if (error.status === 0) return 'Cannot reach the server. Check your connection.';
    if (error.status === 429) return 'Too many attempts. Please wait a minute and try again.';
  }
  return 'Something went wrong. Please try again.';
}
