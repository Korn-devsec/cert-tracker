/**
 * context ของ session — แยกจาก `auth.tsx` เพื่อให้ไฟล์นั้น export เฉพาะ component
 * (กฎ react-refresh: ไฟล์ที่ export ทั้ง component และฟังก์ชันจะทำให้ hot reload ไม่ทำงาน)
 */
import { createContext, useContext } from 'react';
import type { AuthUser } from './types';

export interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth ต้องใช้ภายใน <AuthProvider>');
  }
  return context;
}
