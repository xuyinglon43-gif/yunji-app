'use client';

import { PASSWORDS, ROLE_LABELS, ROLE_PERMS, ROLE_PAGES, Role, PermAction } from '@/lib/constants';

// 把密码 mask 成只显示首尾各 1-2 位
function maskPassword(pw: string): string {
  if (pw.length <= 4) return pw[0] + '***';
  return pw.slice(0, 2) + '***' + pw.slice(-2);
}

const PERM_LABELS: Record<PermAction, string> = {
  create: '新增记录',
  edit_open: '修改未确认记录',
  edit_nondefining: '修改非定性字段',
  cancel_booking: '取消预定',
  undo_self_recent: '30分钟内撤回自建',
  export: '导出 PDF/Excel',
  delete_soft: '软删除',
  delete_hard: '硬删除',
  undo_confirmed: '撤销已确认状态',
  edit_confirmed_money: '改已确认账单金额',
  restore: '恢复软删除',
  settle_commission: '结算商务佣金',
  view_full_phone: '查看完整手机号',
  manage_roles: '账号/密码管理',
  edit_shareholder: '股东事项写入',
  view_audit: '查看审计日志',
};

const PAGE_LABELS: Record<string, string> = {
  home: '首页',
  schedule: '档期',
  orders: '订单',
  finance: '财务',
  members: '会员',
  business: '商务',
  dashboard: '总览',
  analytics: '经营分析',
  audit: '审计日志',
  shareholder: '股东事项',
  settings: '系统设置',
};

export default function SettingsPage() {
  // 反向构建：role -> [passwords]
  const passwordsByRole = Object.entries(PASSWORDS).reduce<Record<string, string[]>>((acc, [pw, role]) => {
    if (!acc[role]) acc[role] = [];
    acc[role].push(pw);
    return acc;
  }, {});

  const roles: Role[] = ['approve', 'manager', 'finance', 'service', 'view'];

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">系统设置</h1>
          <p className="text-[10px] text-[var(--ink3)] mt-0.5">账号、权限矩阵、页面可见性</p>
        </div>
        <span className="text-[10px] text-[var(--ink3)] px-2 py-0.5 rounded-full bg-[var(--bg)] border border-[var(--border)]">
          仅老板可见
        </span>
      </div>

      {/* 账号列表 */}
      <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
        <div className="px-3 py-2 bg-[var(--bg)] text-xs font-semibold text-[var(--ink2)]">
          系统账号（密码以掩码显示，修改密码需要编辑 src/lib/constants.ts 后重新部署）
        </div>
        {roles.map((role) => (
          <div key={role} className="px-3 py-3 border-t border-[var(--border2)]">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                  ${role === 'approve' ? 'bg-[var(--green-bg)] text-[var(--green)]'
                  : role === 'manager' ? 'bg-[var(--blue-bg)] text-[var(--blue)]'
                  : role === 'finance' ? 'bg-[var(--purple-bg)] text-[var(--purple)]'
                  : 'bg-[var(--amber-bg)] text-[var(--amber)]'
                  }`}>
                  {ROLE_LABELS[role]}
                </span>
                <span className="text-xs text-[var(--ink3)]">code: {role}</span>
              </div>
              <div className="flex gap-1 flex-wrap">
                {(passwordsByRole[role] || []).map((pw) => (
                  <code key={pw} className="text-[10px] px-2 py-0.5 bg-[var(--bg)] rounded">{maskPassword(pw)}</code>
                ))}
                {!passwordsByRole[role] && <span className="text-[10px] text-[var(--ink3)]">无密码</span>}
              </div>
            </div>
            <div className="mt-2 text-[11px] text-[var(--ink2)]">
              <span className="text-[var(--ink3)]">可见页面：</span>
              {ROLE_PAGES[role].map((p) => PAGE_LABELS[p] || p).join(' · ')}
            </div>
          </div>
        ))}
      </div>

      {/* 权限矩阵 */}
      <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
        <div className="px-3 py-2 bg-[var(--bg)] text-xs font-semibold text-[var(--ink2)]">
          权限矩阵
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg)]">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-[var(--ink2)]">权限动作</th>
                {roles.map((r) => <th key={r} className="px-2 py-2 text-center font-medium">{ROLE_LABELS[r]}</th>)}
              </tr>
            </thead>
            <tbody>
              {(Object.keys(PERM_LABELS) as PermAction[]).map((action) => (
                <tr key={action} className="border-t border-[var(--border2)]">
                  <td className="px-3 py-2 text-[var(--ink2)]">
                    {PERM_LABELS[action]}
                    <span className="text-[10px] text-[var(--ink3)] ml-1">({action})</span>
                  </td>
                  {roles.map((r) => (
                    <td key={r} className="px-2 py-2 text-center">
                      {ROLE_PERMS[r].includes(action)
                        ? <span className="text-[var(--green)] font-bold">✓</span>
                        : <span className="text-[var(--ink3)]">·</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 改密码说明 */}
      <div className="bg-[var(--amber-bg)] border border-[var(--amber-border)] rounded-lg p-3 text-xs text-[var(--ink2)]">
        <p className="font-medium text-[var(--amber)] mb-1">⚠️ 修改账号/密码须知</p>
        <p>当前账号和权限矩阵硬编码在 <code className="text-[11px] bg-white px-1 rounded">src/lib/constants.ts</code>，修改后需重新部署生效。</p>
        <p className="mt-1">如果是给老板密码加新值，还需要同步更新 <code className="text-[11px] bg-white px-1 rounded">supabase/migrate_v3_role_rpc.sql</code> 中的 <code className="text-[11px] bg-white px-1 rounded">_is_boss_password</code> 函数，否则后端 RPC 拒绝。</p>
      </div>
    </div>
  );
}
