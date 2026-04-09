'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { VENUES, STATUS_COLORS, ORDER_TYPES } from '@/lib/constants';
import { useAuth } from '@/lib/auth';
import { Order } from '@/lib/types';
import OrderDetailModal from './OrderDetailModal';

const STATUSES = ['全部', '待确认', '已确认', '待结账', '已收款', '已入账', '已取消'];
const STATUS_PRIORITY: Record<string, number> = {
  '待确认': 0,
  '已确认': 1,
  '待结账': 2,
  '已收款': 3,
  '已入账': 4,
  '已取消': 5,
};
const DONE_STATUSES = new Set(['已入账', '已取消']);
const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

function formatDateLabel(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  const dow = DAY_NAMES[d.getDay()];
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  if (diff === 0) return `今天 · ${md} 周${dow}`;
  if (diff === 1) return `明天 · ${md} 周${dow}`;
  if (diff === -1) return `昨天 · ${md} 周${dow}`;
  return `${md} 周${dow}`;
}

export default function OrdersPage() {
  const { can } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [statusFilter, setStatusFilter] = useState('全部');
  const [typeFilter, setTypeFilter] = useState('全部');
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [expandedDoneDates, setExpandedDoneDates] = useState<Set<string>>(new Set());

  const fetchOrders = async () => {
    let query = supabase.from('orders').select('*').is('deleted_at', null).order('date', { ascending: true }).order('id', { ascending: false });
    if (statusFilter !== '全部') query = query.eq('status', statusFilter);
    if (typeFilter !== '全部') query = query.eq('type', typeFilter);
    const { data } = await query.limit(200);
    if (data) setOrders(data);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchOrders(); }, [statusFilter, typeFilter]);

  // 按日期分组，每组内按状态紧急度排序
  const groupedOrders = useMemo(() => {
    const groups = new Map<string, Order[]>();
    for (const o of orders) {
      const arr = groups.get(o.date) || [];
      arr.push(o);
      groups.set(o.date, arr);
    }
    // 按状态优先级排序每组
    groups.forEach((arr) => {
      arr.sort((a, b) => (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9));
    });
    // 日期排序：今天和未来在前（升序），过去在后（降序）
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);
    const entries: [string, Order[]][] = Array.from(groups.entries());
    const future = entries.filter(([d]) => d >= todayStr).sort((a, b) => a[0].localeCompare(b[0]));
    const past = entries.filter(([d]) => d < todayStr).sort((a, b) => b[0].localeCompare(a[0]));
    return [...future, ...past];
  }, [orders]);

  const venueNames = (venues: string[]) =>
    (venues || []).map((v) => VENUES.find((vn) => vn.id === v)?.name || v).join('+');

  const maskPhone = (phone: string) => {
    if (!phone) return '';
    if (can('view_full_phone')) return phone;
    return phone.length >= 7 ? phone.slice(0, 3) + '****' + phone.slice(-4) : phone;
  };

  const toggleDoneDate = (date: string) => {
    setExpandedDoneDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* 筛选器 - 合并为一行 */}
      <div className="p-3 bg-white border-b border-[var(--border)]">
        <div className="flex gap-1 flex-wrap items-center">
          {STATUSES.map((s) => {
            const sc = s !== '全部' ? STATUS_COLORS[s] : null;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 text-[11px] rounded-full border transition
                  ${statusFilter === s
                    ? sc
                      ? `${sc.bg} ${sc.text} ${sc.border}`
                      : 'bg-[var(--green)] text-white border-[var(--green)]'
                    : 'bg-white text-[var(--ink3)] border-[var(--border)] hover:bg-[var(--bg)]'
                  }`}
              >
                {s}
              </button>
            );
          })}
          <span className="w-px h-4 bg-[var(--border)] mx-1" />
          {['全部', ...ORDER_TYPES].map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-2.5 py-1 text-[11px] rounded-full border transition
                ${typeFilter === t
                  ? 'bg-[var(--ink)] text-white border-[var(--ink)]'
                  : 'bg-white text-[var(--ink3)] border-[var(--border)] hover:bg-[var(--bg)]'
                }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* 按日期分组的订单列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {orders.length === 0 && (
          <div className="text-center text-[var(--ink3)] py-12">暂无订单</div>
        )}
        {groupedOrders.map(([date, dateOrders]) => {
          const activeOrders = dateOrders.filter((o) => !DONE_STATUSES.has(o.status));
          const doneOrders = dateOrders.filter((o) => DONE_STATUSES.has(o.status));
          const isDoneExpanded = expandedDoneDates.has(date);

          return (
            <div key={date}>
              {/* 日期标题 */}
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-[var(--ink)]">{formatDateLabel(date)}</h3>
                <span className="text-[10px] text-[var(--ink3)] px-1.5 py-0.5 rounded bg-[var(--bg)]">
                  {dateOrders.length}单
                </span>
              </div>

              {/* 活跃订单 */}
              <div className="space-y-2">
                {activeOrders.map((order) => {
                  const sc = STATUS_COLORS[order.status] || STATUS_COLORS['待确认'];
                  const borderColor = sc.border.replace('border-[', '').replace(']', '');
                  return (
                    <div
                      key={order.id}
                      onClick={() => setSelectedOrderId(order.id)}
                      className="bg-white rounded-lg p-3 border border-[var(--border)] cursor-pointer hover:shadow-sm transition"
                      style={{ borderLeftWidth: 4, borderLeftColor: borderColor }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{order.client}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${sc.bg} ${sc.text} ${sc.border}`}>
                            {order.status}
                          </span>
                          {order.member_level !== '散客' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--purple-bg)] text-[var(--purple)] border border-[var(--purple-border)]">
                              {order.member_level}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-[var(--ink3)]">#{order.id}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[var(--ink2)] flex-wrap">
                        <span className="px-1.5 py-0.5 rounded bg-[var(--bg)] text-[var(--ink3)]">{order.slot}</span>
                        <span>{venueNames(order.venues)}</span>
                        <span>{order.pax}人</span>
                        <span>{order.action}</span>
                        {order.phone && <span>{maskPhone(order.phone)}</span>}
                      </div>
                      {order.note && (
                        <p className="text-xs text-[var(--ink3)] mt-1 truncate">{order.note}</p>
                      )}
                      {order.biz_name && (
                        <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-[var(--amber-bg)] text-[var(--amber)]">
                          商务: {order.biz_name}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 已完结订单 - 默认折叠 */}
              {doneOrders.length > 0 && (
                <div className="mt-2">
                  <button
                    onClick={() => toggleDoneDate(date)}
                    className="text-[11px] text-[var(--ink3)] hover:text-[var(--ink2)] transition flex items-center gap-1"
                  >
                    <span className="text-[10px]">{isDoneExpanded ? '▾' : '▸'}</span>
                    {isDoneExpanded ? '收起' : `展开 ${doneOrders.length} 条已完结`}
                  </button>
                  {isDoneExpanded && (
                    <div className="space-y-1.5 mt-1.5">
                      {doneOrders.map((order) => {
                        const sc = STATUS_COLORS[order.status] || STATUS_COLORS['已取消'];
                        const borderColor = sc.border.replace('border-[', '').replace(']', '');
                        return (
                          <div
                            key={order.id}
                            onClick={() => setSelectedOrderId(order.id)}
                            className="bg-white rounded-lg p-2.5 border border-[var(--border)] cursor-pointer hover:shadow-sm transition opacity-70"
                            style={{ borderLeftWidth: 4, borderLeftColor: borderColor }}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm text-[var(--ink2)]">{order.client}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${sc.bg} ${sc.text} ${sc.border}`}>
                                  {order.status}
                                </span>
                              </div>
                              <span className="text-[11px] text-[var(--ink3)]">#{order.id}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-[var(--ink3)] mt-0.5">
                              <span>{order.slot}</span>
                              <span>{venueNames(order.venues)}</span>
                              <span>{order.pax}人</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Order detail modal */}
      {selectedOrderId && (
        <OrderDetailModal
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
          onUpdated={() => {
            setSelectedOrderId(null);
            fetchOrders();
          }}
        />
      )}
    </div>
  );
}
