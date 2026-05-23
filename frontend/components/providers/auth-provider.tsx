'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiClientError } from '@/lib/api';
import { authStore } from '@/lib/auth-store';
import type { AuthUser, LoginPayload } from '@/lib/types';

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = React.createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const router = useRouter();
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Hydrate from localStorage on first render and listen for cross-tab logout.
  React.useEffect(() => {
    setUser(authStore.getUser());
    setLoading(false);
    const onStorage = (e: StorageEvent): void => {
      if (e.key && e.key.startsWith('erp.')) {
        setUser(authStore.getUser());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const login = React.useCallback(async (email: string, password: string): Promise<AuthUser> => {
    const r = await apiFetch<LoginPayload>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
      anonymous: true,
      skipAutoLogout: true,
    });
    authStore.setSession({
      accessToken: r.accessToken,
      refreshToken: r.refreshToken,
      user: r.user,
    });
    setUser(r.user);
    return r.user;
  }, []);

  const logout = React.useCallback(async (): Promise<void> => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      // If logout fails server-side we still want the client cleared.
      void err;
    }
    authStore.clear();
    setUser(null);
    router.push('/login');
  }, [router]);

  const refresh = React.useCallback(async (): Promise<void> => {
    try {
      const r = await apiFetch<{ user: AuthUser }>('/api/auth/me');
      authStore.setSession({
        accessToken: authStore.getAccessToken() ?? '',
        refreshToken: authStore.getRefreshToken() ?? '',
        user: r.user,
      });
      setUser(r.user);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        authStore.clear();
        setUser(null);
      }
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
