/**
 * session ของผู้ใช้ (JWT)
 *
 * เก็บ token ใน `localStorage` เพื่อให้รีเฟรชหน้าแล้วยังอยู่ในระบบ — ยอมรับความเสี่ยง XSS
 * โดยแลกกับความเรียบง่าย (ดู DECISIONS.md) · api ตรวจบัญชีจาก DB ทุก request อยู่แล้ว
 * ดังนั้นการปิดบัญชีมีผลทันทีแม้ token ยังไม่หมดอายุ
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, configureApi } from './api';
import { AuthContext, type AuthContextValue } from './auth-context';
import type { AuthUser } from './types';

const TOKEN_KEY = 'cert-tracker.token';
const USER_KEY = 'cert-tracker.user';

function readStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(() =>
    localStorage.getItem(TOKEN_KEY) === null ? null : readStoredUser(),
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  // ผูกตัวอ่าน token เข้ากับ apiFetch ครั้งเดียว — โค้ดส่วนอื่นไม่ต้องรู้จัก localStorage
  useEffect(() => {
    configureApi({
      getToken: () => localStorage.getItem(TOKEN_KEY),
      onUnauthorized: logout,
    });
  }, [logout]);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const result = await api.login(email, password);
    localStorage.setItem(TOKEN_KEY, result.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    setUser(result.user);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, login, logout }),
    [user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
