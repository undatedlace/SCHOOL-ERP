import type { RequestHandler } from 'express';

/**
 * `/api/v1/...` is the same API as `/api/...`. Mobile apps in the field cannot be updated at once,
 * so they pin to `/api/v1`; a later breaking change can then live at `/api/v2` beside it.
 */
export const apiVersionAlias: RequestHandler = (req, _res, next) => {
  if (
    req.url === '/api/v1' ||
    req.url.startsWith('/api/v1/') ||
    req.url.startsWith('/api/v1?')
  ) {
    req.url = '/api' + req.url.slice('/api/v1'.length);
  }
  next();
};
