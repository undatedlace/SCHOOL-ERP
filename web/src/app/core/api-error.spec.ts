import { HttpErrorResponse } from '@angular/common/http';
import { apiError } from './api-error';

const fail = (status: number, body: unknown) => new HttpErrorResponse({ status, error: body });

describe('apiError', () => {
  it('uses the message from the API', () => {
    expect(apiError(fail(409, { message: 'A record with these values already exists' }))).toBe(
      'A record with these values already exists',
    );
  });

  it('joins validation messages', () => {
    expect(
      apiError(fail(400, { message: ['email must be an email', 'roleCodes should not be empty'] })),
    ).toBe('email must be an email. roleCodes should not be empty');
  });

  it('explains network and rate-limit failures', () => {
    expect(apiError(fail(0, null))).toMatch(/Cannot reach the server/);
    expect(apiError(fail(429, {}))).toMatch(/Too many attempts/);
  });

  it('falls back to a generic message', () => {
    expect(apiError(new Error('boom'))).toMatch(/Something went wrong/);
    expect(apiError(fail(500, {}))).toMatch(/Something went wrong/);
  });
});
