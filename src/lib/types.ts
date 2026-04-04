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
  discount: number;
  balance: number;
  fee_expiry: string | null;
  old_debt: number;
  total_spent: number;
  visits: number;
  biz_name: string;
  note: string;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export interface Expense {
  id: number;
  date: string;
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

export const EXPENSE_CATEGORIES = [
  '食材采购', '水电费', '物业费', '维修', '办公用品', '交通', '活动费用', '其他'
] as const;
