'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Bill, BusinessContact, BizSettlement } from '@/lib/types';

type View = 'list' | 'detail';

export default function BusinessPage() {
  const { can, roleLabel } = useAuth();
  const [bills, setBills] = useState<(Bill & { order_client?: string; order_type?: string; order_date?: string })[]>([]);
  const [allBills, setAllBills] = useState<(Bill & { order_client?: string; order_type?: string; order_date?: string })[]>([]);
  const [contacts, setContacts] = useState<BusinessContact[]>([]);
  const [settlements, setSettlements] = useState<BizSettlement[]>([]);
  const [view, setView] = useState<View>('list');
  const [selectedContact, setSelectedContact] = useState<BusinessContact | null>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<BusinessContact | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', start_date: '', note: '' });
  const [settleAmount, setSettleAmount] = useState('');
  const [settleNote, setSettleNote] = useState('');
  const [showSettle, setShowSettle] = useState(false);
  const [saving, setSaving] = useState(false);

  const thisMonth = new Date().toISOString().slice(0, 7);

  const fetchData = async () => {
    // This month bills
    const { data: mb } = await supabase
      .from('bills').select('*, orders(client, type, biz_name, date)')
      .gte('date', thisMonth + '-01').eq('confirmed', true).is('deleted_at', null);
    const mapBill = (b: Record<string, unknown>) => {
      const ord = b.orders as Record<string, string> | null;
      return { ...b, order_client: ord?.client || '', order_type: ord?.type || '', order_date: ord?.date || '', biz_name: b.biz_name || ord?.biz_name || '' };
    };
    setBills((mb || []).map(mapBill) as typeof bills);

    // All time bills (for cumulative)
    const { data: ab } = await supabase
      .from('bills').select('*, orders(client, type, biz_name, date)')
      .eq('confirmed', true).is('deleted_at', null);
    setAllBills((ab || []).map(mapBill) as typeof bills);

    // Contacts
    const { data: c } = await supabase
      .from('business_contacts').select('*').is('deleted_at', null).order('name');
    setContacts(c || []);

    // Settlements
    const { data: s } = await supabase
      .from('biz_settlements').select('*').order('settled_at', { ascending: false });
    setSettlements(s || []);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, []);

  // Aggregate helper
  const aggregate = (billList: typeof bills) => {
    const map = new Map<string, { orders: number; clients: Set<string>; revenue: number; commission: number }>();
    for (const b of billList) {
      if (!b.biz_name) continue;
      let s = map.get(b.biz_name);
      if (!s) { s = { orders: 0, clients: new Set(), revenue: 0, commission: 0 }; map.set(b.biz_name, s); }
      s.orders++; if (b.order_client) s.clients.add(b.order_client);
      s.revenue += b.paid; s.commission += b.biz_commission;
    }
    return map;
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const monthStats = useMemo(() => aggregate(bills), [bills]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allTimeStats = useMemo(() => aggregate(allBills), [allBills]);

  const totalMonthRevenue = useMemo(() => Array.from(monthStats.values()).reduce((s, v) => s + v.revenue, 0), [monthStats]);
  const totalMonthCommission = useMemo(() => Array.from(monthStats.values()).reduce((s, v) => s + v.commission, 0), [monthStats]);
  const totalAllRevenue = useMemo(() => Array.from(allTimeStats.values()).reduce((s, v) => s + v.revenue, 0), [allTimeStats]);
  const totalAllCommission = useMemo(() => Array.from(allTimeStats.values()).reduce((s, v) => s + v.commission, 0), [allTimeStats]);
  const totalSettled = useMemo(() => settlements.reduce((s, v) => s + v.amount, 0), [settlements]);

  // All biz names (from contacts + any name appearing in bills)
  const ranking = useMemo(() => {
    const names = new Set<string>();
    contacts.forEach((c) => names.add(c.name));
    allTimeStats.forEach((_, k) => names.add(k));
    return Array.from(names).map((name) => {
      const ms = monthStats.get(name);
      const as_ = allTimeStats.get(name);
      const contact = contacts.find((c) => c.name === name);
      const settled = settlements.filter((s) => s.biz_name === name).reduce((sum, s) => sum + s.amount, 0);
      return {
        name,
        contact,
        monthRevenue: ms?.revenue || 0,
        monthCommission: ms?.commission || 0,
        monthOrders: ms?.orders || 0,
        allRevenue: as_?.revenue || 0,
        allCommission: as_?.commission || 0,
        allOrders: as_?.orders || 0,
        settled,
        unsettled: (as_?.commission || 0) - settled,
      };
    }).sort((a, b) => b.monthRevenue - a.monthRevenue);
  }, [monthStats, allTimeStats, contacts, settlements]);

  // --- Contact CRUD ---
  const openCreateContact = () => {
    setForm({ name: '', phone: '', start_date: new Date().toISOString().split('T')[0], note: '' });
    setEditingContact(null);
    setShowForm(true);
  };

  const openEditContact = (c: BusinessContact) => {
    setForm({ name: c.name, phone: c.phone || '', start_date: c.start_date || '', note: c.note || '' });
    setEditingContact(c);
    setShowForm(true);
  };

  const saveContact = async () => {
    if (!form.name.trim()) return alert('请填写姓名');
    setSaving(true);
    if (editingContact) {
      await supabase.from('business_contacts').update({
        name: form.name.trim(), phone: form.phone, start_date: form.start_date || null, note: form.note,
      }).eq('id', editingContact.id);
    } else {
      await supabase.from('business_contacts').insert({
        name: form.name.trim(), phone: form.phone, start_date: form.start_date || null, note: form.note, status: 'active',
      });
    }
    setSaving(false);
    setShowForm(false);
    fetchData();
  };

  const toggleStatus = async (c: BusinessContact) => {
    await supabase.from('business_contacts').update({
      status: c.status === 'active' ? 'paused' : 'active',
    }).eq('id', c.id);
    fetchData();
  };

  // --- Settlement ---
  const openSettle = () => {
    setSettleAmount('');
    setSettleNote('');
    setShowSettle(true);
  };

  const doSettle = async () => {
    if (!selectedContact) return;
    const amount = parseInt(settleAmount) || 0;
    if (amount <= 0) return alert('请填写结算金额');
    setSaving(true);
    await supabase.from('biz_settlements').insert({
      biz_contact_id: selectedContact.id,
      biz_name: selectedContact.name,
      amount,
      settled_at: new Date().toISOString(),
      settled_by: roleLabel,
      note: settleNote,
    });
    setSaving(false);
    setShowSettle(false);
    fetchData();
  };

  // --- Detail view ---
  const openDetail = (name: string) => {
    const c = contacts.find((ct) => ct.name === name) || null;
    setSelectedContact(c);
    setView('detail');
  };

  const detailBills = useMemo(() => {
    if (!selectedContact) return [];
    return allBills.filter((b) => b.biz_name === selectedContact.name);
  }, [selectedContact, allBills]);

  const detailSettlements = useMemo(() => {
    if (!selectedContact) return [];
    return settlements.filter((s) => s.biz_name === selectedContact.name);
  }, [selectedContact, settlements]);

  const detailTotalCommission = detailBills.reduce((s, b) => s + b.biz_commission, 0);
  const detailTotalSettled = detailSettlements.reduce((s, v) => s + v.amount, 0);

  const fmtTime = (ts: string) => {
    if (!ts) return '';
    return ts.split('T')[0];
  };

  // =========== DETAIL VIEW ===========
  if (view === 'detail' && selectedContact) {
    return (
      <div className="flex flex-col h-full overflow-y-auto p-3 space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setView('list')} className="text-xs text-[var(--blue)] hover:underline">← 返回列表</button>
          <h2 className="font-bold text-base">{selectedContact.name}</h2>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${selectedContact.status === 'active' ? 'bg-[var(--green-bg)] text-[var(--green)]' : 'bg-gray-100 text-gray-500'}`}>
            {selectedContact.status === 'active' ? '活跃' : '暂停'}
          </span>
          {can('edit') && (
            <button onClick={() => openEditContact(selectedContact)} className="text-xs text-[var(--blue)] hover:underline ml-auto">编辑</button>
          )}
        </div>

        {/* Contact info */}
        <div className="bg-white rounded-lg p-4 border border-[var(--border)] grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-[var(--ink3)] text-xs">电话</span><p>{selectedContact.phone || '-'}</p></div>
          <div><span className="text-[var(--ink3)] text-xs">合作开始</span><p>{selectedContact.start_date || '-'}</p></div>
          {selectedContact.note && <div className="col-span-2"><span className="text-[var(--ink3)] text-xs">备注</span><p>{selectedContact.note}</p></div>}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-lg p-3 border border-[var(--border)]">
            <div className="text-xs text-[var(--ink3)]">累计提成</div>
            <div className="text-lg font-bold text-[var(--amber)] mt-1">¥{detailTotalCommission.toLocaleString()}</div>
          </div>
          <div className="bg-white rounded-lg p-3 border border-[var(--border)]">
            <div className="text-xs text-[var(--ink3)]">已结算</div>
            <div className="text-lg font-bold text-[var(--green)] mt-1">¥{detailTotalSettled.toLocaleString()}</div>
          </div>
          <div className="bg-white rounded-lg p-3 border border-[var(--border)]">
            <div className="text-xs text-[var(--ink3)]">未结算</div>
            <div className="text-lg font-bold text-[var(--red)] mt-1">¥{(detailTotalCommission - detailTotalSettled).toLocaleString()}</div>
          </div>
        </div>

        {/* Settle button */}
        {can('settle_commission') && (
          <button onClick={openSettle}
            className="px-4 py-2 bg-[var(--green)] text-white text-sm rounded-md hover:opacity-90 transition self-start">
            结算提成
          </button>
        )}

        {/* Order details with commission breakdown */}
        <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
          <div className="px-3 py-2 bg-[var(--bg)] text-xs font-semibold text-[var(--ink2)]">
            关联订单明细（{detailBills.length}笔）
          </div>
          {detailBills.length === 0 && <div className="px-3 py-6 text-center text-xs text-[var(--ink3)]">暂无</div>}
          {detailBills.map((b) => (
            <div key={b.id} className="px-3 py-2 border-t border-[var(--border2)] text-sm">
              <div className="flex justify-between">
                <div>
                  <span className="font-medium">{b.order_client}</span>
                  <span className="text-xs text-[var(--ink3)] ml-2">{b.order_date} · {b.order_type} · {b.method}</span>
                </div>
                <span className="font-medium">¥{b.paid.toLocaleString()}</span>
              </div>
              <div className="text-xs text-[var(--ink3)] mt-0.5">
                实收 ¥{b.paid.toLocaleString()}
                {b.discount < 100 && ` (${b.discount}%折)`}
                → 提成 <span className="text-[var(--amber)] font-medium">¥{b.biz_commission.toLocaleString()}</span>
                {b.biz_commission === 0 && b.method === '储值扣减' && ' (储值消费不计提)'}
              </div>
            </div>
          ))}
        </div>

        {/* Settlement history */}
        {detailSettlements.length > 0 && (
          <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
            <div className="px-3 py-2 bg-[var(--green-bg)] text-xs font-semibold text-[var(--green)]">结算记录</div>
            {detailSettlements.map((s) => (
              <div key={s.id} className="flex justify-between px-3 py-2 border-t border-[var(--border2)] text-sm">
                <div>
                  <span className="font-medium">¥{s.amount.toLocaleString()}</span>
                  <span className="text-xs text-[var(--ink3)] ml-2">{fmtTime(s.settled_at)} · {s.settled_by}</span>
                </div>
                {s.note && <span className="text-xs text-[var(--ink3)]">{s.note}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Settle modal */}
        {showSettle && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={() => setShowSettle(false)}>
            <div className="bg-white w-full max-w-[400px] rounded-t-xl md:rounded-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                <h2 className="font-bold text-base">结算提成 — {selectedContact.name}</h2>
                <button onClick={() => setShowSettle(false)} className="text-[var(--ink3)] text-lg">✕</button>
              </div>
              <div className="p-4 space-y-3">
                <div className="text-sm text-[var(--ink3)]">未结算: ¥{(detailTotalCommission - detailTotalSettled).toLocaleString()}</div>
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">结算金额 *</span>
                  <input type="number" min="0" value={settleAmount} onChange={(e) => setSettleAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">备注</span>
                  <input type="text" value={settleNote} onChange={(e) => setSettleNote(e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
                </label>
              </div>
              <div className="flex gap-3 px-4 py-3 border-t border-[var(--border)]">
                <button onClick={doSettle} disabled={saving} className="flex-1 py-2.5 text-sm bg-[var(--green)] text-white rounded-lg disabled:opacity-50">
                  {saving ? '处理中...' : '确认结算'}
                </button>
                <button onClick={() => setShowSettle(false)} className="flex-1 py-2.5 text-sm border border-[var(--border)] rounded-lg">取消</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========== LIST VIEW ===========
  return (
    <div className="flex flex-col h-full overflow-y-auto p-3 space-y-4">
      {/* Summary cards — month + cumulative */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg p-3 border border-[var(--border)]">
          <div className="text-[10px] text-[var(--ink3)]">本月商务收入</div>
          <div className="text-lg font-bold text-[var(--green)] mt-1">¥{totalMonthRevenue.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-lg p-3 border border-[var(--border)]">
          <div className="text-[10px] text-[var(--ink3)]">本月应付提成</div>
          <div className="text-lg font-bold text-[var(--amber)] mt-1">¥{totalMonthCommission.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-lg p-3 border border-[var(--border)]">
          <div className="text-[10px] text-[var(--ink3)]">累计商务收入</div>
          <div className="text-lg font-bold text-[var(--green)] mt-1">¥{totalAllRevenue.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-lg p-3 border border-[var(--border)]">
          <div className="text-[10px] text-[var(--ink3)]">累计提成 / 已结算</div>
          <div className="text-lg font-bold mt-1">
            <span className="text-[var(--amber)]">¥{totalAllCommission.toLocaleString()}</span>
            <span className="text-xs text-[var(--green)] ml-1">/ ¥{totalSettled.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Search + Add */}
      <div className="flex items-center gap-2">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索商务姓名或电话..."
          className="flex-1 px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
        {can('edit') && (
          <button onClick={openCreateContact}
            className="px-4 py-2 bg-[var(--green)] text-white text-sm rounded-md hover:opacity-90 whitespace-nowrap">
            + 新建商务
          </button>
        )}
      </div>

      {/* Ranking / Contact list */}
      <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
        <div className="px-3 py-2 bg-[var(--bg)] text-xs font-semibold text-[var(--ink2)]">商务业绩排行</div>
        {ranking.length === 0 && <div className="px-3 py-8 text-center text-xs text-[var(--ink3)]">暂无商务数据</div>}
        {ranking
          .filter((r) => !search.trim() || r.name.toLowerCase().includes(search.trim().toLowerCase()))
          .map((stat, idx) => (
          <div key={stat.name} className="flex items-center px-3 py-3 border-t border-[var(--border2)] cursor-pointer hover:bg-[var(--bg)] transition"
            onClick={() => stat.contact ? openDetail(stat.name) : undefined}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-3
              ${idx === 0 ? 'bg-yellow-100 text-yellow-700' : idx === 1 ? 'bg-gray-100 text-gray-600' : idx === 2 ? 'bg-orange-50 text-orange-600' : 'bg-[var(--bg)] text-[var(--ink3)]'}`}>
              {idx + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-sm">{stat.name}</span>
                {stat.contact && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full
                    ${stat.contact.status === 'active' ? 'bg-[var(--green-bg)] text-[var(--green)]' : 'bg-gray-100 text-gray-500'}`}>
                    {stat.contact.status === 'active' ? '活跃' : '暂停'}
                  </span>
                )}
              </div>
              <div className="text-xs text-[var(--ink3)]">
                本月 {stat.monthOrders}单 ¥{stat.monthRevenue.toLocaleString()} · 累计 {stat.allOrders}单
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium">¥{stat.allRevenue.toLocaleString()}</div>
              <div className="text-[10px]">
                <span className="text-[var(--amber)]">提成 ¥{stat.allCommission.toLocaleString()}</span>
                {stat.unsettled > 0 && <span className="text-[var(--red)] ml-1">未结 ¥{stat.unsettled.toLocaleString()}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Commission rules */}
      <div className="bg-white rounded-lg p-4 border border-[var(--border)]">
        <h3 className="text-xs font-semibold text-[var(--ink2)] mb-2">提成规则说明</h3>
        <div className="text-xs text-[var(--ink3)] space-y-1">
          <p>• 餐饮消费提成：<strong>8%</strong>（次月实收后结算）</p>
          <p>• 储值/年费提成：<strong>10%</strong>（到账后一次性结算）</p>
          <p>• 储值消费不再计提：客户用储值余额消费的部分不给商务提成</p>
          <p>• 提成跟预定走：每笔预定填了谁的名字，这笔的提成就算谁的</p>
          <p>• 散客自来：预定未填介绍人则无提成</p>
          <p>• 旧云集客户：不计提成</p>
        </div>
      </div>

      {/* Create/Edit Contact Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={() => setShowForm(false)}>
          <div className="bg-white w-full max-w-[440px] rounded-t-xl md:rounded-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <h2 className="font-bold text-base">{editingContact ? '编辑商务' : '新建商务'}</h2>
              <button onClick={() => setShowForm(false)} className="text-[var(--ink3)] text-lg">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">姓名 *</span>
                  <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">电话</span>
                  <input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
                </label>
              </div>
              <label className="block">
                <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">合作开始日期</span>
                <input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">备注</span>
                <textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} rows={2}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)] resize-none" />
              </label>
            </div>
            <div className="flex gap-3 px-4 py-3 border-t border-[var(--border)]">
              <button onClick={saveContact} disabled={saving} className="flex-1 py-2.5 text-sm bg-[var(--green)] text-white rounded-lg disabled:opacity-50">
                {saving ? '保存中...' : '保存'}
              </button>
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 text-sm border border-[var(--border)] rounded-lg">取消</button>
            </div>
            {editingContact && can('edit') && (
              <div className="px-4 pb-3 flex justify-between">
                <button onClick={() => { toggleStatus(editingContact); setShowForm(false); }}
                  className="text-xs text-[var(--amber)] hover:underline">
                  {editingContact.status === 'active' ? '标记为暂停' : '标记为活跃'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
