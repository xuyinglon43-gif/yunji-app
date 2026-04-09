'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { VENUES, STATUS_COLORS, ORDER_TYPES, ACTIONS, MEMBER_LEVELS, ALL_SLOTS } from '@/lib/constants';
import { useAuth } from '@/lib/auth';
import { Order, Bill, Member, DEFAULT_DISCOUNTS, PAYMENT_METHODS } from '@/lib/types';
import { softDelete, hardDelete, writeAuditLog } from '@/lib/audit';

interface Props {
  orderId: number;
  onClose: () => void;
  onUpdated: () => void;
}

type Mode = 'detail' | 'edit' | 'bill';

export default function OrderDetailModal({ orderId, onClose, onUpdated }: Props) {
  const { can, roleLabel } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [bill, setBill] = useState<Bill | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [mode, setMode] = useState<Mode>('detail');
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState<Partial<Order>>({});

  // Bill form state
  const [billForm, setBillForm] = useState({
    total: '',
    food_cost: '',
    method: '微信',
    butler: '',
    server: '',
    chef: '',
    stars: 5,
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadOrder(); }, [orderId]);

  const loadOrder = async () => {
    const { data } = await supabase.from('orders').select('*').eq('id', orderId).single();
    if (!data) return;
    setOrder(data);

    // Load bill if paid/settled
    if (data.status === '已收款' || data.status === '已入账') {
      const { data: billData } = await supabase
        .from('bills')
        .select('*')
        .eq('order_id', orderId)
        .single();
      if (billData) setBill(billData);
    }

    // Load member if linked
    if (data.member_id) {
      const { data: memberData } = await supabase
        .from('members')
        .select('*')
        .eq('id', data.member_id)
        .single();
      if (memberData) setMember(memberData);
    }
  };

  if (!order) return null;

  const venueNames = (order.venues || [])
    .map((v) => VENUES.find((vn) => vn.id === v)?.name || v)
    .join(' + ');

  const sc = STATUS_COLORS[order.status] || STATUS_COLORS['待确认'];

  const maskPhone = (phone: string) => {
    if (!phone) return '-';
    if (can('view_full_phone')) return phone;
    if (phone.length >= 7) return phone.slice(0, 3) + '****' + phone.slice(-4);
    return phone;
  };

  // --- Actions ---
  const handleConfirm = async () => {
    await supabase.from('orders').update({ status: '已确认' }).eq('id', orderId);
    onUpdated();
  };

  const handleMarkPendingBill = async () => {
    await supabase.from('orders').update({ status: '待结账' }).eq('id', orderId);
    onUpdated();
  };

  const handleCancel = async () => {
    const reason = prompt('请输入取消原因：');
    if (reason === null) return;
    await supabase
      .from('orders')
      .update({ status: '已取消', cancel_note: reason })
      .eq('id', orderId);
    onUpdated();
  };

  // --- Delete ---
  const handleDelete = async () => {
    if (!confirm('确定要删除这个订单吗？')) return;
    const detail = `删除订单 #${orderId} (${order.client} ${order.date} ${order.slot})`;
    if (can('hard_delete')) {
      // Also delete associated bill
      await supabase.from('bills').delete().eq('order_id', orderId);
      await hardDelete('orders', orderId, roleLabel, detail);
    } else {
      await softDelete('orders', orderId, roleLabel, detail);
    }
    onUpdated();
  };

  // --- Edit ---
  const startEdit = () => {
    setEditForm({
      date: order.date,
      slot: order.slot,
      type: order.type,
      pax: order.pax,
      client: order.client,
      phone: order.phone,
      member_level: order.member_level,
      is_returning: order.is_returning,
      deposit: order.deposit,
      biz_name: order.biz_name,
      action: order.action,
      note: order.note,
    });
    setMode('edit');
  };

  const saveEdit = async () => {
    setSaving(true);
    const pax = editForm.pax || order.pax;
    const discount = DEFAULT_DISCOUNTS[editForm.member_level || order.member_level] || 100;
    const estimated = Math.round(pax * 1000 * (discount / 100));
    await supabase
      .from('orders')
      .update({ ...editForm, estimated })
      .eq('id', orderId);
    await writeAuditLog('orders', orderId, '编辑', `编辑订单 #${orderId} (${editForm.client})`, roleLabel);
    setSaving(false);
    setMode('detail');
    loadOrder();
  };

  // --- Billing ---
  const startBill = () => {
    const defaultFoodCost = order.estimated ? Math.round(order.estimated * 0.33) : 0;
    setBillForm({
      total: '',
      food_cost: defaultFoodCost > 0 ? String(defaultFoodCost) : '',
      method: '微信',
      butler: '',
      server: '',
      chef: '',
      stars: 5,
    });
    setMode('bill');
  };

  const saveBill = async () => {
    const total = parseInt(billForm.total) || 0;
    const food_cost = parseInt(billForm.food_cost) || 0;
    const paid = total - (order.deposit || 0);

    if (total <= 0) return alert('请填写实收金额');

    setSaving(true);

    // If paying by stored value, check and deduct balance
    if (billForm.method === '储值扣减' && member) {
      if (member.balance < paid) {
        setSaving(false);
        return alert(`储值余额不足！当前余额 ¥${member.balance}，需支付 ¥${paid}`);
      }
      await supabase
        .from('members')
        .update({
          balance: member.balance - paid,
          total_spent: (member.total_spent || 0) + paid,
          visits: (member.visits || 0) + 1,
        })
        .eq('id', member.id);
    } else if (order.member_id) {
      // Update member stats even if not stored value
      await supabase
        .from('members')
        .update({
          total_spent: (member?.total_spent || 0) + paid,
          visits: (member?.visits || 0) + 1,
        })
        .eq('id', order.member_id);
    }

    // Calculate commission
    let biz_commission = 0;
    if (order.biz_name && order.member_level !== '云集旧会员') {
      if (billForm.method === '储值扣减') {
        biz_commission = 0; // No commission on stored value consumption
      } else {
        biz_commission = Math.round(paid * 0.08); // 8% on dining
      }
    }

    // Create bill record
    await supabase.from('bills').insert({
      order_id: orderId,
      date: new Date().toISOString().split('T')[0],
      total,
      discount: 100,
      food_cost,
      paid,
      method: billForm.method,
      confirmed: false,
      member_id: order.member_id,
      biz_name: order.biz_name || null,
      biz_commission,
      butler: billForm.butler || null,
      server: billForm.server || null,
      chef: billForm.chef || null,
      stars: billForm.stars,
    });

    // Update order status
    await supabase.from('orders').update({ status: '已收款' }).eq('id', orderId);

    setSaving(false);
    onUpdated();
  };

  const updateEdit = (key: string, value: string | number) => {
    setEditForm((f) => ({ ...f, [key]: value }));
  };

  // Star rating helper
  const renderStars = (count: number, interactive: boolean = false, onChange?: (v: number) => void) => {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={`text-base ${i <= count ? 'text-yellow-500' : 'text-gray-300'} ${interactive ? 'cursor-pointer' : ''}`}
            onClick={() => interactive && onChange?.(i)}
          >
            ★
          </span>
        ))}
      </div>
    );
  };

  // --- EDIT MODE ---
  if (mode === 'edit') {
    return (
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={onClose}>
        <div className="bg-white w-full max-w-[480px] max-h-[90vh] rounded-t-xl md:rounded-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <h2 className="font-bold text-base">编辑订单</h2>
            <button onClick={() => setMode('detail')} className="text-[var(--ink3)] text-lg">✕</button>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">日期</span>
                <input type="date" value={editForm.date || ''} onChange={(e) => updateEdit('date', e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">时段</span>
                <select value={editForm.slot || ''} onChange={(e) => updateEdit('slot', e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]">
                  {ALL_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">类别</span>
                <select value={editForm.type || ''} onChange={(e) => updateEdit('type', e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]">
                  {ORDER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">人数</span>
                <input type="number" min="1" value={editForm.pax || ''} onChange={(e) => updateEdit('pax', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">客户姓名</span>
                <input type="text" value={editForm.client || ''} onChange={(e) => updateEdit('client', e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">电话</span>
                <input type="tel" value={editForm.phone || ''} onChange={(e) => updateEdit('phone', e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="block">
                <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">会员类型</span>
                <select value={editForm.member_level || ''} onChange={(e) => updateEdit('member_level', e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]">
                  {MEMBER_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">新/老客</span>
                <select value={editForm.is_returning || ''} onChange={(e) => updateEdit('is_returning', e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]">
                  <option value="">-</option>
                  <option value="新客">新客</option>
                  <option value="老客">老客</option>
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">定金</span>
                <input type="number" min="0" value={editForm.deposit ?? ''} onChange={(e) => updateEdit('deposit', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">介绍人/商务</span>
                <input type="text" value={editForm.biz_name || ''} onChange={(e) => updateEdit('biz_name', e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">行为</span>
                <select value={editForm.action || ''} onChange={(e) => updateEdit('action', e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]">
                  {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">备注</span>
              <textarea value={editForm.note || ''} onChange={(e) => updateEdit('note', e.target.value)} rows={2}
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)] resize-none" />
            </label>
          </div>
          <div className="flex gap-3 px-4 py-3 border-t border-[var(--border)]">
            <button onClick={saveEdit} disabled={saving} className="flex-1 py-2.5 text-sm bg-[var(--green)] text-white rounded-lg hover:opacity-90 transition disabled:opacity-50">
              {saving ? '保存中...' : '保存修改'}
            </button>
            <button onClick={() => setMode('detail')} className="flex-1 py-2.5 text-sm border border-[var(--border)] rounded-lg hover:bg-[var(--bg)] transition">取消</button>
          </div>
        </div>
      </div>
    );
  }

  // --- BILL MODE ---
  if (mode === 'bill') {
    const total = parseInt(billForm.total) || 0;
    const finalPaid = total - (order.deposit || 0);

    return (
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={onClose}>
        <div className="bg-white w-full max-w-[480px] max-h-[90vh] rounded-t-xl md:rounded-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <h2 className="font-bold text-base">结账收款 — {order.client}</h2>
            <button onClick={() => setMode('detail')} className="text-[var(--ink3)] text-lg">✕</button>
          </div>
          <div className="p-4 space-y-3">
            {/* Amount section */}
            {order.estimated > 0 && (
              <div className="bg-[var(--bg)] rounded-md px-3 py-2 text-xs text-[var(--ink3)]">
                套餐预计总价：¥{order.estimated.toLocaleString()} · 食材成本已按33%自动填入
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">实收金额 *</span>
                <input type="number" min="0" value={billForm.total}
                  onChange={(e) => setBillForm((f) => ({ ...f, total: e.target.value }))}
                  placeholder="账单上的最终金额"
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" autoFocus />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">收款方式</span>
                <select value={billForm.method}
                  onChange={(e) => setBillForm((f) => ({ ...f, method: e.target.value }))}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]">
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">食材成本（默认套餐价×33%，可修改）</span>
              <input type="number" min="0" value={billForm.food_cost}
                onChange={(e) => setBillForm((f) => ({ ...f, food_cost: e.target.value }))}
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
            </label>

            {/* Summary */}
            <div className="bg-[var(--bg)] rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-[var(--ink3)]">实收金额</span>
                <span>¥{total.toLocaleString()}</span>
              </div>
              {order.deposit > 0 && (
                <div className="flex justify-between">
                  <span className="text-[var(--ink3)]">已收定金</span>
                  <span className="text-[var(--green)]">-¥{order.deposit.toLocaleString()}</span>
                </div>
              )}
              {order.deposit > 0 && (
                <div className="flex justify-between font-bold border-t border-[var(--border)] pt-1 mt-1">
                  <span>还需收款</span>
                  <span className="text-[var(--green)]">¥{Math.max(0, finalPaid).toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* Stored value warning */}
            {billForm.method === '储值扣减' && member && (
              <div className={`text-xs p-2 rounded-md ${member.balance >= finalPaid ? 'bg-[var(--green-bg)] text-[var(--green)]' : 'bg-[var(--red-bg)] text-[var(--red)]'}`}>
                当前储值余额: ¥{member.balance.toLocaleString()}
                {member.balance < finalPaid && '，余额不足！'}
              </div>
            )}

            {/* Service record */}
            <div className="border-t border-[var(--border)] pt-3 mt-3">
              <h3 className="text-xs font-semibold text-[var(--ink2)] mb-2">服务记录</h3>
              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">管家</span>
                  <input type="text" value={billForm.butler}
                    onChange={(e) => setBillForm((f) => ({ ...f, butler: e.target.value }))}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">服务员</span>
                  <input type="text" value={billForm.server}
                    onChange={(e) => setBillForm((f) => ({ ...f, server: e.target.value }))}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">厨师</span>
                  <input type="text" value={billForm.chef}
                    onChange={(e) => setBillForm((f) => ({ ...f, chef: e.target.value }))}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
                </label>
              </div>
              <div className="mt-2">
                <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">满意度</span>
                {renderStars(billForm.stars, true, (v) => setBillForm((f) => ({ ...f, stars: v })))}
              </div>
            </div>
          </div>
          <div className="flex gap-3 px-4 py-3 border-t border-[var(--border)]">
            <button onClick={saveBill} disabled={saving} className="flex-1 py-2.5 text-sm bg-[var(--purple)] text-white rounded-lg hover:opacity-90 transition disabled:opacity-50">
              {saving ? '处理中...' : '确认结账'}
            </button>
            <button onClick={() => setMode('detail')} className="flex-1 py-2.5 text-sm border border-[var(--border)] rounded-lg hover:bg-[var(--bg)] transition">取消</button>
          </div>
        </div>
      </div>
    );
  }

  // --- DETAIL MODE ---
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white w-full max-w-[480px] max-h-[90vh] rounded-t-xl md:rounded-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-base">{order.client}</h2>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${sc.bg} ${sc.text} ${sc.border}`}>
              {order.status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {can('edit') && (order.status === '待确认' || order.status === '已确认' || order.status === '待结账') && (
              <button onClick={startEdit} className="text-xs text-[var(--blue)] hover:underline">编辑</button>
            )}
            {can('edit') && (order.status === '已确认' || order.status === '待结账') && (
              <button onClick={startBill} className="text-xs text-[var(--purple)] hover:underline">结账</button>
            )}
            {can('edit') && (
              <button onClick={handleDelete} className="text-xs text-[var(--red)] hover:underline">删除</button>
            )}
            <button onClick={onClose} className="text-[var(--ink3)] text-lg">✕</button>
          </div>
        </div>

        {/* Detail */}
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <div><span className="text-[var(--ink3)] text-xs">日期</span><p>{order.date}</p></div>
            <div><span className="text-[var(--ink3)] text-xs">时段</span><p>{order.slot}</p></div>
            <div><span className="text-[var(--ink3)] text-xs">场地</span><p>{venueNames}</p></div>
            <div><span className="text-[var(--ink3)] text-xs">人数</span><p>{order.pax}人</p></div>
            <div><span className="text-[var(--ink3)] text-xs">类别</span><p>{order.type}</p></div>
            <div><span className="text-[var(--ink3)] text-xs">行为</span><p>{order.action}</p></div>
            <div><span className="text-[var(--ink3)] text-xs">电话</span><p>{maskPhone(order.phone)}</p></div>
            <div><span className="text-[var(--ink3)] text-xs">会员等级</span><p>{order.member_level}</p></div>
            {order.deposit > 0 && (
              <div><span className="text-[var(--ink3)] text-xs">定金</span><p>¥{order.deposit.toLocaleString()}</p></div>
            )}
            {order.biz_name && (
              <div><span className="text-[var(--ink3)] text-xs">介绍人/商务</span><p>{order.biz_name}</p></div>
            )}
            {order.estimated > 0 && (
              <div><span className="text-[var(--ink3)] text-xs">预估收入</span><p>¥{order.estimated.toLocaleString()}</p></div>
            )}
          </div>

          {order.note && (
            <div className="text-sm">
              <span className="text-[var(--ink3)] text-xs">备注</span>
              <p className="mt-0.5">{order.note}</p>
            </div>
          )}

          {/* Member info box */}
          {member && (
            <div className="bg-[var(--purple-bg)] rounded-lg p-3 text-sm">
              <div className="font-medium text-[var(--purple)] text-xs mb-1">会员信息</div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <span>等级: {member.level}</span>
                <span>折扣: {member.discount}%</span>
                <span>储值余额: ¥{member.balance.toLocaleString()}</span>
                {member.old_debt > 0 && <span>旧债: ¥{member.old_debt.toLocaleString()}</span>}
              </div>
            </div>
          )}

          {/* Cancel reason */}
          {order.status === '已取消' && order.cancel_note && (
            <div className="p-3 bg-[var(--red-bg)] rounded-lg text-sm">
              <span className="text-[var(--red)] text-xs font-medium">取消原因</span>
              <p className="text-[var(--red)] mt-0.5">{order.cancel_note}</p>
            </div>
          )}

          {/* Bill details (for paid/settled) */}
          {bill && (
            <div className="bg-[var(--bg)] rounded-lg p-3 text-sm space-y-1">
              <div className="font-medium text-xs text-[var(--ink2)] mb-1">结账详情</div>
              <div className="flex justify-between"><span className="text-[var(--ink3)]">消费金额</span><span>¥{bill.total.toLocaleString()}</span></div>
              {bill.discount < 100 && <div className="flex justify-between"><span className="text-[var(--ink3)]">折扣</span><span>{bill.discount}%</span></div>}
              <div className="flex justify-between"><span className="text-[var(--ink3)]">实收金额</span><span className="font-medium">¥{bill.paid.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-[var(--ink3)]">收款方式</span><span>{bill.method}</span></div>
              {bill.food_cost > 0 && <div className="flex justify-between"><span className="text-[var(--ink3)]">食材成本</span><span>¥{bill.food_cost.toLocaleString()}</span></div>}
              {(bill.butler || bill.server || bill.chef) && (
                <div className="border-t border-[var(--border)] pt-1 mt-1">
                  {bill.butler && <div className="flex justify-between"><span className="text-[var(--ink3)]">管家</span><span>{bill.butler}</span></div>}
                  {bill.server && <div className="flex justify-between"><span className="text-[var(--ink3)]">服务员</span><span>{bill.server}</span></div>}
                  {bill.chef && <div className="flex justify-between"><span className="text-[var(--ink3)]">厨师</span><span>{bill.chef}</span></div>}
                </div>
              )}
              {bill.stars && (
                <div className="flex justify-between items-center">
                  <span className="text-[var(--ink3)]">满意度</span>
                  {renderStars(bill.stars)}
                </div>
              )}
              {bill.confirmed && (
                <div className="text-[var(--blue)] text-xs mt-1 font-medium">✓ 已入账 {bill.confirmed_at?.split('T')[0]}</div>
              )}
            </div>
          )}
        </div>

        {/* Actions based on status */}
        {can('edit') && (order.status === '待确认' || order.status === '已确认' || order.status === '待结账') && (
          <div className="flex gap-2 px-4 py-3 border-t border-[var(--border)]">
            {order.status === '待确认' && (
              <button onClick={handleConfirm}
                className="flex-1 py-2.5 text-sm bg-[var(--green)] text-white rounded-lg hover:opacity-90 transition">
                确认预定
              </button>
            )}
            {order.status === '已确认' && (
              <button onClick={handleMarkPendingBill}
                className="flex-1 py-2.5 text-sm bg-[#FF8C42] text-white rounded-lg hover:opacity-90 transition">
                服务已结束
              </button>
            )}
            {order.status === '待结账' && (
              <button onClick={startBill}
                className="flex-1 py-2.5 text-sm bg-[var(--purple)] text-white rounded-lg hover:opacity-90 transition">
                去结账
              </button>
            )}
            <button onClick={handleCancel}
              className="flex-1 py-2.5 text-sm border border-[var(--red-border)] text-[var(--red)] rounded-lg hover:bg-[var(--red-bg)] transition">
              取消订单
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
