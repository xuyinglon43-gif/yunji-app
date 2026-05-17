'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import {
  Role,
  PASSWORDS,
  ROLE_LABELS,
  HARD_DELETE_PASSWORDS,
  ROLE_PAGES,
  ROLE_PERMS,
  PermAction,
} from './constants';

// 兼容旧调用：原来的 action 字符串映射到新的 PermAction
type LegacyAction =
  | 'edit'
  | 'approve'
  | 'finance_page'
  | 'settle_commission'
  | 'view_full_phone'
  | 'hard_delete';

const LEGACY_ACTION_MAP: Record<LegacyAction, PermAction | 'page_finance' | '_is_approve'> = {
  edit: 'edit_open',                  // 兼容：旧 "edit" 等价于 "可编辑（未确认状态）"
  approve: '_is_approve',             // 兼容：旧 "approve" 等价于"是不是老板"
  finance_page: 'page_finance',       // 兼容：旧"能不能看财务页"
  settle_commission: 'settle_commission',
  view_full_phone: 'view_full_phone',
  hard_delete: 'delete_hard',
};

interface AuthContextType {
  role: Role | null;
  roleLabel: string;
  password: string;
  login: (password: string) => boolean;
  logout: () => void;
  /** 新 API：按权限动作判定 */
  can: (action: PermAction | LegacyAction) => boolean;
  /** 页面可见性 */
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
    (action: PermAction | LegacyAction) => {
      if (!role) return false;

      // 兼容旧调用
      if (action in LEGACY_ACTION_MAP) {
        const mapped = LEGACY_ACTION_MAP[action as LegacyAction];
        if (mapped === '_is_approve') return role === 'approve';
        if (mapped === 'page_finance') return role === 'approve' || role === 'manager' || role === 'finance';
        if (mapped === 'delete_hard') {
          // 硬删除：必须是 approve 且密码在白名单
          return role === 'approve' && HARD_DELETE_PASSWORDS.has(password);
        }
        return ROLE_PERMS[role].includes(mapped as PermAction);
      }

      // 新 API
      return ROLE_PERMS[role].includes(action as PermAction);
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
