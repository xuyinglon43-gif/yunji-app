'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Bill, Expense, Member, AuditLog, Order } from '@/lib/types';
import { restoreRecord } from '@/lib/audit';
import { useAuth } from '@/lib/auth';
import { APP_VERSION, CHANGELOG } from '@/lib/changelog';
import { normalizeRow, normalizeRows } from '@/lib/money';

type Panel = 'dashboard' | 'audit' | 'deleted' | 'changelog';

// Deleted record with table info
interface DeletedRecord {
  table: string;
  id: number;
  label: string;
  deleted_at: string;
  deleted_by: string;
}

export default function DashboardPage() {
  const { roleLabel } = useAuth();
  const [bills, setBills] = useState<(Bill & { order_type?: string })[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [panel, setPanel] = useState<Panel>('dashboard');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [deletedRecords, setDeletedRecords] = useState<DeletedRecord[]>([]);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const daysPassed = new Date().getDate();

  useEffect(() => {
    (async () => {
      const { data: b } = await supabase
        .from('bills')
        .select('*, orders(type, biz_name)')
        .eq('confirmed', true)
        .is('deleted_at', null)
        .gte('date', thisMonth + '-01');
      setBills(
        (b || []).map((bill: Record<string, unknown>) => {
          const ord = bill.orders as Record<string, string> | null;
          const nb = normalizeRow(bill, 'bills') as Record<string, unknown>;
          return { ...nb, order_type: ord?.type || '', biz_name: nb.biz_name || ord?.biz_name || '' };
        }) as (Bill & { order_type?: string })[]
      );

      const { data: e } = await supabase
        .from('expenses').select('*')
        .eq('status', '已审批').is('deleted_at', null)
        .gte('date', thisMonth + '-01');
      setExpenses(normalizeRows(e, 'expenses') as Expense[]);

      const { data: m } = await supabase.from('members').select('*').is('deleted_at', null);
      setMembers(normalizeRows(m, 'members') as Member[]);

      const { count } = await supabase
        .from('orders').select('*', { count: 'exact', head: true })
        .gte('date', thisMonth + '-01').neq('status', '已取消').is('deleted_at', null);
      setTotalOrders(count || 0);
    })();
  }, [thisMonth]);

  // Load audit logs
  const loadAuditLogs = async () => {
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    setAuditLogs(data || []);
  };

  // Load all soft-deleted records
  const loadDeletedRecords = async () => {
    const records: DeletedRecord[] = [];
    const { data: orders } = await supabase.from('orders').select('id, client, date, deleted_at, deleted_by').not('deleted_at', 'is', null);
    for (const o of (orders || []) as Order[]) {
      records.push({ table: 'orders', id: o.id, label: `订单 #${o.id} ${o.client} ${o.date}`, deleted_at: o.deleted_at!, deleted_by: o.deleted_by || '' });
    }
    const { data: mems } = await supabase.from('members').select('id, name, level, deleted_at, deleted_by').not('deleted_at', 'is', null);
    for (const m of (mems || []) as Member[]) {
      records.push({ table: 'members', id: m.id, label: `会员 ${m.name} (${m.level})`, deleted_at: m.deleted_at!, deleted_by: m.deleted_by || '' });
    }
    const { data: exps } = await supabase.from('expenses').select('id, category, date, amount, deleted_at, deleted_by').not('deleted_at', 'is', null);
    for (const ex of (exps || []) as Expense[]) {
      records.push({ table: 'expenses', id: ex.id, label: `支出 ${ex.category} ¥${ex.amount} ${ex.date}`, deleted_at: ex.deleted_at!, deleted_by: ex.deleted_by || '' });
    }
    const { data: bls } = await supabase.from('bills').select('id, order_id, paid, date, deleted_at, deleted_by').not('deleted_at', 'is', null);
    for (const bl of (bls || []) as Bill[]) {
      records.push({ table: 'bills', id: bl.id, label: `账单 #${bl.id} ¥${bl.paid} ${bl.date}`, deleted_at: bl.deleted_at!, deleted_by: bl.deleted_by || '' });
    }
    records.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
    setDeletedRecords(records);
  };

  const handleRestore = async (r: DeletedRecord) => {
    if (!confirm(`确定恢复「${r.label}」？`)) return;
    await restoreRecord(r.table, r.id, roleLabel, `恢复 ${r.label}`);
    loadDeletedRecords();
  };

  const switchPanel = (p: Panel) => {
    setPanel(p);
    if (p === 'audit') loadAuditLogs();
    if (p === 'deleted') loadDeletedRecords();
  };

  // --- Derived metrics ---
  const totalIncome = useMemo(() => bills.reduce((s, b) => s + b.paid, 0), [bills]);
  const totalFoodCost = useMemo(() => bills.reduce((s, b) => s + (b.food_cost || 0), 0), [bills]);
  const totalExpense = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
  const netProfit = totalIncome - totalExpense;
  const foodCostRate = totalIncome > 0 ? Math.round((totalFoodCost / totalIncome) * 100) : 0;
  const avgTablesPerDay = daysPassed > 0 ? (totalOrders / daysPassed).toFixed(1) : '0';

  const revenueByType = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of bills) { map[b.order_type || '其他'] = (map[b.order_type || '其他'] || 0) + b.paid; }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [bills]);

  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of expenses) { map[e.category] = (map[e.category] || 0) + e.amount; }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const bizRanking = useMemo(() => {
    const map = new Map<string, { revenue: number; commission: number }>();
    for (const b of bills) {
      if (!b.biz_name) continue;
      const s = map.get(b.biz_name) || { revenue: 0, commission: 0 };
      s.revenue += b.paid; s.commission += b.biz_commission;
      map.set(b.biz_name, s);
    }
    return Array.from(map.entries()).map(([name, stat]) => ({ name, ...stat })).sort((a, b) => b.revenue - a.revenue);
  }, [bills]);

  const memberProgress = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of members) {
      if (['逢吉', '承吉', '享吉', '开吉'].includes(m.level)) counts[m.level] = (counts[m.level] || 0) + 1;
    }
    return counts;
  }, [members]);

  const fmtMoney = (n: number) => Math.abs(n) >= 10000 ? (n / 10000).toFixed(1) + '万' : n.toLocaleString();

  const Bar = ({ value, max, color }: { value: number; max: number; color: string }) => (
    <div className="w-full bg-[var(--bg2)] rounded-full h-2.5 mt-1">
      <div className="h-2.5 rounded-full transition-all" style={{ width: `${max > 0 ? Math.min((value / max) * 100, 100) : 0}%`, backgroundColor: color }} />
    </div>
  );

  const fmtTime = (ts: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3 space-y-4">
      {/* Panel switcher */}
      <div className="flex gap-2">
        {[
          { id: 'dashboard' as Panel, label: '数据总览' },
          { id: 'audit' as Panel, label: '操作日志' },
          { id: 'deleted' as Panel, label: '已删除数据' },
          { id: 'changelog' as Panel, label: `更新日志 ${APP_VERSION}` },
        ].map((tab) => (
          <button key={tab.id} onClick={() => switchPanel(tab.id)}
            className={`px-3 py-1.5 text-xs rounded-md border transition
              ${panel === tab.id
                ? 'bg-[var(--green)] text-white border-[var(--green)]'
                : 'bg-white text-[var(--ink2)] border-[var(--border)] hover:bg-[var(--bg)]'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ========== AUDIT LOG PANEL ========== */}
      {panel === 'audit' && (
        <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
          <div className="px-3 py-2 bg-[var(--bg)] text-xs font-semibold text-[var(--ink2)] flex justify-between items-center">
            <span>操作日志（最近100条）</span>
            <button onClick={loadAuditLogs} className="text-[10px] text-[var(--blue)] hover:underline">刷新</button>
          </div>
          {auditLogs.length === 0 && (
            <div className="px-3 py-8 text-center text-[var(--ink3)] text-xs">暂无操作记录</div>
          )}
          {auditLogs.map((log) => (
            <div key={log.id} className="flex items-start gap-3 px-3 py-2 border-t border-[var(--border2)]">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap mt-0.5
                ${log.action === '硬删除' ? 'bg-[var(--red-bg)] text-[var(--red)]'
                : log.action === '软删除' ? 'bg-[var(--amber-bg)] text-[var(--amber)]'
                : log.action === '恢复' ? 'bg-[var(--green-bg)] text-[var(--green)]'
                : 'bg-[var(--blue-bg)] text-[var(--blue)]'}`}>
                {log.action}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{log.detail}</p>
                <p className="text-[10px] text-[var(--ink3)]">
                  {log.operator} · {fmtTime(log.created_at)} · {log.table_name}#{log.record_id}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ========== DELETED DATA PANEL ========== */}
      {panel === 'deleted' && (
        <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
          <div className="px-3 py-2 bg-[var(--red-bg)] text-xs font-semibold text-[var(--red)] flex justify-between items-center">
            <span>已删除数据（软删除，可恢复）</span>
            <button onClick={loadDeletedRecords} className="text-[10px] text-[var(--red)] hover:underline">刷新</button>
          </div>
          {deletedRecords.length === 0 && (
            <div className="px-3 py-8 text-center text-[var(--ink3)] text-xs">没有被删除的数据</div>
          )}
          {deletedRecords.map((r) => (
            <div key={`${r.table}-${r.id}`} className="flex items-center justify-between px-3 py-2 border-t border-[var(--border2)]">
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">{r.label}</p>
                <p className="text-[10px] text-[var(--ink3)]">
                  删除人: {r.deleted_by} · {fmtTime(r.deleted_at)}
                </p>
              </div>
              <button onClick={() => handleRestore(r)}
                className="px-3 py-1 text-[10px] bg-[var(--green)] text-white rounded hover:opacity-90 whitespace-nowrap ml-2">
                恢复
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ========== DASHBOARD PANEL ========== */}
      {panel === 'dashboard' && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-lg p-4 border border-[var(--border)]">
              <div className="text-xs text-[var(--ink3)]">本月收入(已入账)</div>
              <div className="text-xl font-bold text-[var(--green)] mt-1">¥{fmtMoney(totalIncome)}</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-[var(--border)]">
              <div className="text-xs text-[var(--ink3)]">食材成本率</div>
              <div className={`text-xl font-bold mt-1 ${foodCostRate <= 35 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                {foodCostRate}%
              </div>
              <div className="text-[10px] text-[var(--ink3)]">目标 ≤ 35%</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-[var(--border)]">
              <div className="text-xs text-[var(--ink3)]">日均桌数</div>
              <div className={`text-xl font-bold mt-1 ${parseFloat(avgTablesPerDay) >= 4 ? 'text-[var(--green)]' : 'text-[var(--amber)]'}`}>
                {avgTablesPerDay}
              </div>
              <div className="text-[10px] text-[var(--ink3)]">保本需4桌 · 前{daysPassed}天均值</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-[var(--border)]">
              <div className="text-xs text-[var(--ink3)]">本月净利润</div>
              <div className={`text-xl font-bold mt-1 ${netProfit >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                ¥{fmtMoney(netProfit)}
              </div>
              <div className="text-[10px] text-[var(--ink3)]">收入 - 已审批支出</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-lg p-4 border border-[var(--border)]">
              <h3 className="text-xs font-semibold text-[var(--ink2)] mb-3">收入构成</h3>
              {revenueByType.length === 0 && <div className="text-xs text-[var(--ink3)]">暂无数据</div>}
              {revenueByType.map(([type, amount]) => (
                <div key={type} className="mb-2">
                  <div className="flex justify-between text-sm"><span>{type}</span><span className="font-medium">¥{fmtMoney(amount)}</span></div>
                  <Bar value={amount} max={totalIncome} color="var(--green)" />
                </div>
              ))}
            </div>

            <div className="bg-white rounded-lg p-4 border border-[var(--border)]">
              <h3 className="text-xs font-semibold text-[var(--ink2)] mb-3">成本控制</h3>
              {expenseByCategory.length === 0 && <div className="text-xs text-[var(--ink3)]">暂无数据</div>}
              {expenseByCategory.map(([cat, amount]) => (
                <div key={cat} className="mb-2">
                  <div className="flex justify-between text-sm"><span>{cat}</span><span className="font-medium">¥{fmtMoney(amount)}</span></div>
                  <Bar value={amount} max={totalExpense} color={cat === '食材采购' ? 'var(--amber)' : 'var(--ink3)'} />
                </div>
              ))}
            </div>

            <div className="bg-white rounded-lg p-4 border border-[var(--border)]">
              <h3 className="text-xs font-semibold text-[var(--ink2)] mb-3">商务贡献排行</h3>
              {bizRanking.length === 0 && <div className="text-xs text-[var(--ink3)]">暂无数据</div>}
              {bizRanking.map((b, idx) => (
                <div key={b.name} className="flex items-center justify-between py-1.5 border-b border-[var(--border2)] last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${idx === 0 ? 'text-yellow-600' : 'text-[var(--ink3)]'}`}>{idx + 1}</span>
                    <span className="text-sm">{b.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">¥{fmtMoney(b.revenue)}</div>
                    <div className="text-[10px] text-[var(--amber)]">提成 ¥{fmtMoney(b.commission)}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-lg p-4 border border-[var(--border)]">
              <h3 className="text-xs font-semibold text-[var(--ink2)] mb-3">会员签约进度</h3>
              <div className="text-[10px] text-[var(--ink3)] mb-3">目标：逢吉(储值10万起) + 5承吉 + 2享吉 = ¥45万+</div>
              {[
                { level: '逢吉', target: 3, fee: '储值10万起' },
                { level: '承吉', target: 5, fee: '5万/年' },
                { level: '享吉', target: 2, fee: '10万/年' },
                { level: '开吉', target: 0, fee: '30万/年' },
              ].map(({ level, target, fee }) => {
                const count = memberProgress[level] || 0;
                return (
                  <div key={level} className="mb-3">
                    <div className="flex justify-between text-sm">
                      <span>{level} <span className="text-[10px] text-[var(--ink3)]">({fee})</span></span>
                      <span className="font-medium">{count}{target > 0 ? ` / ${target}` : ''}</span>
                    </div>
                    {target > 0 && <Bar value={count} max={target} color="var(--purple)" />}
                  </div>
                );
              })}
              <div className="mt-2 pt-2 border-t border-[var(--border2)]">
                <div className="flex justify-between text-sm">
                  <span>总会员数</span>
                  <span className="font-medium">{members.length}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {panel === 'changelog' && (
        <div className="space-y-4">
          {CHANGELOG.map((entry) => (
            <div key={entry.version} className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
              <div className="px-4 py-3 bg-[var(--bg)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">{entry.version}</span>
                  {entry.version === APP_VERSION && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--green-bg)] text-[var(--green)] border border-[var(--green-border)]">当前版本</span>
                  )}
                </div>
                <span className="text-xs text-[var(--ink3)]">{entry.date}</span>
              </div>
              <div className="px-4 py-3 space-y-1.5">
                {entry.changes.map((change, i) => (
                  <div key={i} className="flex gap-2 text-sm">
                    <span className="text-[var(--green)] flex-shrink-0">·</span>
                    <span className="text-[var(--ink2)]">{change}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
