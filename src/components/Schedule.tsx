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
  '待确认': { bg: '#FFF3CD', border: '#F0C040' },
  '已确认': { bg: '#D4EDDA', border: '#5CB85C' },
  '已收款': { bg: '#E8D5F5', border: '#9B59B6' },
  '已入账': { bg: '#CCE5FF', border: '#2196F3' },
};

const BAND_TEXT_COLORS: Record<string, string> = {
  '待确认': '#856404',
  '已确认': '#155724',
  '已收款': '#6F42C1',
  '已入账': '#004085',
};

export default function Schedule() {
  const [range, setRange] = useState(3);
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
  const isExpanded = range <= 3;
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
    const slotOrders = getVenueDateOrders(venueId, date);
    const hasAny = slotOrders.some((s) => s.order);

    if (!hasAny) {
      // All slots empty — go straight to new order (default: 午餐)
      setNewOrderInfo({ date, slot: '午餐', venueId });
      setPopover(null);
      return;
    }

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
          {[3, 7, 14, 30].map((r) => (
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
                    style={{ minWidth: isExpanded ? 200 : isCompact ? 52 : 80, width: isExpanded ? `${100 / range}%` : undefined }}
                  >
                    {isExpanded ? (
                      <>
                        <div className={`text-xs font-semibold ${isWeekend ? 'text-[var(--red)]' : ''}`}>
                          {ds === today ? '今天' : ds === formatDate(addDays(new Date(), 1)) ? '明天' : ds === formatDate(addDays(new Date(), 2)) ? '后天' : `${d.getMonth() + 1}/${d.getDate()}`}
                        </div>
                        <div className={`text-[10px] ${isWeekend ? 'text-[var(--red)]' : 'text-[var(--ink3)]'}`}>
                          {d.getMonth() + 1}月{d.getDate()}日 周{DAY_NAMES[dow]}
                        </div>
                      </>
                    ) : (
                      <>
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
                      </>
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

                  return (
                    <td
                      key={ds}
                      className={`p-0.5 cursor-pointer transition hover:bg-[var(--bg2)] ${isToday ? 'bg-[var(--green-bg)]/30' : ''} ${isExpanded ? 'align-top' : ''}`}
                      onMouseEnter={(e) => !isExpanded && handleCellHover(venue.id, ds, e)}
                      onMouseLeave={() => !isExpanded && handleCellLeave()}
                      onClick={(e) => !isExpanded && handleCellClick(venue.id, ds, e)}
                    >
                      {isExpanded ? (
                        /* 3天展开视图：每个时段独立卡片 */
                        <div className="flex flex-col gap-1 p-1">
                          {slotOrders.map(({ slot, order }) => {
                            const colors = order ? BAND_COLORS[order.status] : null;
                            if (!order) return null;
                            return (
                              <div
                                key={slot}
                                className="rounded-md px-2 py-1.5 cursor-pointer hover:opacity-80 transition"
                                style={{
                                  backgroundColor: colors!.bg,
                                  border: `1.5px solid ${colors!.border}`,
                                }}
                                onClick={() => setSelectedOrderId(order.id)}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-sm font-semibold truncate" style={{ color: BAND_TEXT_COLORS[order.status] }}>
                                    {order.client}
                                  </span>
                                  <span
                                    className="text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap font-medium"
                                    style={{
                                      backgroundColor: colors!.border + '30',
                                      color: BAND_TEXT_COLORS[order.status],
                                    }}
                                  >
                                    {order.status}
                                  </span>
                                </div>
                                <div className="text-xs mt-0.5" style={{ color: BAND_TEXT_COLORS[order.status] }}>
                                  {slot} · {order.pax}人 · {order.type}
                                </div>
                                {order.biz_name && (
                                  <div className="text-[10px] mt-0.5 text-[var(--ink3)]">
                                    商务：{order.biz_name}
                                  </div>
                                )}
                                {order.note && (
                                  <div className="text-[10px] mt-0.5 text-[var(--amber)] truncate">
                                    {order.note}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {/* 空白格子点击可新建 */}
                          {slotOrders.every(({ order }) => !order) && (
                            <div
                              className="flex-1 min-h-[40px] cursor-pointer"
                              onClick={() => setNewOrderInfo({ date: ds, slot: '午餐', venueId: venue.id })}
                            />
                          )}
                        </div>
                      ) : (
                        /* 7/14/30天紧凑视图：色带模式 */
                        <div className="flex flex-col gap-px" style={{ minHeight: isCompact ? 40 : 56 }}>
                          {slotOrders.map(({ slot, order }) => {
                            const colors = order ? BAND_COLORS[order.status] : null;
                            return (
                              <div
                                key={slot}
                                className="flex-1 rounded-sm overflow-hidden flex items-center"
                                style={
                                  colors
                                    ? { backgroundColor: colors.bg, border: `1px solid ${colors.border}`, minHeight: isCompact ? 6 : 9 }
                                    : { minHeight: isCompact ? 6 : 9 }
                                }
                              >
                                {!isCompact && order && (
                                  <div className="flex items-center gap-1 px-1 w-full" style={{ color: BAND_TEXT_COLORS[order.status] }}>
                                    <span className="text-[9px] font-medium truncate">{order.client.slice(0, 3)}</span>
                                    <span className="text-[8px]">{order.pax}人</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
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
