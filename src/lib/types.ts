export interface Order {
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
  estimated: number;
  member_id: number | null;
  biz_name: string;
  cancel_note: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export interface Bill {
  id: number;
  order_id: number;
  date: string;
  total: number;
  discount: number;
  food_cost: number;
  paid: number;
  method: string;
  confirmed: boolean;
  confirmed_at: string | null;
  member_id: number | null;
  biz_name: string;
  biz_commission: number;
  butler: string;
  server: string;
  chef: string;
  stars: number;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export interface Member {
  id: number;
  name: string;
  phone: string;
  level: string;
  discount: number | null;
  balance: number;
  fee_expiry: string | null;
  old_debt: number;
  total_spent: number;
  visits: number;
  biz_name: string;
  note: string;
  wine_balance: number;
  venue_balance: number;
  venue_discount: number | null;
  no_service_fee: boolean;
  source: string | null;
  old_card_no: string | null;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export interface Expense {
  id: number;
  date: string;
  period: string;      // 归属月份 YYYY-MM，用于 P&L 计算
  category: string;
  amount: number;
  supplier: string;
  note: string;
  items: ExpenseItem[];
  submitted_by: string;
  status: string;
  approved_by: string;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export interface ExpenseItem {
  name: string;
  qty: number;
  price: number;
}

export interface AuditLog {
  id: number;
  table_name: string;
  record_id: number;
  action: string;
  detail: string;
  operator: string;
  created_at: string;
}

export interface BusinessContact {
  id: number;
  name: string;
  phone: string;
  status: 'active' | 'paused';
  start_date: string | null;
  note: string;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export interface BizSettlement {
  id: number;
  biz_contact_id: number;
  biz_name: string;
  amount: number;
  settled_at: string;
  settled_by: string;
  note: string;
  created_at: string;
}

export const DEFAULT_DISCOUNTS: Record<string, number> = {
  '散客': 100,
  '特别VIP': 100,
  '逢吉': 100,
  '承吉': 88,
  '享吉': 75,
  '开吉': 60,
  '云集旧会员': 100,
  '股东': 60,
};

export const PAYMENT_METHODS = ['微信', '现金', '储值扣减', '挂账', '转账'] as const;

// 折扣数字转中文显示
const DISCOUNT_NAMES: Record<number, string> = {
  50: '五折', 60: '六折', 70: '七折', 75: '75折', 80: '八折',
  85: '85折', 88: '88折', 90: '九折', 95: '95折', 100: '无折扣',
};
export function formatDiscount(val: number | null | undefined): string {
  if (val === null || val === undefined) return '正常价';
  if (val === 0) return '免费';
  return DISCOUNT_NAMES[val] || `${val}%`;
}

export function formatVenueDiscount(val: number | null | undefined): string {
  if (val === null || val === undefined) return '正常价';
  if (val === 0) return '免场地费';
  return DISCOUNT_NAMES[val] || `${val}%`;
}

export const EXPENSE_CATEGORIES = [
  // 人力成本
  '工资薪资', '社保公积金', '劳务费',
  // 固定成本
  '房租', '水电费', '物业费', '布草洗涤', '桶装水/软饮水',
  // 经营成本
  '食材采购', '鲜花装饰', '营业费用',
  // 销售&管理
  '销售费用', '管理费用', '办公费用', '日常报销', '佣金',
  // 税务
  '税费',
  // 其他
  '维修', '其他',
] as const;
