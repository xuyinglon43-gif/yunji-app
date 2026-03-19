-- 云吉合院运营管理系统 数据库初始化
-- 在 Supabase SQL Editor 中执行此脚本

-- 1. Orders (订单)
CREATE TABLE IF NOT EXISTS orders (
  id serial PRIMARY KEY,
  date date NOT NULL,
  slot text NOT NULL,
  type text NOT NULL,
  venues text[] DEFAULT '{}',
  client text NOT NULL,
  phone text,
  member_level text DEFAULT '散客',
  is_returning text,
  pax int NOT NULL DEFAULT 1,
  action text,
  deposit int DEFAULT 0,
  note text,
  status text NOT NULL DEFAULT '待确认',
  estimated int DEFAULT 0,
  member_id int,
  biz_name text,
  cancel_note text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Bills (结账记录)
CREATE TABLE IF NOT EXISTS bills (
  id serial PRIMARY KEY,
  order_id int REFERENCES orders(id),
  date date NOT NULL,
  total int DEFAULT 0,
  discount int DEFAULT 100,
  food_cost int DEFAULT 0,
  paid int DEFAULT 0,
  method text,
  confirmed boolean DEFAULT false,
  confirmed_at timestamptz,
  member_id int,
  biz_name text,
  biz_commission int DEFAULT 0,
  butler text,
  server text,
  chef text,
  stars int,
  created_at timestamptz DEFAULT now()
);

-- 3. Members (会员)
CREATE TABLE IF NOT EXISTS members (
  id serial PRIMARY KEY,
  name text NOT NULL,
  phone text,
  level text DEFAULT '散客',
  discount int DEFAULT 100,
  balance int DEFAULT 0,
  fee_expiry date,
  old_debt int DEFAULT 0,
  total_spent int DEFAULT 0,
  visits int DEFAULT 0,
  biz_name text,
  note text,
  created_at timestamptz DEFAULT now()
);

-- 4. Expenses (支出)
CREATE TABLE IF NOT EXISTS expenses (
  id serial PRIMARY KEY,
  date date NOT NULL,
  category text NOT NULL,
  amount int NOT NULL DEFAULT 0,
  supplier text,
  note text,
  items jsonb DEFAULT '[]',
  submitted_by text,
  status text DEFAULT '待审批',
  approved_by text,
  created_at timestamptz DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_date_status ON orders(date, status);
CREATE INDEX IF NOT EXISTS idx_bills_order_id ON bills(order_id);
CREATE INDEX IF NOT EXISTS idx_members_name ON members(name);

-- RLS 策略 - 对于这个简单项目先允许所有操作（通过 anon key）
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for anon" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON bills FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON expenses FOR ALL USING (true) WITH CHECK (true);

-- 更新时间自动触发器
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
