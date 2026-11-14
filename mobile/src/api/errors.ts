export type ApiErrorCode =
  | 'network'
  | 'timeout'
  | 'not_configured'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'rate_limited'
  | 'server'
  | 'unknown';

/**
 * Every failed request becomes one of these. `message` is safe to show to a person;
 * `serverMessage` is exactly what the API said (for decisions, not for display).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly serverMessage: string | null;

  constructor(status: number, code: ApiErrorCode, message: string, serverMessage: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.serverMessage = serverMessage;
  }

  get isNetwork() {
    return this.code === 'network' || this.code === 'timeout';
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

/** A person-friendly sentence for any error. */
export function errorMessage(e: unknown): string {
  if (isApiError(e)) return e.message;
  return 'Something went wrong. Please try again.';
}

function codeFor(status: number): ApiErrorCode {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  if (status === 400 || status === 422) return 'validation';
  if (status >= 500) return 'server';
  return 'unknown';
}

/** What NestJS sends: `{ message: string | string[], error, statusCode }`. */
export function serverMessageOf(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const m = (body as { message?: unknown }).message;
  if (typeof m === 'string' && m.trim()) return m.trim();
  if (Array.isArray(m)) {
    const parts = m.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
    if (parts.length) return parts.join('. ');
  }
  return null;
}

export function errorFromResponse(status: number, body: unknown): ApiError {
  const code = codeFor(status);
  const server = serverMessageOf(body);
  let message: string;
  switch (code) {
    case 'rate_limited':
      message = 'Too many attempts. Please wait a minute and try again.';
      break;
    case 'server':
      message = 'The school server had a problem. Please try again in a moment.';
      break;
    case 'unauthorized':
      message = server ?? 'Please sign in again.';
      break;
    case 'forbidden':
      message = server ?? 'You do not have access to this.';
      break;
    case 'not_found':
      message = 'We could not find that.';
      break;
    default:
      message = server ?? 'Something went wrong. Please try again.';
  }
  return new ApiError(status, code, message, server);
}
