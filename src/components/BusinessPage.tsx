'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Bill, BusinessContact, BizSettlement, Order } from '@/lib/types';

type View = 'list' | 'detail' | 'rules';

// 提成规则类型
interface CommissionRules {
  mode: 'fixed' | 'tiered' | 'threshold';
  fixedRate: number;               // 固定比例 (%)
  threshold: number;               // 门槛金额（低于此金额不计提）
  tiers: { min: number; max: number; rate: number }[]; // 阶梯
  storedValueRate: number;         // 储值/年费提成比例 (%)
  storedValueConsumptionRate: number; // 储值消费提成 (%)
  settleCycle: 'monthly' | 'quarterly' | 'manual'; // 结算周期
}

const DEFAULT_RULES: CommissionRules = {
  mode: 'threshold',
  fixedRate: 8,
  threshold: 700000,
  tiers: [
    { min: 0, max: 500000, rate: 5 },
    { min: 500000, max: 1000000, rate: 8 },
    { min: 1000000, max: Infinity, rate: 10 },
  ],
  storedValueRate: 10,
  storedValueConsumptionRate: 0,
  settleCycle: 'monthly',
};

function loadRules(): CommissionRules {
  try {
    const saved = localStorage.getItem('yunji_biz_commission_rules');
    if (saved) return { ...DEFAULT_RULES, ...JSON.parse(saved) };
  } catch { /* ignore */ }
  return DEFAULT_RULES;
}

function saveRules(rules: CommissionRules) {
  localStorage.setItem('yunji_biz_commission_rules', JSON.stringify(rules));
}

