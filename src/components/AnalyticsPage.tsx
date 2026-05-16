'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Card,
  Metric,
  Text,
  Title,
  Subtitle,
  AreaChart,
  BarChart,
  DonutChart,
  BarList,
  Grid,
  Flex,
  Badge,
  TabGroup,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
} from '@tremor/react';
import { normalizeRows } from '@/lib/money';
import { Bill, Expense, Order, Member } from '@/lib/types';

// 当前月 & 近 6 个月范围
function monthsBack(n: number): string[] {
  const arr: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    arr.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
  }
  return arr;
}

const fmtMoney = (n: number) => `¥${Math.round(n).toLocaleString('zh-CN')}`;
const fmtMoneyWan = (n: number) =>
  Math.abs(n) >= 10000 ? `¥${(n / 10000).toFixed(1)}万` : fmtMoney(n);

// 月度盈亏平衡线（从记忆里：¥49.5–54.5 万，按 ¥52 万取中值）
const BREAKEVEN_PER_MONTH = 520_000;
// 月度归属工资预估（4 月 ¥13.5 万，可手动调）
const ESTIMATED_PAYROLL_PER_MONTH = 135_000;
// 非经营性支出类别（剔除后做 P&L）
const NON_OPERATIONAL_CATEGORIES = new Set(['备用金', '资金退还', '往来款']);

