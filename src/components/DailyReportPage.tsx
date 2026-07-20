'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { toPng } from 'html-to-image';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Order } from '@/lib/types';
import { VENUES, ALL_SLOTS, STATUS_COLORS } from '@/lib/constants';
import { normalizeRows, fmtMoney, n } from '@/lib/money';

const DAYS = 5;
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const VENUE_NAMES: Record<string, string> = Object.fromEntries(
  VENUES.map((v) => [v.id, v.name])
);

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

function venueLabel(ids: string[]): string {
  if (!ids || ids.length === 0) return '未定场地';
  return ids.map((id) => VENUE_NAMES[id] || id).join('+');
}

export default function DailyReportPage() {
  const { role } = useAuth();
  const cardRef = useRef<HTMLDivElement>(null);

  const canSeeMoney = role === 'approve' || role === 'manager';
  const [bossMode, setBossMode] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    if (canSeeMoney) setBossMode(true);
  }, [canSeeMoney]);

  const dates = useMemo(() => {
    const today = new Date();
    return Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, []);

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

  // 按日期分组，组内按时段、场地排序
  const byDay = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const d of dates) map.set(fmtDate(d), []);
    for (const o of orders) {
      const arr = map.get(o.date);
      if (arr) arr.push(o);
    }
    const slotIdx = (s: string) => {
      const i = (ALL_SLOTS as readonly string[]).indexOf(s);
      return i === -1 ? 99 : i;
    };
    const venueIdx = (o: Order) =>
      Math.min(...(o.venues?.length ? o.venues.map((v) => {
        const i = VENUES.findIndex((x) => x.id === v);
        return i === -1 ? 99 : i;
      }) : [99]));
    for (const arr of Array.from(map.values())) {
      arr.sort((a, b) => slotIdx(a.slot) - slotIdx(b.slot) || venueIdx(a) - venueIdx(b));
    }
    return map;
  }, [orders, dates]);

  const totals = useMemo(() => {
    const count = orders.length;
    const pax = orders.reduce((s, o) => s + (o.pax || 0), 0);
    const estimated = orders.reduce((s, o) => s + n(o.estimated), 0);
    const deposit = orders.reduce((s, o) => s + n(o.deposit), 0);
    const pending = orders.filter((o) => o.status === '待确认').length;
    return { count, pax, estimated, deposit, pending };
  }, [orders]);

  const generate = useCallback(async () => {
    if (!cardRef.current) return;
    setGenerating(true);
    try {
      // 先空跑一次让字体/样式内联缓存，避免首次生成缺字
      await toPng(cardRef.current, { pixelRatio: 2 });
      const url = await toPng(cardRef.current, { pixelRatio: 2 });
      setImgUrl(url);
    } finally {
      setGenerating(false);
    }
  }, []);

  const download = useCallback(() => {
    if (!imgUrl) return;
    const a = document.createElement('a');
    a.href = imgUrl;
    a.download = `云吉预定日报_${fmtDate(dates[0])}${bossMode ? '_老板版' : ''}.png`;
    a.click();
  }, [imgUrl, dates, bossMode]);

  const rangeText = `${dates[0].getMonth() + 1}月${dates[0].getDate()}日 — ${dates[DAYS - 1].getMonth() + 1}月${dates[DAYS - 1].getDate()}日`;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[720px] mx-auto p-4 space-y-4">
        {/* 操作栏 */}
        <div className="bg-white rounded-xl border border-[var(--border)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold">预定日报</h2>
              <p className="text-[11px] text-[var(--ink3)] mt-0.5">
                未来 {DAYS} 天预定一键生成图片，发到微信群代替手动截图
              </p>
            </div>
            {canSeeMoney && (
              <div className="flex rounded-full bg-[var(--bg)] p-0.5 text-[11px]">
                <button
                  onClick={() => { setBossMode(false); setImgUrl(null); }}
                  className={`px-3 py-1 rounded-full transition ${!bossMode ? 'bg-white shadow text-[var(--green)] font-medium' : 'text-[var(--ink3)]'}`}
                >
                  全员版
                </button>
                <button
                  onClick={() => { setBossMode(true); setImgUrl(null); }}
                  className={`px-3 py-1 rounded-full transition ${bossMode ? 'bg-white shadow text-[var(--green)] font-medium' : 'text-[var(--ink3)]'}`}
                >
                  老板版
                </button>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={generate}
              disabled={loading || generating}
              className="flex-1 py-2 rounded-lg bg-[var(--green)] text-white text-sm font-medium disabled:opacity-50"
            >
              {generating ? '生成中…' : '生成日报图片'}
            </button>
            {imgUrl && (
              <button
                onClick={download}
                className="px-4 py-2 rounded-lg border border-[var(--green-border)] bg-[var(--green-bg)] text-[var(--green)] text-sm font-medium"
              >
                下载
              </button>
            )}
          </div>
          {imgUrl && (
            <p className="text-[11px] text-[var(--ink3)]">
              手机上：长按下方图片 → 保存/转发到微信群；电脑上：点&ldquo;下载&rdquo;后发送图片文件。
            </p>
          )}
        </div>

        {/* 生成的图片（手机长按转发） */}
        {imgUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgUrl} alt="预定日报" className="w-full rounded-xl border border-[var(--border)]" />
        )}

        {/* 报告卡片（截图源） */}
        <div className="overflow-x-auto">
          <div
            ref={cardRef}
            style={{ width: 640, background: '#F7F5F2', fontFamily: "'Noto Sans SC', -apple-system, sans-serif" }}
            className="mx-auto p-5"
          >
            {/* 头部 */}
            <div className="flex items-end justify-between pb-3 border-b-2 border-[#2D6A4F]">
              <div>
                <div className="text-[20px] font-bold text-[#1C1A17]">云吉合院 · 预定日报</div>
                <div className="text-[12px] text-[#9A9389] mt-1">{rangeText} · 未来 {DAYS} 天{bossMode ? ' · 老板版' : ''}</div>
              </div>
              <div className="text-right text-[12px] text-[#5C5750]">
                <div className="font-medium">{totals.count} 单 · {totals.pax} 人</div>
                {bossMode && totals.estimated > 0 && (
                  <div className="text-[#2D6A4F] font-bold">预估 ¥{fmtMoney(totals.estimated)}</div>
                )}
              </div>
            </div>

            {loading ? (
              <div className="py-10 text-center text-sm text-[#9A9389]">加载中…</div>
            ) : (
              <div className="space-y-3 mt-3">
                {dates.map((d, i) => {
                  const key = fmtDate(d);
                  const dayOrders = byDay.get(key) || [];
                  const label = dayLabel(i);
                  const dayPax = dayOrders.reduce((s, o) => s + (o.pax || 0), 0);
                  const dayEst = dayOrders.reduce((s, o) => s + n(o.estimated), 0);
                  return (
                    <div key={key} className="bg-white rounded-xl border border-[rgba(28,26,23,.12)] overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 bg-[#EFECE8]">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] font-bold text-[#1C1A17]">
                            {d.getMonth() + 1}月{d.getDate()}日 {WEEKDAYS[d.getDay()]}
                          </span>
                          {label && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#2D6A4F] text-white font-medium">{label}</span>
                          )}
                        </div>
                        <span className="text-[11px] text-[#5C5750]">
                          {dayOrders.length > 0
                            ? <>{dayOrders.length} 单 · {dayPax} 人{bossMode && dayEst > 0 ? ` · 预估 ¥${fmtMoney(dayEst)}` : ''}</>
                            : ''}
                        </span>
                      </div>
                      {dayOrders.length === 0 ? (
                        <div className="px-4 py-3 text-[12px] text-[#9A9389]">暂无预定</div>
                      ) : (
                        <div className="divide-y divide-[rgba(28,26,23,.08)]">
                          {dayOrders.map((o) => {
                            const sc = STATUS_COLORS[o.status] || STATUS_COLORS['待确认'];
                            return (
                              <div key={o.id} className="px-4 py-2.5 flex items-start gap-3">
                                <div className="w-[42px] flex-shrink-0 text-center">
                                  <div className="text-[12px] font-bold text-[#2D6A4F]">{o.slot}</div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[13px] font-bold text-[#1C1A17]">{venueLabel(o.venues)}</span>
                                    <span className="text-[13px] text-[#1C1A17]">{o.client}</span>
                                    <span className="text-[12px] text-[#5C5750]">{o.pax}人 · {o.type}</span>
                                  </div>
                                  <div className="text-[11px] text-[#9A9389] mt-0.5">
                                    {o.biz_name ? `商务：${o.biz_name}` : ''}
                                    {o.biz_name && o.note ? ' · ' : ''}
                                    {o.note || ''}
                                  </div>
                                </div>
                                <div className="flex-shrink-0 text-right">
                                  <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full border ${sc.bg} ${sc.text} ${sc.border}`}>
                                    {o.status}
                                  </span>
                                  {bossMode && (n(o.estimated) > 0 || n(o.deposit) > 0) && (
                                    <div className="text-[11px] text-[#5C5750] mt-1">
                                      {n(o.estimated) > 0 && <span>预估 ¥{fmtMoney(o.estimated)}</span>}
                                      {n(o.estimated) > 0 && n(o.deposit) > 0 && <br />}
                                      {n(o.deposit) > 0 && <span className="text-[#6F42C1]">定金 ¥{fmtMoney(o.deposit)}</span>}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* 汇总 */}
                <div className="bg-white rounded-xl border border-[rgba(28,26,23,.12)] px-4 py-3">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-bold text-[#1C1A17]">合计</span>
                    <span className="text-[#5C5750]">
                      {totals.count} 单 · {totals.pax} 人
                      {totals.pending > 0 && <span className="text-[#C35A00] font-medium"> · 待确认 {totals.pending} 单</span>}
                    </span>
                  </div>
                  {bossMode && (
                    <div className="flex items-center justify-between text-[12px] mt-1.5 pt-1.5 border-t border-[rgba(28,26,23,.08)]">
                      <span className="text-[#5C5750]">预估营收 <span className="font-bold text-[#2D6A4F]">¥{fmtMoney(totals.estimated)}</span></span>
                      <span className="text-[#5C5750]">已收定金 <span className="font-bold text-[#6F42C1]">¥{fmtMoney(totals.deposit)}</span></span>
                    </div>
                  )}
                </div>

                <div className="text-center text-[10px] text-[#9A9389] pt-1">
                  云吉合院运营管理系统 · 自动生成
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
