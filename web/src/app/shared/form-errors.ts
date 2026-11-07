import { AbstractControl } from '@angular/forms';

/** A readable message for the first problem on a control, once the user has touched it. */
export function fieldError(control: AbstractControl | null, label: string): string | null {
  if (!control || !control.touched || !control.errors) return null;
  const e = control.errors;
  if (e['required']) return `${label} is required`;
  if (e['email']) return 'Enter a valid email address';
  if (e['minlength'])
    return `${label} must be at least ${e['minlength'].requiredLength} characters`;
  if (e['maxlength']) return `${label} must be at most ${e['maxlength'].requiredLength} characters`;
  if (e['pattern']) return `${label} is not in a valid format`;
  if (e['mismatch']) return e['mismatch'];
  return `${label} is not valid`;
}
