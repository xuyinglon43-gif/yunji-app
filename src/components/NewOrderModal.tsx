'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { VENUES, ORDER_TYPES, ACTIONS, MEMBER_LEVELS, ALL_SLOTS } from '@/lib/constants';

interface Props {
  date: string;
  slot: string;
  venueId: string;
  onClose: () => void;
  onSaved: () => void;
}

interface Member {
  id: number;
  name: string;
  phone: string;
  level: string;
  discount: number;
  balance: number;
}

const DEFAULT_DISCOUNTS: Record<string, number> = {
  '散客': 100,
  '逢吉': 100,
  '承吉': 88,
  '享吉': 75,
  '开吉': 60,
  '云集旧会员': 100,
  '股东': 60,
};

export default function NewOrderModal({ date, slot, venueId, onClose, onSaved }: Props) {
  const venue = VENUES.find((v) => v.id === venueId);

  const [form, setForm] = useState({
    date,
    slot,
    type: '餐饮' as string,
    pax: '' as string,
    client: '',
    phone: '',
    member_level: '散客',
    deposit: '',
    biz_name: '',
    action: '吃饭',
    note: '',
  });

  const [memberSuggestions, setMemberSuggestions] = useState<Member[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [bizSuggestions, setBizSuggestions] = useState<{ id: number; name: string; phone: string }[]>([]);
  const [saving, setSaving] = useState(false);

  // Member autocomplete
  useEffect(() => {
    const q = form.client.trim();
    if (q.length < 1) {
      setMemberSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('members')
        .select('id, name, phone, level, discount, balance')
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(5);
      if (data) setMemberSuggestions(data);
    }, 200);
    return () => clearTimeout(timer);
  }, [form.client]);

  // 商务联系人自动推荐
  useEffect(() => {
    const q = form.biz_name.trim();
    if (q.length < 1) {
      setBizSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('business_contacts')
        .select('id, name, phone')
        .ilike('name', `%${q}%`)
        .eq('status', 'active')
        .is('deleted_at', null)
        .limit(5);
      if (data) setBizSuggestions(data);
    }, 200);
    return () => clearTimeout(timer);
  }, [form.biz_name]);

  const selectMember = (m: Member) => {
    setForm((f) => ({
      ...f,
      client: m.name,
      phone: m.phone || '',
      member_level: m.level,
    }));
    setSelectedMemberId(m.id);
    setMemberSuggestions([]);
  };

  const update = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === 'client') setSelectedMemberId(null);
  };

  const handleSave = async () => {
    if (!form.client.trim()) return alert('请填写客户姓名');
    if (!form.pax || parseInt(form.pax) < 1) return alert('请填写人数');

    setSaving(true);
    const deposit = parseInt(form.deposit) || 0;
    const pax = parseInt(form.pax);
    const discount = DEFAULT_DISCOUNTS[form.member_level] || 100;
    const estimated = Math.round(pax * 1000 * (discount / 100));

    // 商务联系人：如果填了名字但在 business_contacts 表中不存在，自动新建
    const bizName = form.biz_name.trim();
    if (bizName) {
      const { data: existingBiz } = await supabase
        .from('business_contacts')
        .select('id')
        .eq('name', bizName)
        .is('deleted_at', null)
        .limit(1);
      if (!existingBiz || existingBiz.length === 0) {
        await supabase.from('business_contacts').insert({
          name: bizName,
          status: 'active',
        });
      }
    }

    const { error } = await supabase.from('orders').insert({
      date: form.date,
      slot: form.slot,
      type: form.type,
      venues: [venueId],
      client: form.client.trim(),
      phone: form.phone,
      member_level: form.member_level,
      pax,
      action: form.action,
      deposit,
      note: form.note,
      status: deposit > 0 ? '已确认' : '待确认',
      estimated,
      member_id: selectedMemberId,
      biz_name: bizName || null,
    });

    setSaving(false);
    if (error) {
      alert('保存失败：' + error.message);
    } else {
      onSaved();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white w-full max-w-[480px] max-h-[90vh] rounded-t-xl md:rounded-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h2 className="font-bold text-base">新建预定</h2>
          <button onClick={onClose} className="text-[var(--ink3)] text-lg">✕</button>
        </div>

        {/* Form */}
        <div className="p-4 space-y-3">
          {/* Row 1: Date + Slot */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">日期 *</span>
              <input
                type="date"
                value={form.date}
                onChange={(e) => update('date', e.target.value)}
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">时段 *</span>
              <select
                value={form.slot}
                onChange={(e) => update('slot', e.target.value)}
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]"
              >
                {ALL_SLOTS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Row 2: Type + Pax */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">类别 *</span>
              <select
                value={form.type}
                onChange={(e) => update('type', e.target.value)}
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]"
              >
                {ORDER_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">人数 *</span>
              <input
                type="number"
                min="1"
                value={form.pax}
                onChange={(e) => update('pax', e.target.value)}
                placeholder="请输入人数"
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]"
              />
            </label>
          </div>

          {/* Row 3: Venue (readonly) */}
          <div>
            <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">场地</span>
            <div className="px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-md text-sm text-[var(--ink2)]">
              {venue?.name} ({venue?.capacity})
            </div>
          </div>

          {/* Row 4: Client + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">客户姓名 *</span>
              <input
                type="text"
                value={form.client}
                onChange={(e) => update('client', e.target.value)}
                placeholder="输入姓名搜索会员"
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]"
              />
              {memberSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-[var(--border)] rounded-md shadow-lg z-10 max-h-40 overflow-y-auto">
                  {memberSuggestions.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => selectMember(m)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--bg)] flex justify-between items-center"
                    >
                      <span className="font-medium">{m.name}</span>
                      <span className="text-[10px] text-[var(--ink3)]">
                        {m.level} {m.phone ? `· ${m.phone.slice(0, 3)}****${m.phone.slice(-4)}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <label className="block">
              <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">电话</span>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
                placeholder="联系电话"
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]"
              />
            </label>
          </div>

          {/* Row 5: Member level + Deposit */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">会员类型</span>
              <select
                value={form.member_level}
                onChange={(e) => update('member_level', e.target.value)}
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]"
              >
                {MEMBER_LEVELS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">定金</span>
              <input
                type="number"
                min="0"
                value={form.deposit}
                onChange={(e) => update('deposit', e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]"
              />
            </label>
          </div>

          {/* Row 6: Business + Action */}
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">介绍人/商务</span>
              <input
                type="text"
                value={form.biz_name}
                onChange={(e) => update('biz_name', e.target.value)}
                placeholder="输入搜索或新增商务"
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]"
              />
              {bizSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-[var(--border)] rounded-md shadow-lg z-10 max-h-40 overflow-y-auto">
                  {bizSuggestions.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => {
                        setForm((f) => ({ ...f, biz_name: b.name }));
                        setBizSuggestions([]);
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--bg)] flex justify-between items-center"
                    >
                      <span className="font-medium">{b.name}</span>
                      {b.phone && <span className="text-[10px] text-[var(--ink3)]">{b.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <label className="block">
              <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">行为 *</span>
              <select
                value={form.action}
                onChange={(e) => update('action', e.target.value)}
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]"
              >
                {ACTIONS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Row 7: Notes */}
          <label className="block">
            <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">备注</span>
            <textarea
              value={form.note}
              onChange={(e) => update('note', e.target.value)}
              placeholder="忌口、布置要求等"
              rows={2}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)] resize-none"
            />
          </label>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-4 py-3 border-t border-[var(--border)]">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 text-sm bg-[var(--green)] text-white rounded-lg hover:opacity-90 transition disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存预定'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm border border-[var(--border)] rounded-lg hover:bg-[var(--bg)] transition"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
