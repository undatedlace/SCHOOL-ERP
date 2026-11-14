import { ApiClient, type Session } from './client';
import { resolveApiBaseUrl } from './config';
import { ApiError, errorFromResponse } from './errors';

interface Call {
  url: string;
  init: RequestInit;
}

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function setup(reply: () => Response | Promise<Response>, session: Session | null = { accountId: 'a1', token: 'tok-a1' }) {
  const calls: Call[] = [];
  const unauthorized: { accountId: string; token: string }[] = [];
  let current = session;
  const client = new ApiClient({
    baseUrl: () => 'http://api.test',
    getSession: () => current,
    onUnauthorized: (accountId, token) => unauthorized.push({ accountId, token }),
    fetchImpl: jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return reply();
    }) as unknown as typeof fetch,
  });
  return { client, calls, unauthorized, setSession: (s: Session | null) => (current = s) };
}

const headersOf = (call: Call) => call.init.headers as Record<string, string>;

describe('ApiClient requests', () => {
  it('sends the bearer token, X-Client: mobile, and uses /api/v1', async () => {
    const { client, calls } = setup(() => jsonResponse(200, { ok: true }));
    const result = await client.get<{ ok: boolean }>('/notifications/unread-count');
    expect(result).toEqual({ ok: true });
    expect(calls[0]!.url).toBe('http://api.test/api/v1/notifications/unread-count');
    expect(headersOf(calls[0]!)).toMatchObject({
      Authorization: 'Bearer tok-a1',
      'X-Client': 'mobile',
    });
  });

  it('sends JSON bodies with a content type, and builds the query string', async () => {
    const { client, calls } = setup(() => jsonResponse(200, {}));
    await client.post('/things', { a: 1 }, {});
    await client.get('/students', { query: { page: 1, pageSize: 50, q: 'a b', skip: undefined, empty: '' } });
    expect(calls[0]!.init.body).toBe('{"a":1}');
    expect(headersOf(calls[0]!)['Content-Type']).toBe('application/json');
    expect(calls[1]!.url).toBe('http://api.test/api/v1/students?page=1&pageSize=50&q=a%20b');
  });

  it('leaves out the token when asked (sign-in) and uses an explicit token when given', async () => {
    const { client, calls, unauthorized } = setup(() => jsonResponse(401, { message: 'Invalid credentials' }));
    await expect(client.post('/auth/login', { identifier: 'x', password: 'y' }, { auth: 'none' })).rejects.toBeInstanceOf(ApiError);
    expect(headersOf(calls[0]!).Authorization).toBeUndefined();
    await expect(client.get('/auth/me', { token: 'fresh' })).rejects.toBeInstanceOf(ApiError);
    expect(headersOf(calls[1]!).Authorization).toBe('Bearer fresh');
    // A 401 on sign-in, or on a token that was handed in, never signs anyone out.
    expect(unauthorized).toEqual([]);
  });

  it('returns undefined for 204', async () => {
    const { client } = setup(() => new Response(null, { status: 204 }));
    await expect(client.post('/auth/logout')).resolves.toBeUndefined();
  });
});

describe('401 handling', () => {
  it('signs out the account that made the request, with the token it used', async () => {
    const { client, unauthorized } = setup(() => jsonResponse(401, { message: 'Unauthorized' }));
    await expect(client.get('/students')).rejects.toMatchObject({ code: 'unauthorized', status: 401 });
    expect(unauthorized).toEqual([{ accountId: 'a1', token: 'tok-a1' }]);
  });

  it('signs out the right account even if the person switched account while the request was in flight', async () => {
    let release!: (r: Response) => void;
    const pending = new Promise<Response>((resolve) => (release = resolve));
    const { client, unauthorized, setSession } = setup(() => pending);

    const request = client.get('/students'); // made as account a1
    setSession({ accountId: 'a2', token: 'tok-a2' }); // the person switches to a2
    release(jsonResponse(401, { message: 'Unauthorized' }));
    await expect(request).rejects.toBeInstanceOf(ApiError);

    expect(unauthorized).toEqual([{ accountId: 'a1', token: 'tok-a1' }]);
  });

  it('does nothing about a 403 or a 404', async () => {
    const forbidden = setup(() => jsonResponse(403, { message: 'Forbidden resource' }));
    await expect(forbidden.client.get('/x')).rejects.toMatchObject({ code: 'forbidden' });
    const missing = setup(() => jsonResponse(404, { message: 'Not found' }));
    await expect(missing.client.get('/x')).rejects.toMatchObject({ code: 'not_found' });
    expect(forbidden.unauthorized).toEqual([]);
    expect(missing.unauthorized).toEqual([]);
  });
});

describe('typed errors', () => {
  it('turns a dropped connection into a network error', async () => {
    const { client } = setup(() => {
      throw new TypeError('Network request failed');
    });
    await expect(client.get('/x')).rejects.toMatchObject({ code: 'network', status: 0, isNetwork: true });
  });

  it('keeps the server message for validation errors, joined when it is a list', () => {
    const single = errorFromResponse(400, { message: 'Current password is incorrect' });
    expect(single).toMatchObject({ code: 'validation', message: 'Current password is incorrect' });
    const many = errorFromResponse(400, { message: ['a must be a string', 'b must be a number'] });
    expect(many.message).toBe('a must be a string. b must be a number');
  });

  it('says it kindly for rate limits and server faults, without leaking server text', () => {
    expect(errorFromResponse(429, { message: 'ThrottlerException: Too Many Requests' }).message).toMatch(/wait a minute/i);
    const server = errorFromResponse(500, { message: 'Internal server error: secret detail' });
    expect(server.code).toBe('server');
    expect(server.message).not.toMatch(/secret/);
  });

  it('refuses to call a build with no server address', async () => {
    const client = new ApiClient({ baseUrl: () => '', getSession: () => null, onUnauthorized: () => undefined });
    await expect(client.get('/x')).rejects.toMatchObject({ code: 'not_configured' });
  });
});

describe('resolveApiBaseUrl', () => {
  it('prefers the environment, then app.config extra', () => {
    expect(resolveApiBaseUrl({ env: 'https://ppe.example/', extra: 'https://x', os: 'ios', dev: true })).toBe('https://ppe.example');
    expect(resolveApiBaseUrl({ env: undefined, extra: 'https://extra.example', os: 'ios', dev: false })).toBe('https://extra.example');
  });
  it('falls back to the local API only in development, per platform', () => {
    expect(resolveApiBaseUrl({ os: 'ios', dev: true })).toBe('http://localhost:3104');
    expect(resolveApiBaseUrl({ os: 'android', dev: true })).toBe('http://10.0.2.2:3104');
    expect(resolveApiBaseUrl({ os: 'ios', dev: false })).toBe('');
  });
});