export default function AnalyticsPage() {
  const [bills, setBills] = useState<(Bill & { type?: string })[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const monthList = useMemo(() => monthsBack(6), []);
  const thisMonth = monthList[monthList.length - 1];
  const rangeStart = `${monthList[0]}-01`;

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [b, e, o, m] = await Promise.all([
        supabase.from('bills').select('*, orders(type, biz_name)').eq('confirmed', true).is('deleted_at', null).gte('date', rangeStart),
        supabase.from('expenses').select('*').is('deleted_at', null).gte('period', monthList[0]),
        supabase.from('orders').select('*').is('deleted_at', null).gte('date', rangeStart),
        supabase.from('members').select('*').is('deleted_at', null),
      ]);
      setBills(
        ((b.data || []) as Array<Record<string, unknown>>).map((row) => {
          const ord = row.orders as Record<string, string> | null;
          const nr = normalizeRows([row], 'bills')[0] as Record<string, unknown>;
          return { ...nr, type: ord?.type || '', biz_name: nr.biz_name || ord?.biz_name || '' };
        }) as (Bill & { type?: string })[]
      );
      setExpenses(normalizeRows(e.data, 'expenses') as Expense[]);
      setOrders((o.data || []) as Order[]);
      setMembers((m.data || []) as Member[]);
      setLoading(false);
    })();
  }, [rangeStart, monthList]);

  // ===== 按月聚合 =====
  const monthlyRevenue = useMemo(() => {
    const map: Record<string, number> = Object.fromEntries(monthList.map((m) => [m, 0]));
    for (const b of bills) {
      const m = b.date?.slice(0, 7);
      if (m && m in map) map[m] += Number(b.total) || 0;
    }
    return map;
  }, [bills, monthList]);

  const monthlyExpense = useMemo(() => {
    const map: Record<string, number> = Object.fromEntries(monthList.map((m) => [m, 0]));
    for (const e of expenses) {
      const m = e.period;
      if (m && m in map && !NON_OPERATIONAL_CATEGORIES.has(e.category)) {
        map[m] += Number(e.amount) || 0;
      }
    }
    return map;
  }, [expenses, monthList]);

  const trendData = useMemo(
    () =>
      monthList.map((m) => ({
        月份: m.slice(5) + '月',
        营收: monthlyRevenue[m] || 0,
        经营性支出: monthlyExpense[m] || 0,
        盈亏: (monthlyRevenue[m] || 0) - (monthlyExpense[m] || 0) - ESTIMATED_PAYROLL_PER_MONTH,
      })),
    [monthList, monthlyRevenue, monthlyExpense]
  );

  // ===== 本月核心指标 =====
  const thisMonthBills = bills.filter((b) => b.date?.startsWith(thisMonth));
  const thisMonthExp = expenses.filter((e) => e.period === thisMonth && !NON_OPERATIONAL_CATEGORIES.has(e.category));
  const thisMonthOrders = orders.filter((o) => o.date?.startsWith(thisMonth) && o.status !== '已取消');

  const revenue = thisMonthBills.reduce((s, b) => s + (Number(b.total) || 0), 0);
  const opExpense = thisMonthExp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const cashPL = revenue - opExpense;
  const accrualPL = cashPL - ESTIMATED_PAYROLL_PER_MONTH;
  const foodCost = thisMonthBills.reduce((s, b) => s + (Number(b.food_cost) || 0), 0);
  const foodCostRate = revenue > 0 ? (foodCost / revenue) * 100 : 0;
  const grossMargin = revenue > 0 ? ((revenue - foodCost) / revenue) * 100 : 0;

  // 上月对比
  const lastMonth = monthList[monthList.length - 2];
  const lastRevenue = monthlyRevenue[lastMonth] || 0;
  const revenueGrowth = lastRevenue > 0 ? ((revenue - lastRevenue) / lastRevenue) * 100 : 0;

  // 距盈亏平衡线
  const breakevenDelta = revenue - BREAKEVEN_PER_MONTH;
  const breakevenAchievement = (revenue / BREAKEVEN_PER_MONTH) * 100;

  // 散客占比
  const guestBills = thisMonthBills.filter((b) => !b.member_id);
  const guestRatio = thisMonthBills.length > 0 ? (guestBills.length / thisMonthBills.length) * 100 : 0;

  // 会员激活（本月有账单的会员数）
  const activeMemberIds = new Set(thisMonthBills.filter((b) => b.member_id).map((b) => b.member_id));
  const activeMemberCount = activeMemberIds.size;
  const totalMemberCount = members.length;

  // 商务渠道 Top
  const bizMap = new Map<string, number>();
  for (const b of thisMonthBills) {
    if (!b.biz_name) continue;
    bizMap.set(b.biz_name, (bizMap.get(b.biz_name) || 0) + Number(b.total));
  }
  const bizTop = Array.from(bizMap.entries())
    .map(([name, v]) => ({ name, value: v }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const bizRevenue = bizTop.reduce((s, x) => s + x.value, 0);
  const bizRatio = revenue > 0 ? (bizRevenue / revenue) * 100 : 0;

  // 时段分布
  const slotMap: Record<string, number> = {};
  for (const o of thisMonthOrders) {
    slotMap[o.slot] = (slotMap[o.slot] || 0) + 1;
  }
  const slotData = Object.entries(slotMap).map(([name, count]) => ({ name, value: count }));

  // 类别分布
  const typeMap: Record<string, number> = {};
  for (const b of thisMonthBills) {
    if (b.type) typeMap[b.type] = (typeMap[b.type] || 0) + Number(b.total);
  }
  const typeData = Object.entries(typeMap).map(([name, value]) => ({ name, value }));

  // 客单价
  const avgTicket = thisMonthBills.length > 0 ? revenue / thisMonthBills.length : 0;

  // 数据质量
  const phoneCovered = thisMonthOrders.filter((o) => o.phone && o.phone.length >= 7).length;
  const phoneCoverRate = thisMonthOrders.length > 0 ? (phoneCovered / thisMonthOrders.length) * 100 : 0;
  const abnormalFoodCost = thisMonthBills.filter(
    (b) => Number(b.total) > 0 && Number(b.food_cost) / Number(b.total) > 0.6
  ).length;

  if (loading) {
    return <div className="p-8 text-center text-[var(--ink3)]">加载中...</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-4 bg-[var(--bg)]">
      <Flex justifyContent="between" alignItems="center">
        <div>
          <Title>经营分析</Title>
          <Subtitle>本月 {thisMonth} · 数据实时来自 Supabase · 老板与总经理共享</Subtitle>
        </div>
        <Badge color={accrualPL >= 0 ? 'green' : 'red'} size="lg">
          权责口径 {accrualPL >= 0 ? '+' : ''}{fmtMoneyWan(accrualPL)}
        </Badge>
      </Flex>

      {/* 顶部 KPI 卡片 */}
      <Grid numItemsMd={2} numItemsLg={4} className="gap-4">
        <Card decoration="top" decorationColor="green">
          <Text>本月营收</Text>
          <Metric>{fmtMoneyWan(revenue)}</Metric>
          <Flex className="mt-2" justifyContent="start">
            <Badge color={revenueGrowth >= 0 ? 'emerald' : 'red'} size="xs">
              {revenueGrowth >= 0 ? '↑' : '↓'} {Math.abs(revenueGrowth).toFixed(1)}%
            </Badge>
            <Text className="ml-2 text-xs">vs 上月 {fmtMoneyWan(lastRevenue)}</Text>
          </Flex>
        </Card>
        <Card decoration="top" decorationColor="amber">
          <Text>经营性支出</Text>
          <Metric>{fmtMoneyWan(opExpense)}</Metric>
          <Text className="mt-2 text-xs">归属本月，剔除往来款/备用金</Text>
        </Card>
        <Card decoration="top" decorationColor={cashPL >= 0 ? 'emerald' : 'red'}>
          <Text>现金口径盈亏</Text>
          <Metric>{cashPL >= 0 ? '+' : ''}{fmtMoneyWan(cashPL)}</Metric>
          <Text className="mt-2 text-xs">未计归属工资 {fmtMoneyWan(ESTIMATED_PAYROLL_PER_MONTH)}</Text>
        </Card>
        <Card decoration="top" decorationColor={breakevenDelta >= 0 ? 'emerald' : 'red'}>
          <Text>距盈亏平衡线</Text>
          <Metric>{breakevenDelta >= 0 ? '+' : ''}{fmtMoneyWan(breakevenDelta)}</Metric>
          <Flex className="mt-2" justifyContent="start">
            <Text className="text-xs">达成率 {breakevenAchievement.toFixed(0)}% / 线 {fmtMoneyWan(BREAKEVEN_PER_MONTH)}</Text>
          </Flex>
        </Card>
      </Grid>

      {/* Tabs 分组 */}
      <TabGroup>
        <TabList variant="solid" className="mt-2">
          <Tab>趋势</Tab>
          <Tab>结构</Tab>
          <Tab>客户</Tab>
          <Tab>数据质量</Tab>
        </TabList>

        <TabPanels>
          {/* === 趋势 === */}
          <TabPanel>
            <Card className="mt-4">
              <Title>近 6 个月营收 / 支出 / 盈亏</Title>
              <Subtitle>权责发生制，按 expenses.period 归属月分摊，含 ¥{(ESTIMATED_PAYROLL_PER_MONTH / 1000).toFixed(0)}k 月度归属工资</Subtitle>
              <AreaChart
                className="mt-4 h-72"
                data={trendData}
                index="月份"
                categories={['营收', '经营性支出', '盈亏']}
                colors={['emerald', 'amber', 'blue']}
                valueFormatter={fmtMoneyWan}
                yAxisWidth={70}
              />
            </Card>
          </TabPanel>

          {/* === 结构 === */}
          <TabPanel>
            <Grid numItemsMd={2} className="gap-4 mt-4">
              <Card>
                <Title>本月营收按类别</Title>
                <DonutChart
                  className="mt-4 h-56"
                  data={typeData}
                  category="value"
                  index="name"
                  colors={['emerald', 'blue', 'amber', 'rose', 'violet']}
                  valueFormatter={fmtMoneyWan}
                />
              </Card>
              <Card>
                <Title>本月时段订单分布</Title>
                <BarChart
                  className="mt-4 h-56"
                  data={slotData}
                  index="name"
                  categories={['value']}
                  colors={['blue']}
                  yAxisWidth={36}
                  showLegend={false}
                />
              </Card>
              <Card>
                <Title>商务渠道 Top（本月）</Title>
                <Subtitle>商务带客占营收 {bizRatio.toFixed(1)}%</Subtitle>
                <BarList
                  className="mt-4"
                  data={bizTop.map((x) => ({ name: x.name, value: x.value, color: 'blue' }))}
                  valueFormatter={fmtMoneyWan}
                />
              </Card>
              <Card>
                <Title>毛利率 & 食材成本率</Title>
                <Grid numItems={2} className="mt-4 gap-4">
                  <div>
                    <Text>食材成本率</Text>
                    <Metric className={foodCostRate > 40 ? 'text-red-600' : 'text-emerald-600'}>
                      {foodCostRate.toFixed(1)}%
                    </Metric>
                    <Text className="text-xs mt-1">¥{fmtMoneyWan(foodCost)} / ¥{fmtMoneyWan(revenue)}</Text>
                  </div>
                  <div>
                    <Text>毛利率</Text>
                    <Metric className="text-blue-600">{grossMargin.toFixed(1)}%</Metric>
                    <Text className="text-xs mt-1">营收 − 食材</Text>
                  </div>
                </Grid>
                <Text className="mt-3 text-xs text-gray-500">参考：4 月基线食材率 32.2%，红线 40%</Text>
              </Card>
            </Grid>
          </TabPanel>

          {/* === 客户 === */}
          <TabPanel>
            <Grid numItemsMd={3} className="gap-4 mt-4">
              <Card>
                <Text>本月订单数</Text>
                <Metric>{thisMonthOrders.length}</Metric>
                <Text className="text-xs mt-2">已结账单 {thisMonthBills.length} 张</Text>
              </Card>
              <Card>
                <Text>客单价</Text>
                <Metric>{fmtMoneyWan(avgTicket)}</Metric>
                <Text className="text-xs mt-2">营收 / 已确认账单数</Text>
              </Card>
              <Card>
                <Text>会员激活</Text>
                <Metric>{activeMemberCount} / {totalMemberCount}</Metric>
                <Text className="text-xs mt-2">本月有消费的会员 / 总会员数</Text>
              </Card>
              <Card>
                <Text>散客占比</Text>
                <Metric className={guestRatio > 80 ? 'text-amber-600' : 'text-emerald-600'}>
                  {guestRatio.toFixed(1)}%
                </Metric>
                <Text className="text-xs mt-2">{guestBills.length} / {thisMonthBills.length} 张账单</Text>
                <Text className="text-xs text-gray-500 mt-1">4 月基线 99.6%，目标降到 70% 以下</Text>
              </Card>
              <Card>
                <Text>商务渠道占比</Text>
                <Metric>{bizRatio.toFixed(1)}%</Metric>
                <Text className="text-xs mt-2">商务带客营收 / 总营收</Text>
              </Card>
            </Grid>
          </TabPanel>

          {/* === 数据质量 === */}
          <TabPanel>
            <Grid numItemsMd={2} className="gap-4 mt-4">
              <Card>
                <Text>客户手机号覆盖率</Text>
                <Metric className={phoneCoverRate < 50 ? 'text-red-600' : 'text-emerald-600'}>
                  {phoneCoverRate.toFixed(0)}%
                </Metric>
                <Text className="text-xs mt-2">{phoneCovered} / {thisMonthOrders.length} 单</Text>
                <Text className="text-xs text-gray-500 mt-1">4 月基线 0%，目标 80%+</Text>
              </Card>
              <Card>
                <Text>食材率异常订单</Text>
                <Metric className={abnormalFoodCost > 5 ? 'text-red-600' : 'text-emerald-600'}>
                  {abnormalFoodCost} 单
                </Metric>
                <Text className="text-xs mt-2">食材成本率 &gt; 60%（疑似录错）</Text>
              </Card>
            </Grid>
          </TabPanel>
        </TabPanels>
      </TabGroup>

      <Text className="text-xs text-gray-400 text-center mt-4">
        分析口径与 4 月经营基线一致 · 月度盈亏平衡线 ¥{(BREAKEVEN_PER_MONTH / 10000).toFixed(0)}万 · 归属工资 ¥{(ESTIMATED_PAYROLL_PER_MONTH / 10000).toFixed(1)}万
      </Text>
    </div>
  );
}
