'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { VENUES, STATUS_CELL_COLORS, STATUS_TEXT_COLORS } from '@/lib/constants';
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

  const today = formatDate(new Date());

  // Generate date range
  const dates = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 0; i < range; i++) {
      arr.push(addDays(startDate, i));
    }
    return arr;
  }, [startDate, range]);

  // Fetch orders
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

  const handleCellClick = (date: string, slot: string, venueId: string) => {
    const order = orderMap.get(`${date}|${slot}|${venueId}`);
    if (order) {
      setSelectedOrderId(order.id);
    } else {
      setNewOrderInfo({ date, slot, venueId });
    }
  };

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

        {/* Legend */}
        <div className="flex items-center gap-3 ml-auto text-[10px] text-[var(--ink3)]">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm border border-[var(--border)]" /> 空闲
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-[#FDF3E3]" /> 待确认
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-[#EAF4EE]" /> 已确认
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-[#F3EDF9]" /> 已收款
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-[#EBF3FA]" /> 已入账
          </span>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-auto cal-scroll">
        <table className="cal-table">
          <thead>
            <tr>
              <th className="venue-cell" style={{ left: 0 }}>场地</th>
              <th className="slot-cell" style={{ left: 60 }}>时段</th>
              {dates.map((d) => {
                const ds = formatDate(d);
                const dow = d.getDay();
                const isWeekend = dow === 0 || dow === 6;
                const isToday = ds === today;
                return (
                  <th
                    key={ds}
                    className={`px-1 py-1 ${isToday ? 'bg-[var(--blue-bg)]' : ''}`}
                  >
                    <div className={`text-[10px] ${isWeekend ? 'text-[var(--red)]' : ''}`}>
                      周{DAY_NAMES[dow]}
                    </div>
                    <div className={`text-xs font-semibold ${isWeekend ? 'text-[var(--red)]' : ''}`}>
                      {d.getDate()}
                    </div>
                    <div className="text-[10px] text-[var(--ink3)]">
                      {d.getMonth() + 1}月
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {VENUES.map((venue) =>
              venue.slots.map((slot, slotIdx) => (
                <tr key={`${venue.id}-${slot}`}>
                  {slotIdx === 0 && (
                    <td
                      className="venue-cell"
                      rowSpan={venue.slots.length}
                      style={{ left: 0 }}
                    >
                      <div className="font-semibold text-xs">{venue.name}</div>
                      <div className="text-[10px] text-[var(--ink3)]">{venue.capacity}</div>
                    </td>
                  )}
                  <td className="slot-cell" style={{ left: 60 }}>
                    {slot}
                  </td>
                  {dates.map((d) => {
                    const ds = formatDate(d);
                    const isToday = ds === today;
                    const order = orderMap.get(`${ds}|${slot}|${venue.id}`);

                    return (
                      <td
                        key={ds}
                        className={`cal-cell ${isToday ? 'today' : ''}`}
                        style={
                          order
                            ? { backgroundColor: STATUS_CELL_COLORS[order.status] || 'transparent' }
                            : undefined
                        }
                        onClick={() => handleCellClick(ds, slot, venue.id)}
                        title={
                          order
                            ? `${order.client} ${order.pax}人 ${order.status}`
                            : '点击新建预定'
                        }
                      >
                        {order && (
                          <div
                            className="leading-tight"
                            style={{ color: STATUS_TEXT_COLORS[order.status] }}
                          >
                            <div className="text-[11px] font-medium truncate max-w-[52px]">
                              {order.client.slice(0, 4)}
                            </div>
                            <div className="text-[9px]">{order.pax}人</div>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
