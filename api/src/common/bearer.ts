import type { Request } from 'express';

/** The token from `Authorization: Bearer <token>`, as sent by the mobile app. Undefined for browsers. */
export function bearerToken(req: Pick<Request, 'headers'>): string | undefined {
  const h = req.headers.authorization;
  if (typeof h !== 'string') return undefined;
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m?.[1];
}

/** The mobile app says so with this header; only then is the session token returned in the response body. */
export function isMobileClient(req: Pick<Request, 'headers'>): boolean {
  return req.headers['x-client'] === 'mobile';
}
