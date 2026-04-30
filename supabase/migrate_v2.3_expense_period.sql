-- 支出归属月份字段
-- 用于区分"支付日期"和"成本归属月"，解决工资跨月问题
-- period 格式：YYYY-MM，P&L 按此字段汇总，不按支付日期

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS period VARCHAR(7);

-- 存量数据回填：归属月默认等于支付日期的月份
UPDATE expenses SET period = LEFT(date::text, 7) WHERE period IS NULL;
