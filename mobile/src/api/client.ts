import { API_PREFIX, getApiBaseUrl } from './config';
import { ApiError, errorFromResponse } from './errors';

/** Who a request is made for: the signed-in account and its token. */
export interface Session {
  accountId: string;
  token: string;
}

export interface ApiClientDeps {
  baseUrl: () => string;
  /** The account requests are made for right now. */
  getSession: () => Session | null;
  /**
   * Called when the API says that account's session is no longer valid (HTTP 401). Gets the
   * token the request was sent with, so a late answer to an old token can be told apart.
   */
  onUnauthorized: (accountId: string, token: string) => void;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, QueryValue>;
  /** JSON body. For files use `form`. */
  body?: unknown;
  /** Multipart upload. Do not set a Content-Type; the runtime adds the boundary. */
  form?: FormData;
  /**
   * `session` (default): send the current account's token; a 401 signs that account out.
   * `none`: no token (sign-in, app info).
   */
  auth?: 'session' | 'none';
  /**
   * Use this token instead of the session's (right after sign-in, before the account is saved).
   * A 401 then just fails the request; it never signs anyone out.
   */
  token?: string;
  signal?: AbortSignal;
}

export interface PhotoSource {
  uri: string;
  headers: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 20_000;

export class ApiClient {
  constructor(private readonly deps: ApiClientDeps) {}

  /** Full address of an API path, for downloads that go through the file system or the image view. */
  url(path: string, query?: Record<string, QueryValue>): string {
    const base = this.deps.baseUrl();
    const qs = buildQuery(query);
    return `${base}${API_PREFIX}${path}${qs}`;
  }

  /** The headers every request carries. For code that downloads files itself. */
  authHeaders(token?: string): Record<string, string> {
    const t = token ?? this.deps.getSession()?.token;
    return {
      'X-Client': 'mobile',
      Accept: 'application/json',
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
    };
  }

  /** A private file (a photo) as an image source with the account's token. */
  fileSource(fileId: string | null | undefined): PhotoSource | null {
    if (!fileId || !this.deps.getSession()) return null;
    return { uri: this.url(`/files/${fileId}`), headers: this.authHeaders() };
  }

  get<T>(path: string, options: Omit<RequestOptions, 'method' | 'body' | 'form'> = {}) {
    return this.request<T>(path, { ...options, method: 'GET' });
  }
  post<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }
  put<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }
  patch<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }
  delete<T>(path: string, options: Omit<RequestOptions, 'method' | 'body' | 'form'> = {}) {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const base = this.deps.baseUrl();
    if (!base) {
      throw new ApiError(0, 'not_configured', 'This build of the app has no server address.');
    }

    // The account is fixed when the request starts. If the person switches account while it is
    // in flight and the API then says 401, it is the account that asked that gets signed out.
    const session = options.auth === 'none' ? null : this.deps.getSession();
    const token = options.token ?? session?.token;

    const headers: Record<string, string> = this.authHeaders(token ?? undefined);
    if (!token) delete headers.Authorization;
    let body: BodyInit | undefined;
    if (options.form) {
      body = options.form;
    } else if (options.body !== undefined) {
      body = JSON.stringify(options.body);
      headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    options.signal?.addEventListener('abort', () => controller.abort());

    let response: Response;
    try {
      response = await (this.deps.fetchImpl ?? fetch)(this.url(path, options.query), {
        method: options.method ?? 'GET',
        headers,
        body,
        signal: controller.signal,
      });
    } catch {
      const aborted = controller.signal.aborted && !options.signal?.aborted;
      throw aborted
        ? new ApiError(0, 'timeout', 'The school server took too long to answer. Please try again.')
        : new ApiError(0, 'network', 'Cannot reach the school server. Check your internet connection.');
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 204) return undefined as T;

    let parsed: unknown = null;
    const text = await response.text().catch(() => '');
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }

    if (!response.ok) {
      const error = errorFromResponse(response.status, parsed);
      if (response.status === 401 && session && !options.token) {
        this.deps.onUnauthorized(session.accountId, session.token);
      }
      throw error;
    }
    return parsed as T;
  }
}

function buildQuery(query?: Record<string, QueryValue>): string {
  if (!query) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * The app's one client. The auth provider connects it to the signed-in account (`bindApi`);
 * features just `import { api } from '@/api'`.
 */
const bound: { getSession: () => Session | null; onUnauthorized: (accountId: string, token: string) => void } = {
  getSession: () => null,
  onUnauthorized: () => undefined,
};

export function bindApi(handlers: Partial<typeof bound>) {
  Object.assign(bound, handlers);
}

export const api = new ApiClient({
  baseUrl: getApiBaseUrl,
  getSession: () => bound.getSession(),
  onUnauthorized: (id, token) => bound.onUnauthorized(id, token),
});
