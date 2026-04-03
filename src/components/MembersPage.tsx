'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { MEMBER_LEVELS, STATUS_COLORS, VENUES } from '@/lib/constants';
import { useAuth } from '@/lib/auth';
import { Member, DEFAULT_DISCOUNTS, Bill, Order } from '@/lib/types';
import { softDelete, hardDelete, writeAuditLog } from '@/lib/audit';

type ModalMode = null | 'create' | 'edit' | 'profile' | 'recharge';

export default function MembersPage() {
  const { role, can, roleLabel } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('全部');
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [memberOrders, setMemberOrders] = useState<Order[]>([]);
  const [memberBills, setMemberBills] = useState<Bill[]>([]);
  const [rechargeAmount, setRechargeAmount] = useState('');

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

  // 计算沉睡会员（60天未到访）
  const dormantMembers = useMemo(() => {
    const now = new Date();
    const threshold = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    return members.filter((m) => {
      if (m.level === '散客') return false;
      if (!m.visits || m.visits === 0) return true;
      // 用 updated_at 近似判断（精确判断需要查订单，这里用 member 的更新时间）
      const lastActive = new Date(m.created_at);
      return lastActive < threshold;
    });
  }, [members]);

  const openCreate = () => { setForm(emptyForm()); setModalMode('create'); };

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
      supabase.from('orders').select('*').eq('member_id', m.id).is('deleted_at', null).order('date', { ascending: false }).limit(30),
      supabase.from('bills').select('*').eq('member_id', m.id).is('deleted_at', null).order('date', { ascending: false }).limit(30),
    ]);
    setMemberOrders(ordersRes.data || []);
    setMemberBills(billsRes.data || []);
  };

  const openRecharge = (m: Member) => {
    setSelectedMember(m);
    setRechargeAmount('');
    setModalMode('recharge');
  };

  const handleRecharge = async () => {
    if (!selectedMember) return;
    const amount = parseInt(rechargeAmount) || 0;
    if (amount <= 0) return alert('请输入充值金额');
    const newBalance = selectedMember.balance + amount;
    const memberId = selectedMember.id;
    const memberName = selectedMember.name;
    const oldBalance = selectedMember.balance;
    // 立即关闭弹窗，乐观更新余额
    setModalMode(null);
    setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, balance: newBalance } : m));
    // 后台写入
    supabase.from('members').update({ balance: newBalance }).eq('id', memberId).then(() => fetchMembers());
    writeAuditLog('members', memberId, '充值', `${memberName} 充值 ¥${amount}，余额 ¥${oldBalance} → ¥${newBalance}`, roleLabel);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return alert('请填写姓名');
    const isEdit = modalMode === 'edit';
    const savedId = isEdit ? selectedMember?.id : null;
    const memberData = {
      name: form.name.trim(), phone: form.phone, level: form.level,
      discount: form.discount, balance: form.balance,
      fee_expiry: form.fee_expiry || null, old_debt: form.old_debt, biz_name: form.biz_name || null, note: form.note,
    };
    // 立即关闭弹窗，乐观更新本地列表
    setModalMode(null);
    if (isEdit && selectedMember) {
      setMembers((prev) => prev.map((m) => m.id === selectedMember.id ? { ...m, ...memberData } as Member : m));
    }
    // 后台写入数据库
    if (isEdit && selectedMember) {
      supabase.from('members').update(memberData).eq('id', selectedMember.id).then(() => fetchMembers());
      writeAuditLog('members', savedId!, '编辑', `编辑会员 ${form.name}`, roleLabel);
    } else {
      supabase.from('members').insert(memberData).then(() => fetchMembers());
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

  const canSeeFinancials = role === 'approve' || role === 'finance' || role === 'service';

  // 从订单数据推算档案增强信息
  const lastVisitDate = memberOrders.length > 0 ? memberOrders[0].date : null;
  const venueStats = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of memberOrders) {
      if (o.venues) {
        for (const v of o.venues) {
          const name = VENUES.find((vn) => vn.id === v)?.name || v;
          map[name] = (map[name] || 0) + 1;
        }
      }
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [memberOrders]);

  const slotStats = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of memberOrders) {
      map[o.slot] = (map[o.slot] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [memberOrders]);

  const avgSpend = memberBills.length > 0
    ? Math.round(memberBills.reduce((s, b) => s + b.paid, 0) / memberBills.length)
    : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 bg-white border-b border-[var(--border)] space-y-2">
        <div className="flex items-center gap-2">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索姓名或电话..."
            className="flex-1 px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" />
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
                ${levelFilter === l ? 'bg-[var(--purple)] text-white border-[var(--purple)]'
                  : 'bg-white text-[var(--ink3)] border-[var(--border)] hover:bg-[var(--bg)]'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* 沉睡会员提醒 */}
      {dormantMembers.length > 0 && (
        <div className="mx-3 mt-3 p-3 bg-[#FFF3CD] border border-[#F0C040] rounded-lg">
          <div className="text-xs font-semibold text-[#856404] mb-1">沉睡会员提醒 · {dormantMembers.length}位会员超过60天未到访</div>
          <div className="flex flex-wrap gap-2">
            {dormantMembers.slice(0, 10).map((m) => (
              <button key={m.id} onClick={() => openProfile(m)}
                className="text-[11px] px-2 py-1 bg-white border border-[#F0C040] rounded-full text-[#856404] hover:bg-[#FFF3CD] transition">
                {m.name} · {m.level}
              </button>
            ))}
            {dormantMembers.length > 10 && <span className="text-[11px] text-[#856404] py-1">等{dormantMembers.length}位...</span>}
          </div>
        </div>
      )}

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
                <div className="flex items-center gap-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--purple-bg)] text-[var(--purple)] border border-[var(--purple-border)]">
                    {m.level}
                  </span>
                </div>
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
              {/* 快捷充值按钮 */}
              {can('edit') && canSeeFinancials && (
                <button
                  onClick={(e) => { e.stopPropagation(); openRecharge(m); }}
                  className="mt-2 w-full text-[11px] py-1.5 rounded-md border border-[var(--green)] text-[var(--green)] hover:bg-[var(--green-bg)] transition"
                >
                  充值
                </button>
              )}
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
              <button onClick={() => setModalMode(null)} className="flex-1 py-2.5 text-sm border border-[var(--border)] rounded-lg hover:bg-[var(--bg)] transition">取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Recharge Modal */}
      {modalMode === 'recharge' && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={() => setModalMode(null)}>
          <div className="bg-white w-full max-w-[360px] rounded-t-xl md:rounded-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <h2 className="font-bold text-base">储值充值</h2>
              <button onClick={() => setModalMode(null)} className="text-[var(--ink3)] text-lg">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-sm">
                <span className="text-[var(--ink3)]">会员：</span>
                <span className="font-medium">{selectedMember.name}</span>
                <span className="ml-2 text-[var(--ink3)]">当前余额：</span>
                <span className="font-medium">¥{selectedMember.balance.toLocaleString()}</span>
              </div>
              <label className="block">
                <span className="text-[11px] font-medium text-[var(--ink2)] mb-1 block">充值金额</span>
                <input type="number" min="1" value={rechargeAmount}
                  onChange={(e) => setRechargeAmount(e.target.value)}
                  placeholder="请输入充值金额"
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--ink3)]" autoFocus />
              </label>
              {rechargeAmount && parseInt(rechargeAmount) > 0 && (
                <div className="text-xs text-[var(--ink3)]">
                  充值后余额：¥{(selectedMember.balance + (parseInt(rechargeAmount) || 0)).toLocaleString()}
                </div>
              )}
            </div>
            <div className="flex gap-3 px-4 py-3 border-t border-[var(--border)]">
              <button onClick={handleRecharge} disabled={saving}
                className="flex-1 py-2.5 text-sm bg-[var(--green)] text-white rounded-lg hover:opacity-90 transition disabled:opacity-50">
                {saving ? '处理中...' : '确认充值'}
              </button>
              <button onClick={() => setModalMode(null)} className="flex-1 py-2.5 text-sm border border-[var(--border)] rounded-lg hover:bg-[var(--bg)] transition">取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Modal - 增强版 */}
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
            <div className="p-4 space-y-4">
              {/* 基本信息卡片 */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-[var(--bg)] rounded-md p-2">
                  <div className="text-[10px] text-[var(--ink3)]">电话</div>
                  <div className="text-sm font-medium">{maskPhone(selectedMember.phone)}</div>
                </div>
                <div className="bg-[var(--bg)] rounded-md p-2">
                  <div className="text-[10px] text-[var(--ink3)]">到访次数</div>
                  <div className="text-sm font-medium">{selectedMember.visits} 次</div>
                </div>
                <div className="bg-[var(--bg)] rounded-md p-2">
                  <div className="text-[10px] text-[var(--ink3)]">最近到访</div>
                  <div className="text-sm font-medium">{lastVisitDate || '暂无'}</div>
                </div>
                {canSeeFinancials && (
                  <>
                    <div className="bg-[var(--bg)] rounded-md p-2">
                      <div className="text-[10px] text-[var(--ink3)]">折扣</div>
                      <div className="text-sm font-medium">{selectedMember.discount}%</div>
                    </div>
                    <div className="bg-[var(--bg)] rounded-md p-2">
                      <div className="text-[10px] text-[var(--ink3)]">储值余额</div>
                      <div className="text-sm font-medium text-[var(--green)]">¥{selectedMember.balance.toLocaleString()}</div>
                    </div>
                    <div className="bg-[var(--bg)] rounded-md p-2">
                      <div className="text-[10px] text-[var(--ink3)]">累计消费</div>
                      <div className="text-sm font-medium">¥{selectedMember.total_spent.toLocaleString()}</div>
                    </div>
                    {memberBills.length > 0 && (
                      <div className="bg-[var(--bg)] rounded-md p-2">
                        <div className="text-[10px] text-[var(--ink3)]">场均消费</div>
                        <div className="text-sm font-medium">¥{avgSpend.toLocaleString()}</div>
                      </div>
                    )}
                    {selectedMember.old_debt > 0 && (
                      <div className="bg-[var(--amber-bg)] rounded-md p-2">
                        <div className="text-[10px] text-[var(--amber)]">旧云集余额</div>
                        <div className="text-sm font-medium text-[var(--amber)]">¥{selectedMember.old_debt.toLocaleString()}</div>
                      </div>
                    )}
                    {selectedMember.fee_expiry && (
                      <div className="bg-[var(--bg)] rounded-md p-2">
                        <div className="text-[10px] text-[var(--ink3)]">年费到期</div>
                        <div className="text-sm font-medium">{selectedMember.fee_expiry}</div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* 快捷充值按钮 */}
              {can('edit') && canSeeFinancials && (
                <button onClick={() => openRecharge(selectedMember)}
                  className="w-full py-2 text-sm font-medium rounded-lg border-2 border-[var(--green)] text-[var(--green)] hover:bg-[var(--green-bg)] transition">
                  储值充值
                </button>
              )}

              {/* 消费偏好 */}
              {(venueStats.length > 0 || slotStats.length > 0) && (
                <div>
                  <h3 className="text-xs font-semibold text-[var(--ink2)] mb-2">消费偏好</h3>
                  <div className="flex flex-wrap gap-2">
                    {venueStats.map(([name, count]) => (
                      <span key={name} className="text-[11px] px-2 py-1 bg-[var(--blue-bg)] text-[var(--blue)] rounded-full">
                        {name} {count}次
                      </span>
                    ))}
                    {slotStats.map(([name, count]) => (
                      <span key={name} className="text-[11px] px-2 py-1 bg-[var(--green-bg)] text-[var(--green)] rounded-full">
                        {name} {count}次
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedMember.note && (
                <div className="text-sm"><span className="text-[var(--ink3)] text-xs">备注</span><p>{selectedMember.note}</p></div>
              )}

              {/* 预定记录 */}
              {memberOrders.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-[var(--ink2)] mb-2">预定记录 ({memberOrders.length})</h3>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {memberOrders.map((o) => (
                      <div key={o.id} className="flex justify-between text-xs p-2 bg-[var(--bg)] rounded">
                        <span>{o.date} {o.slot} {o.action}</span>
                        <span className={STATUS_COLORS[o.status]?.text || ''}>{o.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 消费记录 */}
              {canSeeFinancials && memberBills.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-[var(--ink2)] mb-2">消费记录 ({memberBills.length})</h3>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
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
