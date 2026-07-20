'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { toBlob } from 'html-to-image';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Order } from '@/lib/types';
import { VENUES, ALL_SLOTS } from '@/lib/constants';
import { normalizeRows, n } from '@/lib/money';

const DAYS = 5;
const DEFAULT_TARGET = 500000;
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// 与档期页展开视图一致的状态配色
const BAND_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  '待确认': { bg: '#FFF3CD', border: '#F0C040', text: '#856404' },
  '已确认': { bg: '#D4EDDA', border: '#5CB85C', text: '#155724' },
  '待结账': { bg: '#FFE0CC', border: '#FF8C42', text: '#C35A00' },
  '已收款': { bg: '#E8D5F5', border: '#9B59B6', text: '#6F42C1' },
  '已入账': { bg: '#CCE5FF', border: '#2196F3', text: '#004085' },
};

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayLabel(offset: number): string {
  if (offset === 0) return '今天';
  if (offset === 1) return '明天';
  if (offset === 2) return '后天';
  return '';
}

// 金额显示：≥1万 显示为 X.X万
function fmtWan(v: number): string {
  if (Math.abs(v) >= 10000) {
    const w = v / 10000;
    return (Number.isInteger(w) ? w : w.toFixed(1)) + '万';
  }
  return v.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

export default function DailyReportPage() {
  const { role, roleLabel } = useAuth();
  const cardRef = useRef<HTMLDivElement>(null);

  // 管理层版：老板/总经理/财务可见可生成（运营负责人用财务号发给老板们）
  const canSeeMgmt = role === 'approve' || role === 'manager' || role === 'finance';
  const [mgmtMode, setMgmtMode] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // 经营数据
  const [monthDone, setMonthDone] = useState(0);      // 本月已完成（已确认账单实收）
  const [monthFoodCost, setMonthFoodCost] = useState(0);
  const [target, setTarget] = useState<number | null>(null); // null = 未填，按默认50万
  const [targetInput, setTargetInput] = useState('');
  const [yesterday, setYesterday] = useState({ count: 0, pax: 0, paid: 0 });

  useEffect(() => {
    if (canSeeMgmt) setMgmtMode(true);
  }, [canSeeMgmt]);

  const dates = useMemo(() => {
    const today = new Date();
    return Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, []);

  const now = dates[0];
  const thisMonth = fmtDate(now).slice(0, 7);
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  // 未来5天订单
  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .gte('date', fmtDate(dates[0]))
        .lte('date', fmtDate(dates[dates.length - 1]))
        .neq('status', '已取消')
        .is('deleted_at', null)
        .order('date');
      if (data) setOrders(normalizeRows(data, 'orders') as Order[]);
      setLoading(false);
    };
    fetch();
  }, [dates]);

  // 经营数据（管理层版）：本月实收/食材成本、昨日回顾、月度目标
  useEffect(() => {
    if (!canSeeMgmt) return;
    (async () => {
      const yd = new Date(now);
      yd.setDate(yd.getDate() - 1);
      const ydStr = fmtDate(yd);

      const { data: mb } = await supabase
        .from('bills')
        .select('paid, food_cost, date')
        .eq('confirmed', true)
        .is('deleted_at', null)
        .gte('date', thisMonth + '-01');
      const monthBills = normalizeRows(mb || [], 'bills') as { paid: number; food_cost: number; date: string }[];
      setMonthDone(monthBills.reduce((s, b) => s + n(b.paid), 0));
      setMonthFoodCost(monthBills.reduce((s, b) => s + n(b.food_cost), 0));
      setYesterday((prev) => ({ ...prev, paid: monthBills.filter((b) => b.date === ydStr).reduce((s, b) => s + n(b.paid), 0) }));

      const { data: yo } = await supabase
        .from('orders')
        .select('pax')
        .eq('date', ydStr)
        .neq('status', '已取消')
        .is('deleted_at', null);
      if (yo) setYesterday((prev) => ({ ...prev, count: yo.length, pax: yo.reduce((s, o) => s + (o.pax || 0), 0) }));

      // 月度目标表可能尚未创建（迁移未执行），失败时静默用默认值
      const { data: t } = await supabase
        .from('monthly_targets')
        .select('target')
        .eq('month', thisMonth)
        .maybeSingle();
      if (t) setTarget(n(t.target));
    })();
  }, [canSeeMgmt, thisMonth, now]);

  const saveTarget = async () => {
    const wan = parseFloat(targetInput);
    if (isNaN(wan) || wan <= 0) { setMsg('目标请填数字（单位：万）'); return; }
    const value = Math.round(wan * 10000);
    const { error } = await supabase
      .from('monthly_targets')
      .upsert({ month: thisMonth, target: value, updated_by: roleLabel, updated_at: new Date().toISOString() });
    if (error) {
      setMsg('保存失败：请先在 Supabase 执行 migrate_v2.5_monthly_targets.sql');
    } else {
      setTarget(value);
      setTargetInput('');
      setMsg(`本月目标已更新为 ${fmtWan(value)}`);
    }
  };

  // 场地+日期 -> 订单列表（按时段排序）
  const cellMap = useMemo(() => {
    const map = new Map<string, Order[]>();
    const slotIdx = (s: string) => {
      const i = (ALL_SLOTS as readonly string[]).indexOf(s);
      return i === -1 ? 99 : i;
    };
    for (const o of orders) {
      for (const v of o.venues || []) {
        const key = `${v}|${o.date}`;
        const arr = map.get(key) || [];
        arr.push(o);
        map.set(key, arr);
      }
    }
    for (const arr of Array.from(map.values())) {
      arr.sort((a, b) => slotIdx(a.slot) - slotIdx(b.slot));
    }
    return map;
  }, [orders]);

  const totals = useMemo(() => ({
    count: orders.length,
    pax: orders.reduce((s, o) => s + (o.pax || 0), 0),
    pending: orders.filter((o) => o.status === '待确认').length,
  }), [orders]);

  const dayTotals = useMemo(() => {
    const map = new Map<string, { count: number; pax: number }>();
    for (const d of dates) map.set(fmtDate(d), { count: 0, pax: 0 });
    for (const o of orders) {
      const t = map.get(o.date);
      if (t) { t.count += 1; t.pax += o.pax || 0; }
    }
    return map;
  }, [orders, dates]);

  // 月度进度指标
  const effTarget = target ?? DEFAULT_TARGET;
  const donePct = effTarget > 0 ? Math.round((monthDone / effTarget) * 100) : 0;
  const timePct = Math.round((dayOfMonth / daysInMonth) * 100);
  const remainDays = daysInMonth - dayOfMonth + 1; // 含今天
  const remainPerDay = Math.max(0, effTarget - monthDone) / remainDays;
  const foodRate = monthDone > 0 ? Math.round((monthFoodCost / monthDone) * 100) : 0;
  const aheadPct = donePct - timePct;

  const makePng = useCallback(async (): Promise<Blob | null> => {
    if (!cardRef.current) return null;
    // 先空跑一次让字体/样式内联缓存，避免首次生成缺字
    await toBlob(cardRef.current, { pixelRatio: 2 });
    return await toBlob(cardRef.current, { pixelRatio: 2 });
  }, []);

  const download = useCallback(async () => {
    setBusy(true); setMsg('');
    try {
      const blob = await makePng();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `云吉预定日报_${fmtDate(dates[0])}${mgmtMode ? '_管理层版' : ''}.png`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg('已下载，直接发到微信群即可');
    } finally {
      setBusy(false);
    }
  }, [makePng, dates, mgmtMode]);

  const copy = useCallback(() => {
    setBusy(true); setMsg('');
    // 必须在点击的同步调用栈里发起 clipboard.write（传入 Promise），
    // 否则图片生成耗时超过用户手势有效期后写剪贴板会被浏览器挂起/拒绝
    try {
      const item = new ClipboardItem({
        'image/png': makePng().then((b) => b || Promise.reject(new Error('生成失败'))),
      });
      navigator.clipboard.write([item])
        .then(() => setMsg('图片已复制，去微信直接粘贴发送'))
        .catch(() => setMsg('复制失败（浏览器不支持），请用"下载图片"'))
        .finally(() => setBusy(false));
    } catch {
      setMsg('复制失败（浏览器不支持），请用"下载图片"');
      setBusy(false);
    }
  }, [makePng]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1280px] mx-auto p-4 space-y-3">
        {/* 操作栏 */}
        <div className="bg-white rounded-xl border border-[var(--border)] p-3 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[180px]">
            <h2 className="text-base font-bold">预定日报</h2>
            <p className="text-[11px] text-[var(--ink3)]">{msg || '下方就是日报图片，点按钮下载或复制后发微信群'}</p>
          </div>
          {canSeeMgmt && (
            <>
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-[var(--ink3)]">本月目标</span>
                <input
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  placeholder={String((effTarget / 10000))}
                  className="w-[52px] px-2 py-1 border border-[var(--border)] rounded-md text-right outline-none focus:border-[var(--green)]"
                />
                <span className="text-[var(--ink3)]">万</span>
                <button onClick={saveTarget}
                  className="ml-1 px-2 py-1 rounded-md border border-[var(--green-border)] bg-[var(--green-bg)] text-[var(--green)] font-medium">
                  保存
                </button>
              </div>
              <div className="flex rounded-full bg-[var(--bg)] p-0.5 text-[11px]">
                <button
                  onClick={() => setMgmtMode(false)}
                  className={`px-3 py-1 rounded-full transition ${!mgmtMode ? 'bg-white shadow text-[var(--green)] font-medium' : 'text-[var(--ink3)]'}`}
                >
                  全员版
                </button>
                <button
                  onClick={() => setMgmtMode(true)}
                  className={`px-3 py-1 rounded-full transition ${mgmtMode ? 'bg-white shadow text-[var(--green)] font-medium' : 'text-[var(--ink3)]'}`}
                >
                  管理层版
                </button>
              </div>
            </>
          )}
          <div className="flex gap-2">
            <button onClick={download} disabled={loading || busy}
              className="px-4 py-2 rounded-lg bg-[var(--green)] text-white text-sm font-medium disabled:opacity-50">
              {busy ? '处理中…' : '下载图片'}
            </button>
            <button onClick={copy} disabled={loading || busy}
              className="px-4 py-2 rounded-lg border border-[var(--green-border)] bg-[var(--green-bg)] text-[var(--green)] text-sm font-medium disabled:opacity-50">
              复制图片
            </button>
          </div>
        </div>

        {/* 日报海报（页面即图片） */}
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <div
            ref={cardRef}
            style={{ width: 1200, background: '#F7F5F2', fontFamily: "'Noto Sans SC', -apple-system, sans-serif" }}
            className="p-5"
          >
            {/* 头部 */}
            <div className="flex items-end justify-between pb-3 border-b-2 border-[#2D6A4F]">
              <div>
                <div className="text-[20px] font-bold text-[#1C1A17]">
                  云吉合院 · 每日经营汇报
                </div>
                <div className="text-[12px] text-[#9A9389] mt-1">
                  {now.getFullYear()}年{now.getMonth() + 1}月{now.getDate()}日 {WEEKDAYS[now.getDay()]}
                  {mgmtMode ? ' · 管理层版' : ''}
                </div>
              </div>
              <div className="text-right text-[13px] text-[#5C5750]">
                <span className="font-medium">未来 {DAYS} 天：{totals.count} 单 · {totals.pax} 人</span>
                {totals.pending > 0 && (
                  <span className="text-[#C35A00] font-bold"> · ⚠ {totals.pending} 单待确认</span>
                )}
              </div>
            </div>

            {/* 管理层版：本月经营进度 */}
            {mgmtMode && (
              <div className="mt-3 grid grid-cols-5 gap-2">
                <div className="bg-white rounded-lg border border-[rgba(28,26,23,.12)] px-3 py-2.5">
                  <div className="text-[11px] text-[#9A9389]">本月目标{target === null ? '（默认）' : ''}</div>
                  <div className="text-[18px] font-bold text-[#1C1A17] mt-0.5">¥{fmtWan(effTarget)}</div>
                </div>
                <div className="bg-white rounded-lg border border-[rgba(28,26,23,.12)] px-3 py-2.5">
                  <div className="text-[11px] text-[#9A9389]">已完成（实收）</div>
                  <div className="text-[18px] font-bold text-[#2D6A4F] mt-0.5">
                    ¥{fmtWan(monthDone)}
                    <span className="text-[12px] ml-1">{donePct}%</span>
                  </div>
                  <div className="w-full bg-[#E8E4DF] rounded-full h-1.5 mt-1.5">
                    <div className="h-1.5 rounded-full bg-[#2D6A4F]" style={{ width: `${Math.min(donePct, 100)}%` }} />
                  </div>
                </div>
                <div className="bg-white rounded-lg border border-[rgba(28,26,23,.12)] px-3 py-2.5">
                  <div className="text-[11px] text-[#9A9389]">时间进度（第{dayOfMonth}/{daysInMonth}天）</div>
                  <div className={`text-[18px] font-bold mt-0.5 ${aheadPct >= 0 ? 'text-[#2D6A4F]' : 'text-[#C35A00]'}`}>
                    {timePct}%
                    <span className="text-[12px] ml-1">{aheadPct >= 0 ? `超前${aheadPct}%` : `落后${-aheadPct}%`}</span>
                  </div>
                  <div className="w-full bg-[#E8E4DF] rounded-full h-1.5 mt-1.5">
                    <div className="h-1.5 rounded-full bg-[#9A9389]" style={{ width: `${Math.min(timePct, 100)}%` }} />
                  </div>
                </div>
                <div className="bg-white rounded-lg border border-[rgba(28,26,23,.12)] px-3 py-2.5">
                  <div className="text-[11px] text-[#9A9389]">剩余{remainDays}天 · 日均需</div>
                  <div className="text-[18px] font-bold text-[#1B4F7A] mt-0.5">¥{fmtWan(Math.round(remainPerDay))}</div>
                  <div className="text-[10px] text-[#9A9389] mt-1">缺口 ¥{fmtWan(Math.max(0, effTarget - monthDone))}</div>
                </div>
                <div className="bg-white rounded-lg border border-[rgba(28,26,23,.12)] px-3 py-2.5">
                  <div className="text-[11px] text-[#9A9389]">昨日</div>
                  <div className="text-[18px] font-bold text-[#1C1A17] mt-0.5">
                    {yesterday.count} 单 · {yesterday.pax} 人
                  </div>
                  <div className="text-[10px] text-[#9A9389] mt-1">
                    实收 ¥{fmtWan(yesterday.paid)} · 食材率 {foodRate}%（目标≤35%）
                  </div>
                </div>
              </div>
            )}

            {loading ? (
              <div className="py-10 text-center text-sm text-[#9A9389]">加载中…</div>
            ) : (
              <>
                {/* 未来5天档期网格 */}
                <table className="w-full border-collapse bg-white mt-3" style={{ tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th className="w-[68px] border border-[rgba(28,26,23,.12)] bg-[#EFECE8] py-2 text-[12px] text-[#5C5750] font-medium">
                        场地
                      </th>
                      {dates.map((d, i) => {
                        const label = dayLabel(i);
                        const dt = dayTotals.get(fmtDate(d));
                        const isToday = i === 0;
                        return (
                          <th key={i} className={`border border-[rgba(28,26,23,.12)] py-1.5 px-1 ${isToday ? 'bg-[#EAF4EE]' : 'bg-[#EFECE8]'}`}>
                            <div className={`text-[13px] font-bold ${isToday ? 'text-[#2D6A4F]' : 'text-[#1C1A17]'}`}>
                              {d.getMonth() + 1}月{d.getDate()}日 {WEEKDAYS[d.getDay()]}
                              {label && (
                                <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white ${isToday ? 'bg-[#2D6A4F]' : 'bg-[#9A9389]'}`}>
                                  {label}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-[#9A9389] font-normal mt-0.5">
                              {dt && dt.count > 0 ? <>{dt.count} 单 · {dt.pax} 人</> : '—'}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {VENUES.map((venue) => (
                      <tr key={venue.id}>
                        <td className="border border-[rgba(28,26,23,.12)] bg-[#EFECE8] text-center py-2 align-middle">
                          <div className="text-[12px] font-bold text-[#1C1A17]">{venue.name}</div>
                          <div className="text-[10px] text-[#9A9389]">{venue.capacity}</div>
                        </td>
                        {dates.map((d, i) => {
                          const cellOrders = cellMap.get(`${venue.id}|${fmtDate(d)}`) || [];
                          return (
                            <td key={i} className={`border border-[rgba(28,26,23,.12)] p-1 align-top ${i === 0 ? 'bg-[#EAF4EE]/40' : ''}`}>
                              <div className="flex flex-col gap-1">
                                {cellOrders.map((o) => {
                                  const c = BAND_COLORS[o.status] || BAND_COLORS['待确认'];
                                  return (
                                    <div
                                      key={o.id}
                                      className="rounded-md px-2 py-1.5"
                                      style={{ backgroundColor: c.bg, border: `1.5px solid ${c.border}` }}
                                    >
                                      <div className="flex items-center justify-between gap-1">
                                        <span className="text-[13px] font-semibold truncate" style={{ color: c.text }}>
                                          {o.client}
                                        </span>
                                        <span
                                          className="text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap font-medium"
                                          style={{ backgroundColor: c.border + '30', color: c.text }}
                                        >
                                          {o.status}
                                        </span>
                                      </div>
                                      <div className="text-[11px] mt-0.5" style={{ color: c.text }}>
                                        {o.slot} · {o.pax}人 · {o.type}
                                      </div>
                                      {o.biz_name && (
                                        <div className="text-[10px] mt-0.5 text-[#9A9389]">商务：{o.biz_name}</div>
                                      )}
                                      {o.note && (
                                        <div className="text-[10px] mt-0.5 text-[#8B5E1A]">{o.note}</div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* 底部：图例 */}
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-3">
                    {Object.entries(BAND_COLORS).map(([status, c]) => (
                      <span key={status} className="flex items-center gap-1 text-[10px] text-[#5C5750]">
                        <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: c.bg, border: `1px solid ${c.border}` }} />
                        {status}
                      </span>
                    ))}
                  </div>
                  <div className="text-[11px] text-[#9A9389]">云吉合院运营管理系统 · 自动生成</div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
