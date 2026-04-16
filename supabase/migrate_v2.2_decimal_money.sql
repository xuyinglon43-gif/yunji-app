-- 迁移脚本 v2.2：金额字段从 integer 升级为 numeric(12,2)
-- 原因：实际银行流水带两位小数，整数类型会截断
-- 在 Supabase SQL Editor 中执行

-- orders: 定金、预估
ALTER TABLE orders
  ALTER COLUMN deposit TYPE numeric(12,2) USING deposit::numeric(12,2),
  ALTER COLUMN estimated TYPE numeric(12,2) USING estimated::numeric(12,2);

-- bills: 消费/食材成本/实收/商务佣金
ALTER TABLE bills
  ALTER COLUMN total TYPE numeric(12,2) USING total::numeric(12,2),
  ALTER COLUMN food_cost TYPE numeric(12,2) USING food_cost::numeric(12,2),
  ALTER COLUMN paid TYPE numeric(12,2) USING paid::numeric(12,2),
  ALTER COLUMN biz_commission TYPE numeric(12,2) USING biz_commission::numeric(12,2);

-- members: 储值余额/旧债/累计消费
ALTER TABLE members
  ALTER COLUMN balance TYPE numeric(12,2) USING balance::numeric(12,2),
  ALTER COLUMN old_debt TYPE numeric(12,2) USING old_debt::numeric(12,2),
  ALTER COLUMN total_spent TYPE numeric(12,2) USING total_spent::numeric(12,2);

-- expenses: 支出金额
ALTER TABLE expenses
  ALTER COLUMN amount TYPE numeric(12,2) USING amount::numeric(12,2);

-- biz_settlements: 商务结算金额（若表存在）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'biz_settlements') THEN
    EXECUTE 'ALTER TABLE biz_settlements ALTER COLUMN amount TYPE numeric(12,2) USING amount::numeric(12,2)';
  END IF;
END $$;
