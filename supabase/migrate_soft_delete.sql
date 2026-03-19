-- ============================================
-- 云吉合院：软删除 + 审计日志 迁移脚本
-- 在 Supabase SQL Editor 中执行
-- ============================================

-- 1. 给所有表加 deleted_at 和 deleted_by 字段
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deleted_by text DEFAULT NULL;

ALTER TABLE bills ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS deleted_by text DEFAULT NULL;

ALTER TABLE members ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE members ADD COLUMN IF NOT EXISTS deleted_by text DEFAULT NULL;

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS deleted_by text DEFAULT NULL;

-- 2. 创建审计日志表
CREATE TABLE IF NOT EXISTS audit_logs (
  id serial PRIMARY KEY,
  table_name text NOT NULL,
  record_id int NOT NULL,
  action text NOT NULL,
  detail text,
  operator text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 3. 审计日志索引
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON audit_logs(table_name, record_id);

-- 4. 审计日志 RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON audit_logs FOR ALL USING (true) WITH CHECK (true);

-- 5. 给已有表加 deleted_at 索引（加速过滤查询）
CREATE INDEX IF NOT EXISTS idx_orders_deleted ON orders(deleted_at);
CREATE INDEX IF NOT EXISTS idx_bills_deleted ON bills(deleted_at);
CREATE INDEX IF NOT EXISTS idx_members_deleted ON members(deleted_at);
CREATE INDEX IF NOT EXISTS idx_expenses_deleted ON expenses(deleted_at);
