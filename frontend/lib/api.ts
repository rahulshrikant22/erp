/**
 * Minimal typed fetch wrapper for the ERP backend.
 *
 *   apiFetch<T>('/api/users')                 → success data of type T
 *   apiFetch<T>('/api/users', { method: 'POST', body: { ... } })
 *
 * Behaviour:
 *   - Reads access token from authStore and sets the Bearer header.
 *   - Sends/receives JSON; multipart bodies pass `body` as a FormData.
 *   - Throws ApiClientError on non-success envelopes; the error preserves
 *     the server's error code + details for UIs that want to render them.
 *   - On 401 anywhere except /api/auth/login + /forgot-password, clears
 *     the local session — the caller's surrounding code (e.g. AuthProvider)
 *     listens for that and routes back to /login.
 */
import { authStore } from './auth-store';
import type { ApiResponse } from './types';

export const API_BASE_URL =
  typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_BASE_URL
    ? process.env.NEXT_PUBLIC_API_BASE_URL
    : typeof window !== 'undefined'
      ? ''
      : 'http://localhost:4000';

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  formData?: FormData;
  /** Skip Authorization header for endpoints that should run unauthenticated. */
  anonymous?: boolean;
  /** Skip the 401 → clear-session side-effect. Used by the login route. */
  skipAutoLogout?: boolean;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  constructor(args: { status: number; code: string; message: string; details?: unknown }) {
    super(args.message);
    this.name = 'ApiClientError';
    this.status = args.status;
    this.code = args.code;
    this.details = args.details;
  }
}

const AUTOLOGOUT_SKIP_PATHS = ['/api/auth/login', '/api/auth/forgot-password', '/api/auth/refresh'];

export async function apiFetch<T = unknown>(
  path: string,
  opts: ApiFetchOptions = {},
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  const headers: Record<string, string> = {};
  if (!opts.anonymous) {
    const token = authStore.getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, {
    method: opts.method ?? (opts.body || opts.formData ? 'POST' : 'GET'),
    headers,
    body,
    credentials: 'omit',
    cache: 'no-store',
  });

  let parsed: ApiResponse<T> | null = null;
  const text = await res.text();
  if (text) {
    try {
      parsed = JSON.parse(text) as ApiResponse<T>;
    } catch {
      // fall through; we'll treat as a non-envelope error below.
    }
  }

  if (parsed && parsed.success === true) {
    return parsed.data;
  }

  if (parsed && parsed.success === false) {
    if (
      res.status === 401 &&
      !opts.skipAutoLogout &&
      !AUTOLOGOUT_SKIP_PATHS.some((p) => path.startsWith(p))
    ) {
      authStore.clear();
    }
    throw new ApiClientError({
      status: res.status,
      code: parsed.error.code,
      message: parsed.error.message,
      details: parsed.error.details,
    });
  }

  // Non-envelope failure (e.g. backend unreachable, 502).
  throw new ApiClientError({
    status: res.status,
    code: 'NETWORK_OR_PARSE_ERROR',
    message: text || `Request failed with status ${res.status}`,
  });
}
