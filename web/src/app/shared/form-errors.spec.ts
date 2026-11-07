import { FormControl, Validators } from '@angular/forms';
import { fieldError } from './form-errors';

describe('fieldError', () => {
  it('stays quiet until the control is touched', () => {
    const c = new FormControl('', Validators.required);
    expect(fieldError(c, 'Name')).toBeNull();
    c.markAsTouched();
    expect(fieldError(c, 'Name')).toBe('Name is required');
  });

  it('explains common problems', () => {
    const email = new FormControl('x', Validators.email);
    email.markAsTouched();
    expect(fieldError(email, 'Email')).toBe('Enter a valid email address');

    const short = new FormControl('abc', Validators.minLength(10));
    short.markAsTouched();
    expect(fieldError(short, 'Password')).toBe('Password must be at least 10 characters');
  });

  it('returns nothing for a valid control', () => {
    const c = new FormControl('ok', Validators.required);
    c.markAsTouched();
    expect(fieldError(c, 'Name')).toBeNull();
    expect(fieldError(null, 'Name')).toBeNull();
  });
});
