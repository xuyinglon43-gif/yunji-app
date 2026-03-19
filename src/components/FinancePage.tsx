'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Bill, Expense, EXPENSE_CATEGORIES, ExpenseItem } from '@/lib/types';

export default function FinancePage() {
  const { can, roleLabel } = useAuth();
  const [pendingBills, setPendingBills] = useState<(Bill & { order_client?: string })[]>([]);
  const [confirmedBills, setConfirmedBills] = useState<(Bill & { order_client?: string })[]>([]);
  const [pendingExpenses, setPendingExpenses] = useState<Expense[]>([]);
  const [approvedExpenses, setApprovedExpenses] = useState<Expense[]>([]);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expForm, setExpForm] = useState({
    date: new Date().toISOString().split('T')[0],
    category: '食材采购',
    amount: '',
    supplier: '',
    note: '',
  });
  const [expItems, setExpItems] = useState<ExpenseItem[]>([]);
  const [saving, setSaving] = useState(false);

  const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  const fetchData = async () => {
    // Pending bills (paid but not confirmed)
    const { data: pb } = await supabase
      .from('bills')
      .select('*, orders(client)')
      .eq('confirmed', false)
      .is('deleted_at', null)
      .order('date', { ascending: false });
    setPendingBills(
      (pb || []).map((b: Record<string, unknown>) => ({
        ...b,
        order_client: (b.orders as Record<string, string>)?.client || '',
      })) as (Bill & { order_client?: string })[]
    );

    // Confirmed bills this month
    const { data: cb } = await supabase
      .from('bills')
      .select('*, orders(client)')
      .eq('confirmed', true)
      .is('deleted_at', null)
      .gte('date', thisMonth + '-01')
      .order('date', { ascending: false });
    setConfirmedBills(
      (cb || []).map((b: Record<string, unknown>) => ({
        ...b,
        order_client: (b.orders as Record<string, string>)?.client || '',
      })) as (Bill & { order_client?: string })[]
    );

    // Pending expenses
    const { data: pe } = await supabase
      .from('expenses')
      .select('*')
      .eq('status', '待审批')
      .is('deleted_at', null)
      .order('date', { ascending: false });
    setPendingExpenses(pe || []);

    // Approved expenses this month
    const { data: ae } = await supabase
      .from('expenses')
      .select('*')
      .eq('status', '已审批')
      .is('deleted_at', null)
      .gte('date', thisMonth + '-01')
      .order('date', { ascending: false });
    setApprovedExpenses(ae || []);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, []);

  const confirmBill = async (billId: number, orderId: number) => {
    await supabase.from('bills').update({ confirmed: true, confirmed_at: new Date().toISOString() }).eq('id', billId);
    await supabase.from('orders').update({ status: '已入账' }).eq('id', orderId);
    fetchData();
  };

  const approveExpense = async (id: number) => {
    await supabase.from('expenses').update({ status: '已审批', approved_by: roleLabel }).eq('id', id);
    fetchData();
  };

  const rejectExpense = async (id: number) => {
    await supabase.from('expenses').update({ status: '已驳回', approved_by: roleLabel }).eq('id', id);
    fetchData();
  };

  const submitExpense = async () => {
    const amount = parseInt(expForm.amount) || 0;
    if (amount <= 0) return alert('请填写金额');
    if (!expForm.category) return alert('请选择类别');
    setSaving(true);
    await supabase.from('expenses').insert({
      date: expForm.date,
      category: expForm.category,
      amount,
      supplier: expForm.supplier || null,
      note: expForm.note || null,
      items: expItems.length > 0 ? expItems : [],
      submitted_by: roleLabel,
      status: '待审批',
    });
    setSaving(false);
    setShowExpenseForm(false);
    setExpForm({ date: new Date().toISOString().split('T')[0], category: '食材采购', amount: '', supplier: '', note: '' });
    setExpItems([]);
    fetchData();
  };

  const addExpenseItem = () => {
    setExpItems((items) => [...items, { name: '', qty: 0, price: 0 }]);
  };

  const updateExpenseItem = (idx: number, key: keyof ExpenseItem, value: string | number) => {
    setExpItems((items) => items.map((item, i) => i === idx ? { ...item, [key]: value } : item));
  };

  const removeExpenseItem = (idx: number) => {
    setExpItems((items) => items.filter((_, i) => i !== idx));
  };

  const totalPendingIncome = pendingBills.reduce((s, b) => s + b.paid, 0);
  const totalConfirmedIncome = confirmedBills.reduce((s, b) => s + b.paid, 0);
  const totalPendingExpense = pendingExpenses.reduce((s, e) => s + e.amount, 0);
  const totalApprovedExpense = approvedExpenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ===== LEFT: Income ===== */}
        <div className="space-y-3">
          <h2 className="font-bold text-sm flex items-center gap-2">
            收入确认
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--amber-bg)] text-[var(--amber)]">
              {pendingBills.length} 待入账
            </span>
          </h2>

          {/* Pending bills */}
          {pendingBills.length > 0 && (
            <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
              <div className="px-3 py-2 bg-[var(--amber-bg)] text-xs font-medium text-[var(--amber)]">
                待入账 · 合计 ¥{totalPendingIncome.toLocaleString()}
              </div>
              {pendingBills.map((b) => (
                <div key={b.id} className="flex items-center justify-between px-3 py-2 border-t border-[var(--border2)]">
                  <div className="text-sm">
                    <span className="font-medium">{b.order_client}</span>
                    <span className="text-[var(--ink3)] text-xs ml-2">{b.date} · {b.method}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">¥{b.paid.toLocaleString()}</span>
                    {can('finance_page') && (
                      <button onClick={() => confirmBill(b.id, b.order_id)}
                        className="px-2 py-1 text-[10px] bg-[var(--blue)] text-white rounded hover:opacity-90">
                        确认入账
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Confirmed bills this month */}
          <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
            <div className="px-3 py-2 bg-[var(--blue-bg)] text-xs font-medium text-[var(--blue)]">
              本月已入账 · 合计 ¥{totalConfirmedIncome.toLocaleString()}
            </div>
            {confirmedBills.length === 0 && (
              <div className="px-3 py-4 text-center text-[var(--ink3)] text-xs">暂无</div>
            )}
            {confirmedBills.map((b) => (
              <div key={b.id} className="flex items-center justify-between px-3 py-2 border-t border-[var(--border2)]">
                <div className="text-sm">
                  <span className="font-medium">{b.order_client}</span>
                  <span className="text-[var(--ink3)] text-xs ml-2">{b.date} · {b.method}</span>
                </div>
                <span className="font-medium text-sm text-[var(--blue)]">¥{b.paid.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ===== RIGHT: Expenses ===== */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm flex items-center gap-2">
              支出管理
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--amber-bg)] text-[var(--amber)]">
                {pendingExpenses.length} 待审批
              </span>
            </h2>
            {can('edit') && (
              <button onClick={() => setShowExpenseForm(true)}
                className="px-3 py-1 text-xs bg-[var(--green)] text-white rounded-md hover:opacity-90">
                + 提交支出
              </button>
            )}
          </div>

          {/* Pending expenses */}
          {pendingExpenses.length > 0 && (
            <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
              <div className="px-3 py-2 bg-[var(--amber-bg)] text-xs font-medium text-[var(--amber)]">
                待审批 · 合计 ¥{totalPendingExpense.toLocaleString()}
              </div>
              {pendingExpenses.map((e) => (
                <div key={e.id} className="px-3 py-2 border-t border-[var(--border2)]">
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <span className="font-medium">{e.category}</span>
                      <span className="text-[var(--ink3)] text-xs ml-2">{e.date}</span>
                      {e.supplier && <span className="text-[var(--ink3)] text-xs ml-1">· {e.supplier}</span>}
                    </div>
                    <span className="font-medium text-sm">¥{e.amount.toLocaleString()}</span>
                  </div>
                  {e.note && <p className="text-xs text-[var(--ink3)] mt-0.5">{e.note}</p>}
                  {e.items && Array.isArray(e.items) && e.items.length > 0 && (
                    <div className="text-[10px] text-[var(--ink3)] mt-1">
                      {(e.items as ExpenseItem[]).map((item, i) => (
                        <span key={i}>{item.name}({item.qty}×¥{item.price}) </span>
                      ))}
                    </div>
                  )}
                  {can('approve') && (
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => approveExpense(e.id)}
                        className="px-3 py-1 text-[10px] bg-[var(--green)] text-white rounded hover:opacity-90">批准</button>
                      <button onClick={() => rejectExpense(e.id)}
                        className="px-3 py-1 text-[10px] border border-[var(--red-border)] text-[var(--red)] rounded hover:bg-[var(--red-bg)]">驳回</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Approved expenses this month */}
          <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
            <div className="px-3 py-2 bg-[var(--green-bg)] text-xs font-medium text-[var(--green)]">
              本月已审批 · 合计 ¥{totalApprovedExpense.toLocaleString()}
            </div>
            {approvedExpenses.length === 0 && (
              <div className="px-3 py-4 text-center text-[var(--ink3)] text-xs">暂无</div>
            )}
            {approvedExpenses.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-3 py-2 border-t border-[var(--border2)]">
                <div className="text-sm">
                  <span className="font-medium">{e.category}</span>
                  <span className="text-[var(--ink3)] text-xs ml-2">{e.date}</span>
                  {e.supplier && <span className="text-[var(--ink3)] text-xs ml-1">· {e.supplier}</span>}
                </div>
                <span className="font-medium text-sm text-[var(--green)]">¥{e.amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Expense Form Modal */}
      {showExpenseForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={() => setShowExpenseForm(false)}>
          <div className="bg-white w-full max-w-[480px] max-h-[90vh] rounded-t-xl md:rounded-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <h2 className="font-bold text-base">提交支出申请</h2>
              <button onClick={() => setShowExpenseForm(false)} className="text-[var(--ink3)] text-lg">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">日期</span>
                  <input type="date" value={expForm.date} onChange={(e) => setExpForm((f) => ({ ...f, date: e.target.value }))}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">类别</span>
                  <select value={expForm.category} onChange={(e) => setExpForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]">
                    {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">金额 *</span>
                  <input type="number" min="0" value={expForm.amount} onChange={(e) => setExpForm((f) => ({ ...f, amount: e.target.value }))}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">供应商</span>
                  <input type="text" value={expForm.supplier} onChange={(e) => setExpForm((f) => ({ ...f, supplier: e.target.value }))}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
                </label>
              </div>
              <label className="block">
                <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">备注</span>
                <textarea value={expForm.note} onChange={(e) => setExpForm((f) => ({ ...f, note: e.target.value }))} rows={2}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)] resize-none" />
              </label>

              {/* Expense items for food purchases */}
              {expForm.category === '食材采购' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-medium text-[var(--ink2)]">采购明细</span>
                    <button onClick={addExpenseItem} className="text-[11px] text-[var(--green)] hover:underline">+ 添加</button>
                  </div>
                  {expItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-4 gap-2 mb-1">
                      <input type="text" placeholder="品名" value={item.name}
                        onChange={(e) => updateExpenseItem(idx, 'name', e.target.value)}
                        className="px-2 py-1 border border-[var(--border)] rounded text-xs" />
                      <input type="number" placeholder="数量" min="0" value={item.qty || ''}
                        onChange={(e) => updateExpenseItem(idx, 'qty', parseInt(e.target.value) || 0)}
                        className="px-2 py-1 border border-[var(--border)] rounded text-xs" />
                      <input type="number" placeholder="单价" min="0" value={item.price || ''}
                        onChange={(e) => updateExpenseItem(idx, 'price', parseInt(e.target.value) || 0)}
                        className="px-2 py-1 border border-[var(--border)] rounded text-xs" />
                      <button onClick={() => removeExpenseItem(idx)} className="text-[var(--red)] text-xs">删除</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-3 px-4 py-3 border-t border-[var(--border)]">
              <button onClick={submitExpense} disabled={saving} className="flex-1 py-2.5 text-sm bg-[var(--green)] text-white rounded-lg hover:opacity-90 transition disabled:opacity-50">
                {saving ? '提交中...' : '提交申请'}
              </button>
              <button onClick={() => setShowExpenseForm(false)} className="flex-1 py-2.5 text-sm border border-[var(--border)] rounded-lg hover:bg-[var(--bg)] transition">取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
