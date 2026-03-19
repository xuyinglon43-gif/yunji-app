'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { MEMBER_LEVELS, STATUS_COLORS } from '@/lib/constants';
import { useAuth } from '@/lib/auth';
import { Member, DEFAULT_DISCOUNTS, Bill, Order } from '@/lib/types';
import { softDelete, hardDelete, writeAuditLog } from '@/lib/audit';

type ModalMode = null | 'create' | 'edit' | 'profile';

export default function MembersPage() {
  const { role, can, roleLabel } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('全部');
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  // Profile data
  const [memberOrders, setMemberOrders] = useState<Order[]>([]);
  const [memberBills, setMemberBills] = useState<Bill[]>([]);

  function emptyForm() {
    return { name: '', phone: '', level: '散客', discount: 100, balance: 0, fee_expiry: '', old_debt: 0, biz_name: '', note: '' };
  }

  const fetchMembers = async () => {
    let query = supabase.from('members').select('*').is('deleted_at', null).order('created_at', { ascending: false });
    if (search.trim()) {
      query = query.or(`name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%`);
    }
    if (levelFilter !== '全部') {
      query = query.eq('level', levelFilter);
    }
    const { data } = await query.limit(200);
    if (data) setMembers(data);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchMembers(); }, [search, levelFilter]);

  const openCreate = () => {
    setForm(emptyForm());
    setModalMode('create');
  };

  const openEdit = (m: Member) => {
    setForm({
      name: m.name, phone: m.phone || '', level: m.level,
      discount: m.discount, balance: m.balance,
      fee_expiry: m.fee_expiry || '', old_debt: m.old_debt, biz_name: m.biz_name || '', note: m.note || '',
    });
    setSelectedMember(m);
    setModalMode('edit');
  };

  const openProfile = async (m: Member) => {
    setSelectedMember(m);
    setModalMode('profile');
    const [ordersRes, billsRes] = await Promise.all([
      supabase.from('orders').select('*').eq('member_id', m.id).order('date', { ascending: false }).limit(20),
      supabase.from('bills').select('*').eq('member_id', m.id).order('date', { ascending: false }).limit(20),
    ]);
    setMemberOrders(ordersRes.data || []);
    setMemberBills(billsRes.data || []);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return alert('请填写姓名');
    setSaving(true);
    if (modalMode === 'create') {
      await supabase.from('members').insert({
        name: form.name.trim(), phone: form.phone, level: form.level,
        discount: form.discount, balance: form.balance,
        fee_expiry: form.fee_expiry || null, old_debt: form.old_debt, biz_name: form.biz_name || null, note: form.note,
      });
    } else if (modalMode === 'edit' && selectedMember) {
      await supabase.from('members').update({
        name: form.name.trim(), phone: form.phone, level: form.level,
        discount: form.discount, balance: form.balance,
        fee_expiry: form.fee_expiry || null, old_debt: form.old_debt, biz_name: form.biz_name || null, note: form.note,
      }).eq('id', selectedMember.id);
    }
    const savedId = modalMode === 'edit' ? selectedMember?.id : null;
    setSaving(false);
    setModalMode(null);
    fetchMembers();
    if (savedId) {
      await writeAuditLog('members', savedId, '编辑', `编辑会员 ${form.name}`, roleLabel);
    }
  };

  const handleDeleteMember = async (m: Member) => {
    if (!confirm(`确定要删除会员「${m.name}」吗？`)) return;
    const detail = `删除会员 ${m.name} (${m.level})`;
    if (can('hard_delete')) {
      await hardDelete('members', m.id, roleLabel, detail);
    } else {
      await softDelete('members', m.id, roleLabel, detail);
    }
    setModalMode(null);
    fetchMembers();
  };

  const updateForm = (key: string, value: string | number) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Auto-set discount when level changes
      if (key === 'level' && typeof value === 'string') {
        next.discount = DEFAULT_DISCOUNTS[value] || 100;
      }
      return next;
    });
  };

  const maskPhone = (phone: string) => {
    if (!phone) return '-';
    if (can('view_full_phone')) return phone;
    return phone.length >= 7 ? phone.slice(0, 3) + '****' + phone.slice(-4) : phone;
  };

  // Whether current role can see financials
  const canSeeFinancials = role === 'approve' || role === 'finance' || role === 'service';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 bg-white border-b border-[var(--border)] space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索姓名或电话..."
            className="flex-1 px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]"
          />
          {can('edit') && (
            <button onClick={openCreate}
              className="px-4 py-2 bg-[var(--green)] text-white text-sm rounded-md hover:opacity-90 transition whitespace-nowrap">
              + 新建会员
            </button>
          )}
        </div>
        <div className="flex gap-1 flex-wrap">
          {['全部', ...MEMBER_LEVELS].map((l) => (
            <button key={l} onClick={() => setLevelFilter(l)}
              className={`px-2.5 py-1 text-xs rounded-full border transition
                ${levelFilter === l
                  ? 'bg-[var(--purple)] text-white border-[var(--purple)]'
                  : 'bg-white text-[var(--ink3)] border-[var(--border)] hover:bg-[var(--bg)]'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Member grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {members.length === 0 && (
          <div className="text-center text-[var(--ink3)] py-12">暂无会员</div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {members.map((m) => (
            <div key={m.id}
              className="bg-white rounded-lg p-3 border border-[var(--border)] cursor-pointer hover:shadow-sm transition"
              onClick={() => openProfile(m)}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm">{m.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--purple-bg)] text-[var(--purple)] border border-[var(--purple-border)]">
                  {m.level}
                </span>
              </div>
              <div className="text-xs text-[var(--ink3)] space-y-0.5">
                <div className="flex justify-between">
                  <span>{maskPhone(m.phone)}</span>
                  <span>到访 {m.visits} 次</span>
                </div>
                {canSeeFinancials && (
                  <>
                    <div className="flex justify-between">
                      <span>折扣: {m.discount}%</span>
                      <span>余额: ¥{m.balance.toLocaleString()}</span>
                    </div>
                    {m.old_debt > 0 && (
                      <div className="text-[var(--amber)]">旧债: ¥{m.old_debt.toLocaleString()}</div>
                    )}
                  </>
                )}
                {m.biz_name && <div className="text-[var(--amber)]">商务: {m.biz_name}</div>}
                {m.note && <div className="truncate text-[var(--ink3)]">{m.note}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {(modalMode === 'create' || modalMode === 'edit') && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={() => setModalMode(null)}>
          <div className="bg-white w-full max-w-[480px] max-h-[90vh] rounded-t-xl md:rounded-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <h2 className="font-bold text-base">{modalMode === 'create' ? '新建会员' : '编辑会员'}</h2>
              <button onClick={() => setModalMode(null)} className="text-[var(--ink3)] text-lg">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">姓名 *</span>
                  <input type="text" value={form.name} onChange={(e) => updateForm('name', e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">电话</span>
                  <input type="tel" value={form.phone} onChange={(e) => updateForm('phone', e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">等级</span>
                  <select value={form.level} onChange={(e) => updateForm('level', e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]">
                    {MEMBER_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">默认折扣 (%)</span>
                  <input type="number" min="1" max="100" value={form.discount} onChange={(e) => updateForm('discount', parseInt(e.target.value) || 100)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">储值余额</span>
                  <input type="number" min="0" value={form.balance} onChange={(e) => updateForm('balance', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">年费到期日</span>
                  <input type="date" value={form.fee_expiry} onChange={(e) => updateForm('fee_expiry', e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">旧云集余额</span>
                  <input type="number" min="0" value={form.old_debt} onChange={(e) => updateForm('old_debt', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">商务</span>
                  <input type="text" value={form.biz_name} onChange={(e) => updateForm('biz_name', e.target.value)} placeholder="介绍商务姓名"
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
                </label>
              </div>
              <label className="block">
                <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">备注</span>
                <textarea value={form.note} onChange={(e) => updateForm('note', e.target.value)} rows={2}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)] resize-none" />
              </label>
            </div>
            <div className="flex gap-3 px-4 py-3 border-t border-[var(--border)]">
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 text-sm bg-[var(--green)] text-white rounded-lg hover:opacity-90 transition disabled:opacity-50">
                {saving ? '保存中...' : '保存'}
              </button>
              <button onClick={() => setModalMode(null)} className="flex-1 py-2.5 text-sm border border-[var(--border)] rounded-lg hover:bg-[var(--bg)] transition">取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {modalMode === 'profile' && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={() => setModalMode(null)}>
          <div className="bg-white w-full max-w-[520px] max-h-[90vh] rounded-t-xl md:rounded-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base">{selectedMember.name}</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--purple-bg)] text-[var(--purple)] border border-[var(--purple-border)]">
                  {selectedMember.level}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {can('edit') && (
                  <button onClick={() => openEdit(selectedMember)} className="text-xs text-[var(--blue)] hover:underline">编辑</button>
                )}
                {can('edit') && (
                  <button onClick={() => handleDeleteMember(selectedMember)} className="text-xs text-[var(--red)] hover:underline">删除</button>
                )}
                <button onClick={() => setModalMode(null)} className="text-[var(--ink3)] text-lg">✕</button>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {/* Basic info */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-[var(--ink3)] text-xs">电话</span><p>{maskPhone(selectedMember.phone)}</p></div>
                <div><span className="text-[var(--ink3)] text-xs">到访次数</span><p>{selectedMember.visits} 次</p></div>
                {canSeeFinancials && (
                  <>
                    <div><span className="text-[var(--ink3)] text-xs">折扣</span><p>{selectedMember.discount}%</p></div>
                    <div><span className="text-[var(--ink3)] text-xs">储值余额</span><p>¥{selectedMember.balance.toLocaleString()}</p></div>
                    <div><span className="text-[var(--ink3)] text-xs">累计消费</span><p>¥{selectedMember.total_spent.toLocaleString()}</p></div>
                    {selectedMember.old_debt > 0 && (
                      <div><span className="text-[var(--ink3)] text-xs">旧云集余额</span><p className="text-[var(--amber)]">¥{selectedMember.old_debt.toLocaleString()}</p></div>
                    )}
                    {selectedMember.fee_expiry && (
                      <div><span className="text-[var(--ink3)] text-xs">年费到期</span><p>{selectedMember.fee_expiry}</p></div>
                    )}
                  </>
                )}
              </div>
              {selectedMember.note && (
                <div className="text-sm"><span className="text-[var(--ink3)] text-xs">备注</span><p>{selectedMember.note}</p></div>
              )}

              {/* Recent orders */}
              {canSeeFinancials && memberOrders.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-[var(--ink2)] mb-2">预定记录</h3>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {memberOrders.map((o) => (
                      <div key={o.id} className="flex justify-between text-xs p-2 bg-[var(--bg)] rounded">
                        <span>{o.date} {o.slot} {o.action}</span>
                        <span className={STATUS_COLORS[o.status]?.text || ''}>{o.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent bills */}
              {canSeeFinancials && memberBills.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-[var(--ink2)] mb-2">消费记录</h3>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {memberBills.map((b) => (
                      <div key={b.id} className="flex justify-between text-xs p-2 bg-[var(--bg)] rounded">
                        <span>{b.date} {b.method}</span>
                        <span className="font-medium">¥{b.paid.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