// 根据规则计算提成
function calcCommission(revenue: number, rules: CommissionRules): number {
  switch (rules.mode) {
    case 'fixed':
      return Math.round(revenue * rules.fixedRate / 100);
    case 'threshold':
      if (revenue < rules.threshold) return 0;
      return Math.round(revenue * rules.fixedRate / 100);
    case 'tiered': {
      let commission = 0;
      let remaining = revenue;
      for (const tier of rules.tiers) {
        if (remaining <= 0) break;
        const tierRange = (tier.max === Infinity ? remaining : tier.max - tier.min);
        const applicable = Math.min(remaining, tierRange);
        commission += applicable * tier.rate / 100;
        remaining -= applicable;
      }
      return Math.round(commission);
    }
    default:
      return 0;
  }
}

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
  const [rules, setRules] = useState<CommissionRules>(DEFAULT_RULES);
  const [periodFilter, setPeriodFilter] = useState<'month' | 'quarter' | 'all'>('month');
  const [bizOrders, setBizOrders] = useState<Order[]>([]);
  const [allBizOrders, setAllBizOrders] = useState<Order[]>([]);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const thisQuarterStart = useMemo(() => {
    const now = new Date();
    const q = Math.floor(now.getMonth() / 3) * 3;
    return `${now.getFullYear()}-${String(q + 1).padStart(2, '0')}-01`;
  }, []);

  useEffect(() => { setRules(loadRules()); }, []);

  const fetchData = async () => {
    const { data: mb } = await supabase
      .from('bills').select('*, orders(client, type, biz_name, date)')
      .gte('date', thisMonth + '-01').eq('confirmed', true).is('deleted_at', null);
    const mapBill = (b: Record<string, unknown>) => {
      const ord = b.orders as Record<string, string> | null;
      return { ...b, order_client: ord?.client || '', order_type: ord?.type || '', order_date: ord?.date || '', biz_name: b.biz_name || ord?.biz_name || '' };
    };
    setBills((mb || []).map(mapBill) as typeof bills);

    const { data: ab } = await supabase
      .from('bills').select('*, orders(client, type, biz_name, date)')
      .eq('confirmed', true).is('deleted_at', null);
    setAllBills((ab || []).map(mapBill) as typeof bills);

    const { data: c } = await supabase
      .from('business_contacts').select('*').is('deleted_at', null).order('name');
    setContacts(c || []);

    const { data: s } = await supabase
      .from('biz_settlements').select('*').order('settled_at', { ascending: false });
    setSettlements(s || []);

    // 加载关联商务的订单（用于显示预定数）
    const { data: mo } = await supabase
      .from('orders').select('*')
      .not('biz_name', 'is', null)
      .neq('biz_name', '')
      .is('deleted_at', null)
      .neq('status', '已取消')
      .gte('date', thisMonth + '-01');
    setBizOrders(mo || []);

    const { data: ao } = await supabase
      .from('orders').select('*')
      .not('biz_name', 'is', null)
      .neq('biz_name', '')
      .is('deleted_at', null)
      .neq('status', '已取消');
    setAllBizOrders(ao || []);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, []);

  // 根据筛选期间过滤账单
  const periodBills = useMemo(() => {
    if (periodFilter === 'all') return allBills;
    if (periodFilter === 'quarter') return allBills.filter((b) => b.date >= thisQuarterStart);
    return bills;
  }, [periodFilter, bills, allBills, thisQuarterStart]);

  // 根据筛选期间过滤订单
  const periodOrders = useMemo(() => {
    if (periodFilter === 'all') return allBizOrders;
    if (periodFilter === 'quarter') return allBizOrders.filter((o) => o.date >= thisQuarterStart);
    return bizOrders;
  }, [periodFilter, bizOrders, allBizOrders, thisQuarterStart]);

  const aggregateBills = (billList: typeof bills) => {
    const map = new Map<string, { billedOrders: number; clients: Set<string>; revenue: number; commission: number }>();
    for (const b of billList) {
      if (!b.biz_name) continue;
      let s = map.get(b.biz_name);
      if (!s) { s = { billedOrders: 0, clients: new Set(), revenue: 0, commission: 0 }; map.set(b.biz_name, s); }
      s.billedOrders++; if (b.order_client) s.clients.add(b.order_client);
      s.revenue += b.paid; s.commission += b.biz_commission;
    }
    return map;
  };

  // 从订单统计预定数
  const aggregateOrders = (orderList: Order[]) => {
    const map = new Map<string, { orderCount: number; clients: Set<string>; estimatedRevenue: number }>();
    for (const o of orderList) {
      if (!o.biz_name) continue;
      let s = map.get(o.biz_name);
      if (!s) { s = { orderCount: 0, clients: new Set(), estimatedRevenue: 0 }; map.set(o.biz_name, s); }
      s.orderCount++;
      s.clients.add(o.client);
      s.estimatedRevenue += o.estimated || 0;
    }
    return map;
  };

  const periodBillStats = useMemo(() => aggregateBills(periodBills), [periodBills]);
  const allTimeBillStats = useMemo(() => aggregateBills(allBills), [allBills]);
  const periodOrderStats = useMemo(() => aggregateOrders(periodOrders), [periodOrders]);
  const allTimeOrderStats = useMemo(() => aggregateOrders(allBizOrders), [allBizOrders]);

  const totalPeriodRevenue = useMemo(() => {
    let sum = 0;
    periodBillStats.forEach((v) => { sum += v.revenue; });
    return sum;
  }, [periodBillStats]);
  const totalPeriodEstimated = useMemo(() => {
    let sum = 0;
    periodOrderStats.forEach((v) => { sum += v.estimatedRevenue; });
    return sum;
  }, [periodOrderStats]);
  const totalPeriodCommission = useMemo(() => {
    let sum = 0;
    periodBillStats.forEach((v) => { sum += calcCommission(v.revenue, rules); });
    return sum;
  }, [periodBillStats, rules]);
  const totalAllRevenue = useMemo(() => {
    let sum = 0;
    allTimeBillStats.forEach((v) => { sum += v.revenue; });
    return sum;
  }, [allTimeBillStats]);
  const totalSettled = useMemo(() => settlements.reduce((s, v) => s + v.amount, 0), [settlements]);

  const ranking = useMemo(() => {
    const names = new Set<string>();
    contacts.forEach((c) => names.add(c.name));
    periodBillStats.forEach((_, k) => names.add(k));
    allTimeBillStats.forEach((_, k) => names.add(k));
    periodOrderStats.forEach((_, k) => names.add(k));
    allTimeOrderStats.forEach((_, k) => names.add(k));
    return Array.from(names).map((name) => {
      const pbs = periodBillStats.get(name);
      const abs = allTimeBillStats.get(name);
      const pos = periodOrderStats.get(name);
      const aos = allTimeOrderStats.get(name);
      const contact = contacts.find((c) => c.name === name);
      const settled = settlements.filter((s) => s.biz_name === name).reduce((sum, s) => sum + s.amount, 0);
      const periodRevenue = pbs?.revenue || 0;
      const periodCommission = calcCommission(periodRevenue, rules);
      return {
        name,
        contact,
        periodRevenue,
        periodCommission,
        periodOrders: pos?.orderCount || 0,
        periodBilledOrders: pbs?.billedOrders || 0,
        periodEstimated: pos?.estimatedRevenue || 0,
        allRevenue: abs?.revenue || 0,
        allCommission: abs?.commission || 0,
        allOrders: aos?.orderCount || 0,
        allBilledOrders: abs?.billedOrders || 0,
        settled,
        unsettled: (abs?.commission || 0) - settled,
        reachedThreshold: rules.mode !== 'threshold' || periodRevenue >= rules.threshold,
      };
    }).sort((a, b) => (b.periodOrders + b.periodBilledOrders) - (a.periodOrders + a.periodBilledOrders) || b.periodRevenue - a.periodRevenue);
  }, [periodBillStats, allTimeBillStats, periodOrderStats, allTimeOrderStats, contacts, settlements, rules]);

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
    const contactData = { name: form.name.trim(), phone: form.phone, start_date: form.start_date || null, note: form.note };
    // 立即关闭弹窗
    setShowForm(false);
    // 后台写入
    if (editingContact) {
      supabase.from('business_contacts').update(contactData).eq('id', editingContact.id).then(() => fetchData());
    } else {
      supabase.from('business_contacts').insert({ ...contactData, status: 'active' }).then(() => fetchData());
    }
  };

  const toggleStatus = async (c: BusinessContact) => {
    await supabase.from('business_contacts').update({
      status: c.status === 'active' ? 'paused' : 'active',
    }).eq('id', c.id);
    fetchData();
  };

  // --- Settlement ---
  const openSettle = () => { setSettleAmount(''); setSettleNote(''); setShowSettle(true); };

  const doSettle = async () => {
    if (!selectedContact) return;
    const amount = parseInt(settleAmount) || 0;
    if (amount <= 0) return alert('请填写结算金额');
    // 立即关闭弹窗
    setShowSettle(false);
    // 后台写入
    supabase.from('biz_settlements').insert({
      biz_contact_id: selectedContact.id,
      biz_name: selectedContact.name,
      amount,
      settled_at: new Date().toISOString(),
      settled_by: roleLabel,
      note: settleNote,
    }).then(() => fetchData());
  };

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

  const detailOrders = useMemo(() => {
    if (!selectedContact) return [];
    return allBizOrders.filter((o) => o.biz_name === selectedContact.name);
  }, [selectedContact, allBizOrders]);

  const detailTotalCommission = detailBills.reduce((s, b) => s + b.biz_commission, 0);
  const detailTotalSettled = detailSettlements.reduce((s, v) => s + v.amount, 0);

  const fmtTime = (ts: string) => ts ? ts.split('T')[0] : '';

  const periodLabel = periodFilter === 'month' ? '本月' : periodFilter === 'quarter' ? '本季度' : '累计';

  // =========== RULES VIEW ===========
  if (view === 'rules') {
    return (
      <div className="flex flex-col h-full overflow-y-auto p-3 space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setView('list')} className="text-xs text-[var(--blue)] hover:underline">← 返回列表</button>
          <h2 className="font-bold text-base">提成规则配置</h2>
        </div>

        <div className="bg-white rounded-lg p-4 border border-[var(--border)] space-y-4">
          {/* 计算模式 */}
          <div>
            <span className="text-[11px] font-medium text-[var(--ink2)] mb-2 block">计算模式</span>
            <div className="flex gap-2">
              {[
                { id: 'fixed' as const, label: '固定比例', desc: '所有收入按固定比例计提' },
                { id: 'threshold' as const, label: '门槛模式', desc: '月收入达标后才计提' },
                { id: 'tiered' as const, label: '阶梯模式', desc: '按收入区间不同比例' },
              ].map((m) => (
                <button key={m.id} onClick={() => setRules((r) => ({ ...r, mode: m.id }))}
                  className={`flex-1 p-3 rounded-lg border text-left transition
                    ${rules.mode === m.id ? 'border-[var(--green)] bg-[var(--green-bg)]' : 'border-[var(--border)] hover:bg-[var(--bg)]'}`}>
                  <div className="text-sm font-medium">{m.label}</div>
                  <div className="text-[10px] text-[var(--ink3)] mt-0.5">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 固定比例 */}
          {(rules.mode === 'fixed' || rules.mode === 'threshold') && (
            <label className="block">
              <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">提成比例 (%)</span>
              <input type="number" min="0" max="100" value={rules.fixedRate}
                onChange={(e) => setRules((r) => ({ ...r, fixedRate: parseInt(e.target.value) || 0 }))}
                className="w-full max-w-[200px] px-3 py-2 border border-[var(--border)] rounded-md text-sm" />
            </label>
          )}

          {/* 门槛 */}
          {rules.mode === 'threshold' && (
            <label className="block">
              <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">月收入门槛 (元)</span>
              <input type="number" min="0" value={rules.threshold}
                onChange={(e) => setRules((r) => ({ ...r, threshold: parseInt(e.target.value) || 0 }))}
                className="w-full max-w-[200px] px-3 py-2 border border-[var(--border)] rounded-md text-sm" />
              <span className="text-[10px] text-[var(--ink3)] mt-1 block">商务月收入低于此金额时不计提成</span>
            </label>
          )}

          {/* 阶梯 */}
          {rules.mode === 'tiered' && (
            <div>
              <span className="text-[11px] font-medium text-[var(--ink2)] mb-2 block">阶梯规则</span>
              {rules.tiers.map((tier, idx) => (
                <div key={idx} className="flex items-center gap-2 mb-2">
                  <input type="number" min="0" value={tier.min} onChange={(e) => {
                    const tiers = [...rules.tiers];
                    tiers[idx] = { ...tiers[idx], min: parseInt(e.target.value) || 0 };
                    setRules((r) => ({ ...r, tiers }));
                  }} className="w-24 px-2 py-1 border border-[var(--border)] rounded text-xs" placeholder="起" />
                  <span className="text-xs text-[var(--ink3)]">~</span>
                  <input type="number" min="0" value={tier.max === Infinity ? '' : tier.max} onChange={(e) => {
                    const tiers = [...rules.tiers];
                    tiers[idx] = { ...tiers[idx], max: e.target.value ? parseInt(e.target.value) : Infinity };
                    setRules((r) => ({ ...r, tiers }));
                  }} className="w-24 px-2 py-1 border border-[var(--border)] rounded text-xs" placeholder="无上限" />
                  <span className="text-xs">→</span>
                  <input type="number" min="0" max="100" value={tier.rate} onChange={(e) => {
                    const tiers = [...rules.tiers];
                    tiers[idx] = { ...tiers[idx], rate: parseInt(e.target.value) || 0 };
                    setRules((r) => ({ ...r, tiers }));
                  }} className="w-16 px-2 py-1 border border-[var(--border)] rounded text-xs" />
                  <span className="text-xs">%</span>
                  <button onClick={() => {
                    const tiers = rules.tiers.filter((_, i) => i !== idx);
                    setRules((r) => ({ ...r, tiers }));
                  }} className="text-[var(--red)] text-xs">删除</button>
                </div>
              ))}
              <button onClick={() => {
                const last = rules.tiers[rules.tiers.length - 1];
                setRules((r) => ({ ...r, tiers: [...r.tiers, { min: last?.max === Infinity ? 0 : (last?.max || 0), max: Infinity, rate: 10 }] }));
              }} className="text-[11px] text-[var(--green)] hover:underline">+ 添加阶梯</button>
            </div>
          )}

          {/* 储值提成 */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">储值/年费提成 (%)</span>
              <input type="number" min="0" max="100" value={rules.storedValueRate}
                onChange={(e) => setRules((r) => ({ ...r, storedValueRate: parseInt(e.target.value) || 0 }))}
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm" />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">储值消费提成 (%)</span>
              <input type="number" min="0" max="100" value={rules.storedValueConsumptionRate}
                onChange={(e) => setRules((r) => ({ ...r, storedValueConsumptionRate: parseInt(e.target.value) || 0 }))}
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm" />
              <span className="text-[10px] text-[var(--ink3)] mt-1 block">客户用储值余额消费时的提成比例</span>
            </label>
          </div>

          {/* 保存 */}
          <button onClick={() => { saveRules(rules); setView('list'); }}
            className="px-6 py-2.5 bg-[var(--green)] text-white text-sm rounded-lg hover:opacity-90 transition">
            保存规则
          </button>
        </div>
      </div>
    );
  }

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

        <div className="bg-white rounded-lg p-4 border border-[var(--border)] grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-[var(--ink3)] text-xs">电话</span><p>{selectedContact.phone || '-'}</p></div>
          <div><span className="text-[var(--ink3)] text-xs">合作开始</span><p>{selectedContact.start_date || '-'}</p></div>
          {selectedContact.note && <div className="col-span-2"><span className="text-[var(--ink3)] text-xs">备注</span><p>{selectedContact.note}</p></div>}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg p-3 border border-[var(--border)]">
            <div className="text-xs text-[var(--ink3)]">累计预定</div>
            <div className="text-lg font-bold mt-1">{detailOrders.length}单</div>
          </div>
          <div className="bg-white rounded-lg p-3 border border-[var(--border)]">
            <div className="text-xs text-[var(--ink3)]">已结账</div>
            <div className="text-lg font-bold text-[var(--blue)] mt-1">{detailBills.length}单</div>
          </div>
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

        {can('settle_commission') && (
          <button onClick={openSettle}
            className="px-4 py-2 bg-[var(--green)] text-white text-sm rounded-md hover:opacity-90 transition self-start">
            结算提成
          </button>
        )}

        {/* 预定记录 */}
        {detailOrders.length > 0 && (
          <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
            <div className="px-3 py-2 bg-[var(--bg)] text-xs font-semibold text-[var(--ink2)]">
              预定记录（{detailOrders.length}单）
            </div>
            {detailOrders.map((o) => (
              <div key={o.id} className="px-3 py-2 border-t border-[var(--border2)] text-sm">
                <div className="flex justify-between">
                  <div>
                    <span className="font-medium">{o.client}</span>
                    <span className="text-xs text-[var(--ink3)] ml-2">{o.date} · {o.slot} · {o.pax}人</span>
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full
                    ${o.status === '待确认' ? 'bg-[#FFF3CD] text-[#856404]'
                    : o.status === '已确认' ? 'bg-[#D4EDDA] text-[#155724]'
                    : o.status === '已收款' ? 'bg-[#E8D5F5] text-[#6F42C1]'
                    : o.status === '已入账' ? 'bg-[#CCE5FF] text-[#004085]'
                    : 'bg-gray-100 text-gray-500'}`}>
                    {o.status}
                  </span>
                </div>
                {o.estimated > 0 && (
                  <div className="text-xs text-[var(--ink3)] mt-0.5">预估 ¥{o.estimated.toLocaleString()}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 结账明细 */}
        <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
          <div className="px-3 py-2 bg-[var(--bg)] text-xs font-semibold text-[var(--ink2)]">
            结账明细（{detailBills.length}笔）
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
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">备注</span>
                  <input type="text" value={settleNote} onChange={(e) => setSettleNote(e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm" />
                </label>
              </div>
              <div className="flex gap-3 px-4 py-3 border-t border-[var(--border)]">
                <button onClick={doSettle} className="flex-1 py-2.5 text-sm bg-[var(--green)] text-white rounded-lg disabled:opacity-50">
                  确认结算
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
      {/* 期间筛选 + 操作按钮 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {[
            { id: 'month' as const, label: '本月' },
            { id: 'quarter' as const, label: '本季度' },
            { id: 'all' as const, label: '累计' },
          ].map((p) => (
            <button key={p.id} onClick={() => setPeriodFilter(p.id)}
              className={`px-3 py-1.5 text-xs rounded-md border transition
                ${periodFilter === p.id ? 'bg-[var(--green)] text-white border-[var(--green)]'
                  : 'bg-white text-[var(--ink2)] border-[var(--border)] hover:bg-[var(--bg)]'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {can('approve') && (
            <button onClick={() => setView('rules')}
              className="px-3 py-1.5 text-xs border border-[var(--border)] rounded-md text-[var(--ink2)] hover:bg-[var(--bg)] transition">
              提成规则
            </button>
          )}
          {can('edit') && (
            <button onClick={openCreateContact}
              className="px-3 py-1.5 text-xs bg-[var(--green)] text-white rounded-md hover:opacity-90">
              + 新建商务
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg p-3 border border-[var(--border)]">
          <div className="text-[10px] text-[var(--ink3)]">{periodLabel}商务收入（已结账）</div>
          <div className="text-lg font-bold text-[var(--green)] mt-1">¥{totalPeriodRevenue.toLocaleString()}</div>
          {totalPeriodEstimated > 0 && totalPeriodEstimated !== totalPeriodRevenue && (
            <div className="text-[10px] text-[var(--ink3)] mt-0.5">预估 ¥{totalPeriodEstimated.toLocaleString()}</div>
          )}
        </div>
        <div className="bg-white rounded-lg p-3 border border-[var(--border)]">
          <div className="text-[10px] text-[var(--ink3)]">{periodLabel}应付提成</div>
          <div className="text-lg font-bold text-[var(--amber)] mt-1">¥{totalPeriodCommission.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-lg p-3 border border-[var(--border)]">
          <div className="text-[10px] text-[var(--ink3)]">累计商务收入</div>
          <div className="text-lg font-bold text-[var(--green)] mt-1">¥{totalAllRevenue.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-lg p-3 border border-[var(--border)]">
          <div className="text-[10px] text-[var(--ink3)]">累计已结算</div>
          <div className="text-lg font-bold text-[var(--green)] mt-1">¥{totalSettled.toLocaleString()}</div>
        </div>
      </div>

      {/* 当前规则提示 */}
      <div className="bg-[var(--bg)] rounded-lg px-3 py-2 text-[11px] text-[var(--ink3)]">
        当前规则：{rules.mode === 'fixed' ? `固定 ${rules.fixedRate}%` : rules.mode === 'threshold' ? `月收入 ≥¥${rules.threshold.toLocaleString()} 后按 ${rules.fixedRate}% 计提` : '阶梯模式'}
        {rules.storedValueConsumptionRate === 0 && ' · 储值消费不计提'}
      </div>

      {/* Search */}
      <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="搜索商务姓名..."
        className="px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />

      {/* Ranking */}
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
                {!stat.reachedThreshold && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--amber-bg)] text-[var(--amber)]">
                    未达标
                  </span>
                )}
              </div>
              <div className="text-xs text-[var(--ink3)]">
                {periodLabel} {stat.periodOrders}单预定{stat.periodBilledOrders > 0 ? ` · ${stat.periodBilledOrders}单已结账 ¥${stat.periodRevenue.toLocaleString()}` : stat.periodEstimated > 0 ? ` · 预估 ¥${stat.periodEstimated.toLocaleString()}` : ''} · 累计 {stat.allOrders}单
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
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">电话</span>
                  <input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm" />
                </label>
              </div>
              <label className="block">
                <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">合作开始日期</span>
                <input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm" />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">备注</span>
                <textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} rows={2}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm resize-none" />
              </label>
            </div>
            <div className="flex gap-3 px-4 py-3 border-t border-[var(--border)]">
              <button onClick={saveContact} className="flex-1 py-2.5 text-sm bg-[var(--green)] text-white rounded-lg disabled:opacity-50">
                保存
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
