import type { RequestHandler } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence, together with SameSite=Lax cookies: a state-changing request
 * that carries an Origin header must come from an allowed origin.
 * Requests without Origin (curl, server-to-server) are not browser-driven.
 */
export function originCheck(allowedOrigins: string[]): RequestHandler {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (
      SAFE_METHODS.has(req.method) ||
      !origin ||
      allowedOrigins.includes(origin)
    ) {
      next();
      return;
    }
    res.status(403).json({ statusCode: 403, message: 'Origin not allowed' });
  };
}
