import type { Request, Response } from 'express';
import { originCheck } from './origin-check.js';

function run(method: string, origin?: string) {
  const next = vi.fn();
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  originCheck(['http://localhost:4200'])(
    { method, headers: { origin } } as unknown as Request,
    { status } as unknown as Response,
    next,
  );
  return { next, status, json };
}

describe('originCheck', () => {
  it('lets safe methods through from any origin', () => {
    expect(run('GET', 'http://evil.example').next).toHaveBeenCalled();
  });

  it('lets state-changing requests through from an allowed origin', () => {
    expect(run('POST', 'http://localhost:4200').next).toHaveBeenCalled();
  });

  it('lets requests without an Origin header through (not browser-driven)', () => {
    expect(run('POST').next).toHaveBeenCalled();
  });

  it('blocks state-changing requests from other origins', () => {
    const { next, status } = run('DELETE', 'http://evil.example');
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });
});
