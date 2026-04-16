// Supabase 对 PostgreSQL 的 numeric 类型返回字符串以避免精度丢失。
// 这里统一把金额字段转成 number，方便前端计算和显示。

const MONEY_FIELDS: Record<string, string[]> = {
  orders: ['deposit', 'estimated'],
  bills: ['total', 'food_cost', 'paid', 'biz_commission'],
  members: ['balance', 'old_debt', 'total_spent', 'wine_balance', 'venue_balance'],
  expenses: ['amount'],
  biz_settlements: ['amount'],
};

export function n(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  const parsed = parseFloat(String(v));
  return isNaN(parsed) ? 0 : parsed;
}

type Row = Record<string, unknown>;

export function normalizeRow<T extends Row>(row: T, table: keyof typeof MONEY_FIELDS | string): T {
  const fields = MONEY_FIELDS[table as string];
  if (!fields) return row;
  const out = { ...row } as Row;
  for (const f of fields) {
    if (f in out) out[f] = n(out[f]);
  }
  return out as T;
}

export function normalizeRows<T extends Row>(rows: T[] | null | undefined, table: keyof typeof MONEY_FIELDS | string): T[] {
  if (!rows) return [];
  return rows.map((r) => normalizeRow(r, table));
}

export function fmtMoney(v: unknown): string {
  return n(v).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
