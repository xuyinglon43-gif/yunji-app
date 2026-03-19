'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { VENUES, STATUS_COLORS, ORDER_TYPES } from '@/lib/constants';
import { useAuth } from '@/lib/auth';
import { Order } from '@/lib/types';
import OrderDetailModal from './OrderDetailModal';

const STATUSES = ['全部', '待确认', '已确认', '已收款', '已入账', '已取消'];

export default function OrdersPage() {
  const { can } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [statusFilter, setStatusFilter] = useState('全部');
  const [typeFilter, setTypeFilter] = useState('全部');
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  const fetchOrders = async () => {
    let query = supabase.from('orders').select('*').is('deleted_at', null).order('date', { ascending: false }).order('id', { ascending: false });
    if (statusFilter !== '全部') query = query.eq('status', statusFilter);
    if (typeFilter !== '全部') query = query.eq('type', typeFilter);
    const { data } = await query.limit(200);
    if (data) setOrders(data);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchOrders(); }, [statusFilter, typeFilter]);

  const venueNames = (venues: string[]) =>
    (venues || []).map((v) => VENUES.find((vn) => vn.id === v)?.name || v).join('+');

  const maskPhone = (phone: string) => {
    if (!phone) return '';
    if (can('view_full_phone')) return phone;
    return phone.length >= 7 ? phone.slice(0, 3) + '****' + phone.slice(-4) : phone;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="p-3 bg-white border-b border-[var(--border)] space-y-2">
        {/* Status filter */}
        <div className="flex gap-1 flex-wrap">
          {STATUSES.map((s) => {
            const sc = s !== '全部' ? STATUS_COLORS[s] : null;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 text-xs rounded-full border transition
                  ${statusFilter === s
                    ? sc
                      ? `${sc.bg} ${sc.text} ${sc.border}`
                      : 'bg-[var(--green)] text-white border-[var(--green)]'
                    : 'bg-white text-[var(--ink2)] border-[var(--border)] hover:bg-[var(--bg)]'
                  }`}
              >
                {s}
              </button>
            );
          })}
        </div>
        {/* Type filter */}
        <div className="flex gap-1">
          {['全部', ...ORDER_TYPES].map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1 text-xs rounded-md border transition
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

      {/* Order list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {orders.length === 0 && (
          <div className="text-center text-[var(--ink3)] py-12">暂无订单</div>
        )}
        {orders.map((order) => {
          const sc = STATUS_COLORS[order.status] || STATUS_COLORS['待确认'];
          return (
            <div
              key={order.id}
              onClick={() => setSelectedOrderId(order.id)}
              className="bg-white rounded-lg p-3 border border-[var(--border)] cursor-pointer hover:shadow-sm transition"
              style={{ borderLeftWidth: 3, borderLeftColor: sc.border.replace('border-[', '').replace(']', '') }}
            >
              {/* Top row */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{order.client}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${sc.bg} ${sc.text} ${sc.border}`}>
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
              {/* Detail row */}
              <div className="flex items-center gap-2 text-xs text-[var(--ink2)] flex-wrap">
                <span>{order.date}</span>
                <span className="px-1.5 py-0.5 rounded bg-[var(--bg)] text-[var(--ink3)]">{order.slot}</span>
                <span>{venueNames(order.venues)}</span>
                <span>{order.pax}人</span>
                <span>{order.action}</span>
                {order.phone && <span>{maskPhone(order.phone)}</span>}
              </div>
              {/* Notes */}
              {order.note && (
                <p className="text-xs text-[var(--ink3)] mt-1 truncate">{order.note}</p>
              )}
              {/* Biz name */}
              {order.biz_name && (
                <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-[var(--amber-bg)] text-[var(--amber)]">
                  商务: {order.biz_name}
                </span>
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
