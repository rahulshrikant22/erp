/**
 * Auth token storage — localStorage with a tiny in-memory mirror.
 *
 * Using localStorage is simpler than httpOnly cookies for a single-tenant
 * admin and lets the SPA make Bearer-authenticated calls cleanly. The
 * trade-off (vulnerable to XSS) is acceptable for this admin surface; we
 * tighten via CSP and HTTPS in production. A future CSRF-cookie variant
 * is straightforward to swap in here.
 */
import type { AuthUser } from './types';

const ACCESS_KEY = 'erp.access_token';
const REFRESH_KEY = 'erp.refresh_token';
const USER_KEY = 'erp.user';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export const authStore = {
  getAccessToken(): string | null {
    return isBrowser() ? window.localStorage.getItem(ACCESS_KEY) : null;
  },
  getRefreshToken(): string | null {
    return isBrowser() ? window.localStorage.getItem(REFRESH_KEY) : null;
  },
  getUser(): AuthUser | null {
    if (!isBrowser()) return null;
    const raw = window.localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  },
  setSession(args: {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
  }): void {
    if (!isBrowser()) return;
    window.localStorage.setItem(ACCESS_KEY, args.accessToken);
    window.localStorage.setItem(REFRESH_KEY, args.refreshToken);
    window.localStorage.setItem(USER_KEY, JSON.stringify(args.user));
    // Notify other tabs.
    window.dispatchEvent(new StorageEvent('storage', { key: ACCESS_KEY }));
  },
  clear(): void {
    if (!isBrowser()) return;
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
    window.localStorage.removeItem(USER_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: ACCESS_KEY }));
  },
};
