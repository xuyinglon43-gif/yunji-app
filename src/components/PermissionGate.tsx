'use client';

import { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import type { PermAction } from '@/lib/constants';

interface PermissionGateProps {
  /** 需要的权限动作（任一满足即可，多个用数组） */
  need: PermAction | PermAction[];
  /** 通过时渲染什么 */
  children: ReactNode;
  /**
   * 未通过时的兜底：
   * - 'hide'（默认）：完全不渲染
   * - 'disable'：渲染 children，但包一层禁用样式
   * - ReactNode：显示自定义兜底（如提示文字）
   */
  fallback?: 'hide' | 'disable' | ReactNode;
}

/**
 * 按权限动作控制 UI 元素的渲染。
 * 例：
 *   <PermissionGate need="delete_hard"><DeleteBtn/></PermissionGate>
 *   <PermissionGate need={['edit_confirmed_money','restore']}><Btn/></PermissionGate>
 */
export default function PermissionGate({
  need,
  children,
  fallback = 'hide',
}: PermissionGateProps) {
  const { can } = useAuth();
  const needs = Array.isArray(need) ? need : [need];
  const ok = needs.some((n) => can(n));

  if (ok) return <>{children}</>;

  if (fallback === 'hide') return null;
  if (fallback === 'disable') {
    return (
      <span className="opacity-40 cursor-not-allowed pointer-events-none" title="无权限">
        {children}
      </span>
    );
  }
  return <>{fallback}</>;
}
