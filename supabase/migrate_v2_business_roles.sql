-- ============================================
-- 云吉合院 v2：权限分离 + 商务模块 + 数据清空
-- 在 Supabase SQL Editor 中执行
-- ============================================

-- ===== 1. 商务联系人表 =====
CREATE TABLE IF NOT EXISTS business_contacts (
  id serial PRIMARY KEY,
  name text NOT NULL,
  phone text,
  status text NOT NULL DEFAULT 'active',  -- active / paused
  start_date date,
  note text,
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz DEFAULT NULL,
  deleted_by text DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_biz_contacts_name ON business_contacts(name);
CREATE INDEX IF NOT EXISTS idx_biz_contacts_deleted ON business_contacts(deleted_at);

ALTER TABLE business_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON business_contacts FOR ALL USING (true) WITH CHECK (true);

-- ===== 2. 商务提成结算记录表 =====
CREATE TABLE IF NOT EXISTS biz_settlements (
  id serial PRIMARY KEY,
  biz_contact_id int REFERENCES business_contacts(id),
  biz_name text NOT NULL,
  amount int NOT NULL DEFAULT 0,
  settled_at timestamptz NOT NULL DEFAULT now(),
  settled_by text NOT NULL,
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_biz_settlements_name ON biz_settlements(biz_name);
CREATE INDEX IF NOT EXISTS idx_biz_settlements_contact ON biz_settlements(biz_contact_id);

ALTER TABLE biz_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON biz_settlements FOR ALL USING (true) WITH CHECK (true);

-- ===== 3. 清空所有业务数据（保留表结构） =====
-- 注意：按外键依赖顺序删除
TRUNCATE TABLE biz_settlements RESTART IDENTITY CASCADE;
TRUNCATE TABLE audit_logs RESTART IDENTITY CASCADE;
TRUNCATE TABLE bills RESTART IDENTITY CASCADE;
TRUNCATE TABLE expenses RESTART IDENTITY CASCADE;
TRUNCATE TABLE orders RESTART IDENTITY CASCADE;
TRUNCATE TABLE members RESTART IDENTITY CASCADE;
TRUNCATE TABLE business_contacts RESTART IDENTITY CASCADE;
