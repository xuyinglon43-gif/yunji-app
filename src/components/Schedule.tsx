'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { VENUES, ALL_SLOTS } from '@/lib/constants';
import NewOrderModal from './NewOrderModal';
import OrderDetailModal from './OrderDetailModal';

interface Order {
  id: number;
  date: string;
  slot: string;
  type: string;
  venues: string[];
  client: string;
  phone: string;
  member_level: string;
  is_returning: string;
  pax: number;
  action: string;
  deposit: number;
  note: string;
  status: string;
  biz_name: string;
  member_id: number | null;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

const BAND_COLORS: Record<string, { bg: string; border: string }> = {
  '待确认': { bg: '#FAEEDA', border: '#FAC775' },
  '已确认': { bg: '#E1F5EE', border: '#9FE1CB' },
  '已收款': { bg: '#EEEDFE', border: '#CECBF6' },
  '已入账': { bg: '#E6F1FB', border: '#B5D4F4' },
};

const BAND_TEXT_COLORS: Record<string, string> = {
  '待确认': '#8B5E1A',
  '已确认': '#2D6A4F',
  '已收款': '#5B3A8C',
  '已入账': '#1B4F7A',
};

export default function Schedule() {
  const [range, setRange] = useState(14);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [orders, setOrders] = useState<Order[]>([]);
  const [newOrderInfo, setNewOrderInfo] = useState<{
    date: string;
    slot: string;
    venueId: string;
  } | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  // Popover state
  const [popover, setPopover] = useState<{
    venueId: string;
    date: string;
    x: number;
    y: number;
    locked: boolean;
  } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const today = formatDate(new Date());
  const isCompact = range > 7;

  const dates = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 0; i < range; i++) {
      arr.push(addDays(startDate, i));
    }
    return arr;
  }, [startDate, range]);

  const fetchOrders = async () => {
    const from = formatDate(dates[0]);
    const to = formatDate(dates[dates.length - 1]);
    const { data } = await supabase
      .from('orders')
      .select('*')
      .gte('date', from)
      .lte('date', to)
      .neq('status', '已取消')
      .is('deleted_at', null);
    if (data) setOrders(data);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchOrders(); }, [startDate, range]);

  // Build lookup: date+slot+venueId -> order
  const orderMap = useMemo(() => {
    const map = new Map<string, Order>();
    for (const o of orders) {
      if (o.venues) {
        for (const v of o.venues) {
          map.set(`${o.date}|${o.slot}|${v}`, o);
        }
      }
    }
    return map;
  }, [orders]);

  // Get orders for a venue+date
  const getVenueDateOrders = useCallback((venueId: string, date: string) => {
    return ALL_SLOTS.map((slot) => ({
      slot,
      order: orderMap.get(`${date}|${slot}|${venueId}`) || null,
    }));
  }, [orderMap]);

  // Close popover on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popover?.locked && popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopover(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [popover]);

  const handleCellHover = (venueId: string, date: string, e: React.MouseEvent) => {
    if (popover?.locked) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const spaceRight = window.innerWidth - rect.right;
    setPopover({
      venueId,
      date,
      x: spaceRight > 280 ? rect.right + 8 : rect.left - 288,
      y: Math.min(rect.top, window.innerHeight - 300),
      locked: false,
    });
  };

  const handleCellLeave = () => {
    if (popover?.locked) return;
    setPopover(null);
  };

  const handleCellClick = (venueId: string, date: string, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const spaceRight = window.innerWidth - rect.right;
    setPopover({
      venueId,
      date,
      x: spaceRight > 280 ? rect.right + 8 : rect.left - 288,
      y: Math.min(rect.top, window.innerHeight - 300),
      locked: true,
    });
  };

  // Popover content
  const popoverOrders = popover ? getVenueDateOrders(popover.venueId, popover.date) : [];
  const popoverVenue = popover ? VENUES.find((v) => v.id === popover.venueId) : null;
  const popoverHasOrders = popoverOrders.some((s) => s.order);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-white border-b border-[var(--border)]">
        <div className="flex gap-1">
          {[7, 14, 30, 60].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 text-xs rounded-md border transition
                ${range === r
                  ? 'bg-[var(--green)] text-white border-[var(--green)]'
                  : 'bg-white text-[var(--ink2)] border-[var(--border)] hover:bg-[var(--bg)]'
                }`}
            >
              {r}天
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 px-2 py-1 text-xs border border-[var(--border)] rounded-md cursor-pointer hover:bg-[var(--bg)]">
          <span className="text-[var(--ink3)]">跳转</span>
          <input
            type="date"
            value={formatDate(startDate)}
            onChange={(e) => {
              if (e.target.value) setStartDate(new Date(e.target.value + 'T00:00:00'));
            }}
            className="text-xs border-none outline-none bg-transparent w-[110px]"
          />
        </label>

        {/* Legend — only colored statuses */}
        <div className="flex items-center gap-3 ml-auto text-[10px] text-[var(--ink3)]">
          {Object.entries(BAND_COLORS).map(([status, colors]) => (
            <span key={status} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }} />
              {status}
            </span>
          ))}
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-auto cal-scroll">
        <table className="cal-table">
          <thead>
            <tr>
              <th className="venue-cell" style={{ left: 0, minWidth: 80 }}>场地</th>
              {dates.map((d) => {
                const ds = formatDate(d);
                const dow = d.getDay();
                const isWeekend = dow === 0 || dow === 6;
                const isToday = ds === today;
                return (
                  <th
                    key={ds}
                    className={`px-1 py-1 ${isToday ? 'bg-[var(--green-bg)]' : ''}`}
                    style={{ minWidth: isCompact ? 40 : 72 }}
                  >
                    <div className={`text-[10px] ${isWeekend ? 'text-[var(--red)]' : ''}`}>
                      周{DAY_NAMES[dow]}
                    </div>
                    <div className={`text-xs font-semibold ${isWeekend ? 'text-[var(--red)]' : ''}`}>
                      {d.getDate()}
                    </div>
                    {!isCompact && (
                      <div className="text-[10px] text-[var(--ink3)]">
                        {d.getMonth() + 1}月
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {VENUES.map((venue) => (
              <tr key={venue.id}>
                <td className="venue-cell" style={{ left: 0, minWidth: 80 }}>
                  <div className="font-semibold text-xs">{venue.name}</div>
                  <div className="text-[10px] text-[var(--ink3)]">{venue.capacity}</div>
                </td>
                {dates.map((d) => {
                  const ds = formatDate(d);
                  const isToday = ds === today;
                  const slotOrders = getVenueDateOrders(venue.id, ds);
                  const hasAny = slotOrders.some((s) => s.order);

                  return (
                    <td
                      key={ds}
                      className={`p-0.5 cursor-pointer transition hover:bg-[var(--bg2)] ${isToday ? 'bg-[var(--green-bg)]/30' : ''}`}
                      onMouseEnter={(e) => handleCellHover(venue.id, ds, e)}
                      onMouseLeave={handleCellLeave}
                      onClick={(e) => handleCellClick(venue.id, ds, e)}
                    >
                      {/* 5 color bands */}
                      <div className="flex gap-px" style={{ height: isCompact ? 32 : 48 }}>
                        {slotOrders.map(({ slot, order }) => {
                          const colors = order ? BAND_COLORS[order.status] : null;
                          return (
                            <div
                              key={slot}
                              className="flex-1 rounded-sm overflow-hidden flex items-center justify-center"
                              style={
                                colors
                                  ? { backgroundColor: colors.bg, border: `1px solid ${colors.border}` }
                                  : { backgroundColor: 'transparent' }
                              }
                            >
                              {/* Show text only in 7-day view when has order */}
                              {!isCompact && order && (
                                <div className="text-center leading-none px-px" style={{ color: BAND_TEXT_COLORS[order.status] }}>
                                  <div className="text-[8px] font-medium truncate" style={{ maxWidth: 48 }}>
                                    {order.client.slice(0, 2)}
                                  </div>
                                  <div className="text-[7px]">{order.pax}人</div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {/* Small dot indicator for compact views with any bookings */}
                      {isCompact && hasAny && (
                        <div className="flex justify-center mt-0.5">
                          <div className="w-1 h-1 rounded-full bg-[var(--green)]" />
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Popover */}
      {popover && popoverVenue && (
        <div
          ref={popoverRef}
          className="fixed z-40 bg-white rounded-lg shadow-lg border border-[var(--border)] w-[280px] max-h-[320px] overflow-y-auto"
          style={{ left: popover.x, top: popover.y }}
        >
          <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--bg)]">
            <div className="font-semibold text-sm">{popoverVenue.name}</div>
            <div className="text-xs text-[var(--ink3)]">{popover.date}</div>
          </div>
          {!popoverHasOrders ? (
            <div className="px-3 py-4 text-center text-xs text-[var(--ink3)]">
              当天无预定，点击时段可新建
            </div>
          ) : (
            <div className="divide-y divide-[var(--border2)]">
              {popoverOrders.map(({ slot, order }) => (
                <div
                  key={slot}
                  className="px-3 py-2 hover:bg-[var(--bg)] cursor-pointer transition"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (order) {
                      setSelectedOrderId(order.id);
                      setPopover(null);
                    } else {
                      setNewOrderInfo({ date: popover.date, slot, venueId: popover.venueId });
                      setPopover(null);
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--ink3)] w-10">{slot}</span>
                    {order ? (
                      <div className="flex-1 ml-2">
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-medium">{order.client}</span>
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded-full"
                            style={{
                              backgroundColor: BAND_COLORS[order.status]?.bg,
                              color: BAND_TEXT_COLORS[order.status],
                              border: `1px solid ${BAND_COLORS[order.status]?.border}`,
                            }}
                          >
                            {order.status}
                          </span>
                        </div>
                        <div className="text-xs text-[var(--ink3)]">
                          {order.pax}人 · {order.action}
                          {order.member_level !== '散客' && ` · ${order.member_level}`}
                        </div>
                        {order.note && (
                          <div className="text-[10px] text-[var(--amber)] truncate">{order.note}</div>
                        )}
                      </div>
                    ) : (
                      <span className="flex-1 ml-2 text-xs text-[var(--ink3)]">空闲 — 点击新建</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* New Order Modal */}
      {newOrderInfo && (
        <NewOrderModal
          date={newOrderInfo.date}
          slot={newOrderInfo.slot}
          venueId={newOrderInfo.venueId}
          onClose={() => setNewOrderInfo(null)}
          onSaved={() => {
            setNewOrderInfo(null);
            fetchOrders();
          }}
        />
      )}

      {/* Order Detail Modal */}
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
