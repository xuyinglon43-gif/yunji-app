'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Bill, Expense, EXPENSE_CATEGORIES, ExpenseItem } from '@/lib/types';

// 收款方式颜色映射
const METHOD_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  '微信': { bg: 'bg-green-50', text: 'text-green-700', dot: '#22C55E' },
  '现金': { bg: 'bg-amber-50', text: 'text-amber-700', dot: '#F59E0B' },
  '储值扣减': { bg: 'bg-purple-50', text: 'text-purple-700', dot: '#8B5CF6' },
  '挂账': { bg: 'bg-red-50', text: 'text-red-700', dot: '#EF4444' },
  '转账': { bg: 'bg-blue-50', text: 'text-blue-700', dot: '#3B82F6' },
};

const getMethodColor = (method: string) => METHOD_COLORS[method] || { bg: 'bg-gray-50', text: 'text-gray-700', dot: '#6B7280' };

export default function FinancePage() {
  const { can, roleLabel } = useAuth();
  const [pendingBills, setPendingBills] = useState<(Bill & { order_client?: string })[]>([]);
  const [confirmedBills, setConfirmedBills] = useState<(Bill & { order_client?: string })[]>([]);
  const [pendingExpenses, setPendingExpenses] = useState<Expense[]>([]);
  const [approvedExpenses, setApprovedExpenses] = useState<Expense[]>([]);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [tab, setTab] = useState<'overview' | 'income' | 'expense'>('overview');
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [expForm, setExpForm] = useState({
    date: new Date().toISOString().split('T')[0],
    category: '食材采购',
    amount: '',
    supplier: '',
    note: '',
  });
  const [expItems, setExpItems] = useState<ExpenseItem[]>([]);

  const thisMonth = new Date().toISOString().slice(0, 7);

  // 加载自定义类目
  useEffect(() => {
    const saved = localStorage.getItem('yunji_custom_expense_categories');
    if (saved) setCustomCategories(JSON.parse(saved));
  }, []);

  const allCategories = useMemo(() => {
    return [...EXPENSE_CATEGORIES, ...customCategories];
  }, [customCategories]);

  const addCustomCategory = () => {
    const name = newCategory.trim();
    if (!name || allCategories.includes(name)) return;
    const updated = [...customCategories, name];
    setCustomCategories(updated);
    localStorage.setItem('yunji_custom_expense_categories', JSON.stringify(updated));
    setNewCategory('');
    setExpForm((f) => ({ ...f, category: name }));
  };

  const fetchData = async () => {
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

    const { data: pe } = await supabase
      .from('expenses')
      .select('*')
      .eq('status', '待审批')
      .is('deleted_at', null)
      .order('date', { ascending: false });
    setPendingExpenses(pe || []);

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

  const confirmBill = (billId: number, orderId: number) => {
    // 乐观更新：立即从待入账列表移除
    setPendingBills((prev) => prev.filter((b) => b.id !== billId));
    // 后台写入
    Promise.all([
      supabase.from('bills').update({ confirmed: true, confirmed_at: new Date().toISOString() }).eq('id', billId),
      supabase.from('orders').update({ status: '已入账' }).eq('id', orderId),
    ]).then(() => fetchData());
  };

  const approveExpense = (id: number) => {
    setPendingExpenses((prev) => prev.filter((e) => e.id !== id));
    supabase.from('expenses').update({ status: '已审批', approved_by: roleLabel }).eq('id', id).then(() => fetchData());
  };

  const rejectExpense = (id: number) => {
    setPendingExpenses((prev) => prev.filter((e) => e.id !== id));
    supabase.from('expenses').update({ status: '已驳回', approved_by: roleLabel }).eq('id', id).then(() => fetchData());
  };

  const submitExpense = async () => {
    const amount = parseInt(expForm.amount) || 0;
    if (amount <= 0) return alert('请填写金额');
    if (!expForm.category) return alert('请选择类别');
    // 立即关闭弹窗
    setShowExpenseForm(false);
    setExpForm({ date: new Date().toISOString().split('T')[0], category: '食材采购', amount: '', supplier: '', note: '' });
    const savedItems = [...expItems];
    setExpItems([]);
    // 后台写入
    supabase.from('expenses').insert({
      date: expForm.date,
      category: expForm.category,
      amount,
      supplier: expForm.supplier || null,
      note: expForm.note || null,
      items: savedItems.length > 0 ? savedItems : [],
      submitted_by: roleLabel,
      status: '待审批',
    }).then(() => fetchData());
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

  // 收款方式分布
  const methodBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of confirmedBills) {
      map[b.method] = (map[b.method] || 0) + b.paid;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [confirmedBills]);

  // 日维度收支流水
  const dailyFlow = useMemo(() => {
    const map = new Map<string, { income: number; expense: number; bills: (Bill & { order_client?: string })[]; expenses: Expense[] }>();
    for (const b of confirmedBills) {
      const entry = map.get(b.date) || { income: 0, expense: 0, bills: [], expenses: [] };
      entry.income += b.paid;
      entry.bills.push(b);
      map.set(b.date, entry);
    }
    for (const e of approvedExpenses) {
      const entry = map.get(e.date) || { income: 0, expense: 0, bills: [], expenses: [] };
      entry.expense += e.amount;
      entry.expenses.push(e);
      map.set(e.date, entry);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [confirmedBills, approvedExpenses]);

  // 支出分类汇总
  const expenseByCat = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of approvedExpenses) {
      map[e.category] = (map[e.category] || 0) + e.amount;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [approvedExpenses]);

  return (
    <div className="flex flex-col h-full">
      {/* Tab 切换 + 提交支出按钮 */}
      <div className="p-3 bg-white border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex gap-1">
          {[
            { id: 'overview' as const, label: '总览' },
            { id: 'income' as const, label: `收入 (${pendingBills.length})` },
            { id: 'expense' as const, label: `支出 (${pendingExpenses.length})` },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-xs rounded-md border transition
                ${tab === t.id
                  ? 'bg-[var(--green)] text-white border-[var(--green)]'
                  : 'bg-white text-[var(--ink2)] border-[var(--border)] hover:bg-[var(--bg)]'
                }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {can('edit') && (
          <button
            onClick={() => setShowExpenseForm(true)}
            className="px-4 py-2 text-sm font-medium bg-[var(--green)] text-white rounded-lg hover:opacity-90 transition shadow-sm"
          >
            + 提交支出
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {/* ===== 总览 Tab ===== */}
        {tab === 'overview' && (
          <div className="space-y-4">
            {/* 本月摘要 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-lg p-3 border border-[var(--border)]">
                <div className="text-[10px] text-[var(--ink3)]">本月已入账</div>
                <div className="text-lg font-bold text-[var(--green)]">¥{totalConfirmedIncome.toLocaleString()}</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-[var(--border)]">
                <div className="text-[10px] text-[var(--ink3)]">待入账</div>
                <div className="text-lg font-bold text-[var(--amber)]">¥{totalPendingIncome.toLocaleString()}</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-[var(--border)]">
                <div className="text-[10px] text-[var(--ink3)]">本月已审批支出</div>
                <div className="text-lg font-bold text-[var(--red)]">¥{totalApprovedExpense.toLocaleString()}</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-[var(--border)]">
                <div className="text-[10px] text-[var(--ink3)]">本月净收入</div>
                <div className="text-lg font-bold">{(totalConfirmedIncome - totalApprovedExpense) >= 0 ? '' : '-'}¥{Math.abs(totalConfirmedIncome - totalApprovedExpense).toLocaleString()}</div>
              </div>
            </div>

            {/* 收款方式分布 */}
            {methodBreakdown.length > 0 && (
              <div className="bg-white rounded-lg border border-[var(--border)] p-3">
                <h3 className="text-xs font-semibold mb-2">本月收款方式分布</h3>
                <div className="space-y-2">
                  {methodBreakdown.map(([method, amount]) => {
                    const mc = getMethodColor(method);
                    const pct = totalConfirmedIncome > 0 ? (amount / totalConfirmedIncome * 100) : 0;
                    return (
                      <div key={method} className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 w-20">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: mc.dot }} />
                          <span className="text-xs">{method}</span>
                        </div>
                        <div className="flex-1 h-5 bg-[var(--bg)] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${mc.bg}`} style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: mc.dot + '30' }} />
                        </div>
                        <span className="text-xs font-medium w-24 text-right">¥{amount.toLocaleString()} ({pct.toFixed(0)}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 支出分类汇总 */}
            {expenseByCat.length > 0 && (
              <div className="bg-white rounded-lg border border-[var(--border)] p-3">
                <h3 className="text-xs font-semibold mb-2">本月支出分类</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {expenseByCat.map(([cat, amount]) => (
                    <div key={cat} className="bg-[var(--bg)] rounded-md p-2">
                      <div className="text-[10px] text-[var(--ink3)]">{cat}</div>
                      <div className="text-sm font-semibold">¥{amount.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 日维度收支流水 */}
            <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
              <div className="px-3 py-2 bg-[var(--bg)] text-xs font-semibold">本月日收支流水</div>
              {dailyFlow.length === 0 && (
                <div className="px-3 py-4 text-center text-[var(--ink3)] text-xs">暂无数据</div>
              )}
              {dailyFlow.map(([date, data]) => (
                <div key={date} className="border-t border-[var(--border2)]">
                  <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg)]/50">
                    <span className="text-xs font-medium">{date}</span>
                    <div className="flex gap-3 text-xs">
                      {data.income > 0 && <span className="text-[var(--green)]">+¥{data.income.toLocaleString()}</span>}
                      {data.expense > 0 && <span className="text-[var(--red)]">-¥{data.expense.toLocaleString()}</span>}
                    </div>
                  </div>
                  <div className="px-3 py-1.5 space-y-1">
                    {data.bills.map((b) => {
                      const mc = getMethodColor(b.method);
                      return (
                        <div key={`b-${b.id}`} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${mc.bg} ${mc.text}`}>{b.method}</span>
                            <span>{b.order_client}</span>
                          </div>
                          <span className="text-[var(--green)] font-medium">+¥{b.paid.toLocaleString()}</span>
                        </div>
                      );
                    })}
                    {data.expenses.map((e) => (
                      <div key={`e-${e.id}`} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-50 text-red-700">支出</span>
                          <span>{e.category}{e.supplier ? ` · ${e.supplier}` : ''}</span>
                        </div>
                        <span className="text-[var(--red)] font-medium">-¥{e.amount.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== 收入 Tab ===== */}
        {tab === 'income' && (
          <div className="space-y-3">
            {pendingBills.length > 0 && (
              <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
                <div className="px-3 py-2 bg-[#FFF3CD] text-xs font-medium text-[#856404]">
                  待入账 · 合计 ¥{totalPendingIncome.toLocaleString()}
                </div>
                {pendingBills.map((b) => {
                  const mc = getMethodColor(b.method);
                  return (
                    <div key={b.id} className="flex items-center justify-between px-3 py-2 border-t border-[var(--border2)]">
                      <div className="text-sm flex items-center gap-2">
                        <span className="font-medium">{b.order_client}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${mc.bg} ${mc.text}`}>{b.method}</span>
                        <span className="text-[var(--ink3)] text-xs">{b.date}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">¥{b.paid.toLocaleString()}</span>
                        {can('finance_page') && (
                          <button onClick={() => confirmBill(b.id, b.order_id)}
                            className="px-2.5 py-1 text-[11px] bg-[#2196F3] text-white rounded hover:opacity-90">
                            确认入账
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
              <div className="px-3 py-2 bg-[#CCE5FF] text-xs font-medium text-[#004085]">
                本月已入账 · 合计 ¥{totalConfirmedIncome.toLocaleString()}
              </div>
              {confirmedBills.length === 0 && (
                <div className="px-3 py-4 text-center text-[var(--ink3)] text-xs">暂无</div>
              )}
              {confirmedBills.map((b) => {
                const mc = getMethodColor(b.method);
                return (
                  <div key={b.id} className="flex items-center justify-between px-3 py-2 border-t border-[var(--border2)]">
                    <div className="text-sm flex items-center gap-2">
                      <span className="font-medium">{b.order_client}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${mc.bg} ${mc.text}`}>{b.method}</span>
                      <span className="text-[var(--ink3)] text-xs">{b.date}</span>
                    </div>
                    <span className="font-medium text-sm text-[#004085]">¥{b.paid.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===== 支出 Tab ===== */}
        {tab === 'expense' && (
          <div className="space-y-3">
            {pendingExpenses.length > 0 && (
              <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
                <div className="px-3 py-2 bg-[#FFF3CD] text-xs font-medium text-[#856404]">
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
                          className="px-3 py-1 text-[11px] bg-[var(--green)] text-white rounded hover:opacity-90">批准</button>
                        <button onClick={() => rejectExpense(e.id)}
                          className="px-3 py-1 text-[11px] border border-[var(--red-border)] text-[var(--red)] rounded hover:bg-[var(--red-bg)]">驳回</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
              <div className="px-3 py-2 bg-[#D4EDDA] text-xs font-medium text-[#155724]">
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
                  <span className="font-medium text-sm text-[#155724]">¥{e.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 提交支出 Modal */}
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
                <div>
                  <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">类别</span>
                  <select value={expForm.category} onChange={(e) => setExpForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]">
                    {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {/* 自定义类目 */}
                  <div className="flex gap-1 mt-1">
                    <input
                      type="text"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      placeholder="自定义类目"
                      className="flex-1 px-2 py-1 border border-[var(--border)] rounded text-[11px] focus:outline-none"
                    />
                    <button
                      onClick={addCustomCategory}
                      className="px-2 py-1 text-[10px] bg-[var(--bg)] border border-[var(--border)] rounded hover:bg-[var(--bg2)] transition"
                    >
                      添加
                    </button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">金额 *</span>
                  <input type="number" min="0" value={expForm.amount} onChange={(e) => setExpForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="支出金额"
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">供应商/收款方</span>
                  <input type="text" value={expForm.supplier} onChange={(e) => setExpForm((f) => ({ ...f, supplier: e.target.value }))}
                    placeholder="供应商或收款方名称"
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
                </label>
              </div>
              <label className="block">
                <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">备注</span>
                <textarea value={expForm.note} onChange={(e) => setExpForm((f) => ({ ...f, note: e.target.value }))} rows={2}
                  placeholder="支出说明、用途等"
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)] resize-none" />
              </label>

              {/* 采购明细 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-medium text-[var(--ink2)]">明细项（可选）</span>
                  <button onClick={addExpenseItem} className="text-[11px] text-[var(--green)] hover:underline">+ 添加明细</button>
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
            </div>
            <div className="flex gap-3 px-4 py-3 border-t border-[var(--border)]">
              <button onClick={submitExpense} className="flex-1 py-2.5 text-sm bg-[var(--green)] text-white rounded-lg hover:opacity-90 transition">
                提交申请
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
