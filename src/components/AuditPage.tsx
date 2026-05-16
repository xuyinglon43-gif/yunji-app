'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { AuditLog, Order, Member, Bill, Expense } from '@/lib/types';
import { restoreRecord } from '@/lib/audit';
import { useAuth } from '@/lib/auth';

type Panel = 'logs' | 'deleted';

interface DeletedRecord {
  table: string;
  id: number;
  label: string;
  deleted_at: string;
  deleted_by: string;
}

export default function AuditPage() {
  const { roleLabel, can } = useAuth();
  const [panel, setPanel] = useState<Panel>('logs');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [deleted, setDeleted] = useState<DeletedRecord[]>([]);
  const [filterOp, setFilterOp] = useState('');
  const [filterTable, setFilterTable] = useState('全部');

  useEffect(() => {
    if (panel === 'logs') loadLogs();
    if (panel === 'deleted') loadDeleted();
  }, [panel]);

  const loadLogs = async () => {
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setLogs(data || []);
  };

  const loadDeleted = async () => {
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
    setDeleted(records);
  };

  const handleRestore = async (r: DeletedRecord) => {
    if (!can('restore')) { alert('无权限'); return; }
    if (!confirm(`确定恢复「${r.label}」？`)) return;
    await restoreRecord(r.table, r.id, roleLabel, `恢复 ${r.label}`);
    loadDeleted();
  };

  const fmtTime = (ts: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const TABLES = ['全部', 'orders', 'bills', 'expenses', 'members', 'business_contacts', 'biz_settlements', 'shareholder_transactions'];

  const filteredLogs = logs.filter((l) => {
    if (filterOp && !l.operator?.includes(filterOp)) return false;
    if (filterTable !== '全部' && l.table_name !== filterTable) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">审计与日志</h1>
        <span className="text-[10px] text-[var(--ink3)] px-2 py-0.5 rounded-full bg-[var(--bg)] border border-[var(--border)]">
          仅老板可见
        </span>
      </div>

      {/* Panel switcher */}
      <div className="flex gap-2">
        {[
          { id: 'logs' as Panel, label: '操作日志' },
          { id: 'deleted' as Panel, label: '已删除数据' },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setPanel(tab.id)}
            className={`px-3 py-1.5 text-xs rounded-md border transition
              ${panel === tab.id
                ? 'bg-[var(--green)] text-white border-[var(--green)]'
                : 'bg-white text-[var(--ink2)] border-[var(--border)] hover:bg-[var(--bg)]'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Logs */}
      {panel === 'logs' && (
        <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
          <div className="px-3 py-2 bg-[var(--bg)] flex flex-wrap items-center gap-2">
            <input value={filterOp} onChange={(e) => setFilterOp(e.target.value)} placeholder="按操作人筛选"
              className="text-xs px-2 py-1 border border-[var(--border)] rounded w-32" />
            <select value={filterTable} onChange={(e) => setFilterTable(e.target.value)}
              className="text-xs px-2 py-1 border border-[var(--border)] rounded">
              {TABLES.map((t) => <option key={t}>{t}</option>)}
            </select>
            <span className="text-[10px] text-[var(--ink3)] ml-auto">最近 200 条，共显示 {filteredLogs.length}</span>
            <button onClick={loadLogs} className="text-[10px] text-[var(--blue)] hover:underline">刷新</button>
          </div>
          {filteredLogs.length === 0 && (
            <div className="px-3 py-8 text-center text-[var(--ink3)] text-xs">暂无记录</div>
          )}
          {filteredLogs.map((log) => (
            <div key={log.id} className="flex items-start gap-3 px-3 py-2 border-t border-[var(--border2)]">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap mt-0.5
                ${log.action?.includes('硬删除') ? 'bg-[var(--red-bg)] text-[var(--red)]'
                : log.action?.includes('软删除') ? 'bg-[var(--amber-bg)] text-[var(--amber)]'
                : log.action?.includes('恢复') ? 'bg-[var(--green-bg)] text-[var(--green)]'
                : 'bg-[var(--blue-bg)] text-[var(--blue)]'}`}>
                {log.action}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[var(--ink2)] truncate">
                  <span className="text-[var(--ink3)]">[{log.table_name}#{log.record_id}]</span> {log.detail}
                </p>
                <p className="text-[10px] text-[var(--ink3)] mt-0.5">
                  {log.operator} · {fmtTime(log.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Deleted */}
      {panel === 'deleted' && (
        <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
          <div className="px-3 py-2 bg-[var(--bg)] text-xs font-semibold text-[var(--ink2)] flex justify-between items-center">
            <span>已软删除记录（可恢复）</span>
            <button onClick={loadDeleted} className="text-[10px] text-[var(--red)] hover:underline">刷新</button>
          </div>
          {deleted.length === 0 && (
            <div className="px-3 py-8 text-center text-[var(--ink3)] text-xs">没有被删除的数据</div>
          )}
          {deleted.map((r) => (
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
    </div>
  );
}
