'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { VENUES } from '@/lib/constants';
import { useAuth } from '@/lib/auth';
import { Order, Bill } from '@/lib/types';

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmtDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DAY_LABELS = ['今天', '明天', '后天'];
const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

export default function HomePage() {
  const { can } = useAuth();
  const [dayOrders, setDayOrders] = useState<Order[][]>([[], [], []]);
  const [pendingConfirm, setPendingConfirm] = useState<Order[]>([]);
  const [pendingBill, setPendingBill] = useState<Order[]>([]);
  const [recentFeedback, setRecentFeedback] = useState<(Bill & { order_client?: string })[]>([]);

  const today = new Date();

  useEffect(() => {
    (async () => {
      const dates = [0, 1, 2].map((i) => fmtDate(addDays(today, i)));

      const { data: orders } = await supabase
        .from('orders').select('*')
        .in('date', dates).neq('status', '已取消').is('deleted_at', null)
        .order('date').order('slot');
      const grouped: Order[][] = [[], [], []];
      for (const o of (orders || [])) {
        const idx = dates.indexOf(o.date);
        if (idx >= 0) grouped[idx].push(o);
      }
      setDayOrders(grouped);

      const { data: pc } = await supabase
        .from('orders').select('*')
        .eq('status', '待确认').is('deleted_at', null).order('date').limit(10);
      setPendingConfirm(pc || []);

      const { data: pb } = await supabase
        .from('orders').select('*')
        .eq('status', '已确认').is('deleted_at', null).lte('date', fmtDate(today)).order('date').limit(10);
      setPendingBill(pb || []);

      const { data: fb } = await supabase
        .from('bills').select('*, orders(client)')
        .gt('stars', 0).is('deleted_at', null).order('created_at', { ascending: false }).limit(3);
      setRecentFeedback(
        (fb || []).map((b: Record<string, unknown>) => ({
          ...b,
          order_client: (b.orders as Record<string, string>)?.client || '',
        })) as (Bill & { order_client?: string })[]
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const venueNames = (venues: string[]) =>
    (venues || []).map((v) => VENUES.find((vn) => vn.id === v)?.name || v).join('+');

  // Tomorrow's highlight orders: VIP (non-散客), big tables (>=8), orders with notes (special requests)
  const tomorrowOrders = dayOrders[1] || [];
  const tomorrowHighlights = useMemo(() => {
    return tomorrowOrders.filter(
      (o) => o.member_level !== '散客' || o.pax >= 8 || (o.note && o.note.trim().length > 0)
    );
  }, [tomorrowOrders]);

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3 space-y-4">
      {/* Alerts */}
      {(pendingConfirm.length > 0 || pendingBill.length > 0) && (
        <div className="flex gap-2 flex-wrap">
          {pendingConfirm.length > 0 && (
            <div className="px-3 py-2 bg-[var(--amber-bg)] border border-[var(--amber-border)] rounded-lg text-xs text-[var(--amber)]">
              {pendingConfirm.length} 个预定待确认
            </div>
          )}
          {pendingBill.length > 0 && can('edit') && (
            <div className="px-3 py-2 bg-[var(--purple-bg)] border border-[var(--purple-border)] rounded-lg text-xs text-[var(--purple)]">
              {pendingBill.length} 个订单待结账
            </div>
          )}
        </div>
      )}

      {/* Tomorrow highlights */}
      {tomorrowHighlights.length > 0 && (
        <div className="bg-[var(--amber-bg)] border border-[var(--amber-border)] rounded-lg overflow-hidden">
          <div className="px-3 py-2 text-xs font-semibold text-[var(--amber)]">
            明日重点提醒（{tomorrowHighlights.length}项）
          </div>
          {tomorrowHighlights.map((o) => {
            const tags: string[] = [];
            if (o.member_level !== '散客') tags.push(o.member_level);
            if (o.pax >= 8) tags.push(`大桌${o.pax}人`);
            if (o.note) tags.push(o.note);
            return (
              <div key={o.id} className="px-3 py-2 border-t border-[var(--amber-border)]/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-sm text-[var(--amber)]">{o.client}</span>
                    {o.member_level !== '散客' && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--purple-bg)] text-[var(--purple)]">{o.member_level}</span>
                    )}
                  </div>
                  <span className="text-xs text-[var(--amber)]">{o.slot} · {venueNames(o.venues)}</span>
                </div>
                <div className="text-xs text-[var(--ink2)] mt-0.5">
                  {o.pax}人 · {o.action}
                  {o.note && <span className="ml-1 text-[var(--red)]">{o.note}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3-day outlook */}
      {[0, 1, 2].map((i) => {
        const d = addDays(today, i);
        const orders = dayOrders[i];
        const totalPax = orders.reduce((s, o) => s + o.pax, 0);
        const tableCount = orders.length;
        const badgeColor = tableCount === 0 ? 'bg-[var(--red-bg)] text-[var(--red)]'
          : tableCount <= 2 ? 'bg-[var(--amber-bg)] text-[var(--amber)]'
          : 'bg-[var(--green-bg)] text-[var(--green)]';

        return (
          <div key={i} className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg)]">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{DAY_LABELS[i]}</span>
                <span className="text-xs text-[var(--ink3)]">
                  {d.getMonth() + 1}/{d.getDate()} 周{DAY_NAMES[d.getDay()]}
                </span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeColor}`}>
                {tableCount > 0 ? `${tableCount}桌 ${totalPax}人` : '空档'}
              </span>
            </div>
            {orders.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <span className="text-xs text-[var(--ink3)]">无预定</span>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border2)]">
                {orders.map((o) => (
                  <div key={o.id} className="px-3 py-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-sm">{o.client}</span>
                        {o.member_level !== '散客' && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--purple-bg)] text-[var(--purple)]">{o.member_level}</span>
                        )}
                      </div>
                      <span className="text-xs text-[var(--ink3)]">{o.slot} · {venueNames(o.venues)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[var(--ink2)] mt-0.5">
                      <span>{o.pax}人</span>
                      <span>{o.action}</span>
                      {o.biz_name && <span className="text-[var(--amber)]">商务:{o.biz_name}</span>}
                      {o.note && <span className="text-[var(--ink3)] truncate max-w-[120px]">{o.note}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Todo section */}
      {(pendingConfirm.length > 0 || pendingBill.length > 0) && (
        <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
          <div className="px-3 py-2 bg-[var(--bg)] text-xs font-semibold text-[var(--ink2)]">待办事项</div>
          {pendingConfirm.map((o) => (
            <div key={o.id} className="flex items-center justify-between px-3 py-2 border-t border-[var(--border2)]">
              <div className="text-sm">
                <span className="text-[var(--amber)] text-xs mr-1">待确认</span>
                <span className="font-medium">{o.client}</span>
                <span className="text-[var(--ink3)] text-xs ml-2">{o.date} {o.slot}</span>
              </div>
              <span className="text-xs text-[var(--ink3)]">{o.pax}人</span>
            </div>
          ))}
          {pendingBill.map((o) => (
            <div key={o.id} className="flex items-center justify-between px-3 py-2 border-t border-[var(--border2)]">
              <div className="text-sm">
                <span className="text-[var(--purple)] text-xs mr-1">待结账</span>
                <span className="font-medium">{o.client}</span>
                <span className="text-[var(--ink3)] text-xs ml-2">{o.date} {o.slot}</span>
              </div>
              <span className="text-xs text-[var(--ink3)]">{o.pax}人</span>
            </div>
          ))}
        </div>
      )}

      {/* Recent feedback */}
      {recentFeedback.length > 0 && (
        <div className="bg-white rounded-lg border border-[var(--border)] overflow-hidden">
          <div className="px-3 py-2 bg-[var(--bg)] text-xs font-semibold text-[var(--ink2)]">最近服务反馈</div>
          {recentFeedback.map((b) => (
            <div key={b.id} className="flex items-center justify-between px-3 py-2 border-t border-[var(--border2)]">
              <div className="text-sm">
                <span className="font-medium">{b.order_client}</span>
                <span className="text-[var(--ink3)] text-xs ml-2">{b.date}</span>
              </div>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <span key={i} className={`text-sm ${i <= (b.stars || 0) ? 'text-yellow-500' : 'text-gray-300'}`}>★</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
