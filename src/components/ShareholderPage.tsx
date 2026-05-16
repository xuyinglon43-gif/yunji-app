'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { rpcUpsertShareholderTx } from '@/lib/rpc';

interface ShareholderTx {
  id: number;
  date: string;
  shareholder: string;
  type: string;
  amount: number;
  attribution: string;
  note: string;
  created_at: string;
  created_by: string;
}

const SHAREHOLDERS = ['颖龙', '张泽', '共同'];
const TX_TYPES = ['垫付', '往来款（旧账）', '增资', '减资', '分配', '其他'];

const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = (): Omit<ShareholderTx, 'id' | 'created_at' | 'created_by'> => ({
  date: today(),
  shareholder: '颖龙',
  type: '垫付',
  amount: 0,
  attribution: '',
  note: '',
});

export default function ShareholderPage() {
  const { roleLabel, password, can } = useAuth();
  const [txs, setTxs] = useState<ShareholderTx[]>([]);
  const [editing, setEditing] = useState<ShareholderTx | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const readOnly = !can('edit_shareholder');

  const load = async () => {
    const { data } = await supabase
      .from('shareholder_transactions')
      .select('*')
      .is('deleted_at', null)
      .order('date', { ascending: false });
    setTxs((data || []) as ShareholderTx[]);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (t: ShareholderTx) => {
    setEditing(t);
    setForm({
      date: t.date,
      shareholder: t.shareholder,
      type: t.type,
      amount: t.amount,
      attribution: t.attribution || '',
      note: t.note || '',
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.date || !form.shareholder || !form.type) {
      alert('日期/股东/类型必填');
      return;
    }
    setSaving(true);
    const r = await rpcUpsertShareholderTx(
      editing?.id ?? null,
      form.date,
      form.shareholder,
      form.type,
      form.amount,
      form.attribution,
      form.note,
      password,
      roleLabel
    );
    setSaving(false);
    if (!r.ok) { alert('保存失败：' + r.error); return; }
    setShowForm(false);
    load();
  };

  const totalsByShareholder = txs.reduce<Record<string, number>>((acc, t) => {
    acc[t.shareholder] = (acc[t.shareholder] || 0) + Number(t.amount);
    return acc;
  }, {});

  const fmtMoney = (n: number) => `¥${Math.abs(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">股东事项</h1>
          <p className="text-[10px] text-[var(--ink3)] mt-0.5">股东垫付、往来款、增减资记录（与公司经营 P&L 隔离）</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--ink3)] px-2 py-0.5 rounded-full bg-[var(--bg)] border border-[var(--border)]">
            {readOnly ? '总经理只读' : '老板可编辑'}
          </span>
          {!readOnly && (
            <button onClick={openNew} className="px-3 py-1.5 text-xs bg-[var(--green)] text-white rounded-md hover:opacity-90">
              + 录入
            </button>
          )}
        </div>
      </div>

      {/* 汇总卡片 */}
      <div className="grid grid-cols-3 gap-3">
        {SHAREHOLDERS.map((sh) => (
          <div key={sh} className="bg-white rounded-lg p-3 border border-[var(--border)]">
            <div className="text-xs text-[var(--ink3)]">{sh} · 累计</div>
            <div className={`text-xl font-bold mt-1 ${(totalsByShareholder[sh] || 0) >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
              {(totalsByShareholder[sh] || 0) >= 0 ? '+' : '-'}{fmtMoney(totalsByShareholder[sh] || 0)}
            </div>
          </div>
        ))}
      </div>

      {/* 列表 */}
      <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
        <div className="px-3 py-2 bg-[var(--bg)] text-xs font-semibold text-[var(--ink2)]">
          明细（共 {txs.length} 条）
        </div>
        {txs.length === 0 && (
          <div className="px-3 py-8 text-center text-[var(--ink3)] text-xs">暂无记录</div>
        )}
        {txs.map((t) => (
          <div key={t.id} className="flex items-start justify-between px-3 py-2 border-t border-[var(--border2)]">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--purple-bg)] text-[var(--purple)]">{t.shareholder}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg)] text-[var(--ink2)] border border-[var(--border)]">{t.type}</span>
                <span className="text-sm font-medium">{fmtMoney(t.amount)}</span>
                <span className="text-[10px] text-[var(--ink3)]">{t.date}</span>
              </div>
              {t.attribution && <p className="text-xs text-[var(--ink2)] mt-1">{t.attribution}</p>}
              {t.note && <p className="text-[10px] text-[var(--ink3)] mt-0.5">{t.note}</p>}
            </div>
            {!readOnly && (
              <button onClick={() => openEdit(t)} className="text-[11px] text-[var(--blue)] hover:underline ml-2">
                编辑
              </button>
            )}
          </div>
        ))}
      </div>

      {/* 录入表单 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-xl w-full md:max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <h2 className="font-bold text-base">{editing ? '编辑' : '新增'}股东事项</h2>
              <button onClick={() => setShowForm(false)} className="text-[var(--ink3)] text-lg">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <Field label="日期">
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded text-sm" />
              </Field>
              <Field label="股东">
                <select value={form.shareholder} onChange={(e) => setForm({ ...form, shareholder: e.target.value })}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded text-sm">
                  {SHAREHOLDERS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="类型">
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded text-sm">
                  {TX_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="金额（元，可正可负）">
                <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded text-sm" />
              </Field>
              <Field label="归属事项">
                <input value={form.attribution} onChange={(e) => setForm({ ...form, attribution: e.target.value })}
                  placeholder="如：2-3月工资旧账"
                  className="w-full px-3 py-2 border border-[var(--border)] rounded text-sm" />
              </Field>
              <Field label="备注">
                <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded text-sm" />
              </Field>
            </div>
            <div className="flex gap-2 px-4 py-3 border-t border-[var(--border)]">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2 text-sm border border-[var(--border)] rounded">
                取消
              </button>
              <button onClick={save} disabled={saving}
                className="flex-1 py-2 text-sm bg-[var(--green)] text-white rounded hover:opacity-90 disabled:opacity-50">
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-[var(--ink3)] mb-1">{label}</label>
      {children}
    </div>
  );
}
