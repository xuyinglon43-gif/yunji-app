'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Role, PASSWORDS, ROLE_LABELS, HARD_DELETE_PASSWORDS, ROLE_PAGES } from './constants';

interface AuthContextType {
  role: Role | null;
  roleLabel: string;
  password: string;
  login: (password: string) => boolean;
  logout: () => void;
  can: (action: 'edit' | 'approve' | 'finance_page' | 'settle_commission' | 'view_full_phone' | 'hard_delete') => boolean;
  canSeePage: (pageId: string) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);
  const [password, setPassword] = useState('');

  const login = useCallback((pw: string) => {
    const r = PASSWORDS[pw];
    if (r) {
      setRole(r);
      setPassword(pw);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setRole(null);
    setPassword('');
  }, []);

  const can = useCallback(
    (action: 'edit' | 'approve' | 'finance_page' | 'settle_commission' | 'view_full_phone' | 'hard_delete') => {
      if (!role) return false;
      switch (action) {
        case 'edit':
          // approve, finance, service can edit; view cannot
          return role !== 'view';
        case 'approve':
          return role === 'approve';
        case 'finance_page':
          // Only approve and finance can see finance tab
          return role === 'approve' || role === 'finance';
        case 'settle_commission':
          // Only approve and finance can settle commissions
          return role === 'approve' || role === 'finance';
        case 'view_full_phone':
          return role === 'approve';
        case 'hard_delete':
          return HARD_DELETE_PASSWORDS.has(password);
        default:
          return false;
      }
    },
    [role, password]
  );

  const canSeePage = useCallback(
    (pageId: string) => {
      if (!role) return false;
      return ROLE_PAGES[role].includes(pageId);
    },
    [role]
  );

  return (
    <AuthContext.Provider
      value={{ role, roleLabel: role ? ROLE_LABELS[role] : '', password, login, logout, can, canSeePage }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
