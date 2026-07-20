-- v2.5: 月度营收目标表（日报页使用，团队可自行填写，未填默认 50 万）
CREATE TABLE IF NOT EXISTS monthly_targets (
  month text PRIMARY KEY,              -- 'YYYY-MM'
  target numeric NOT NULL DEFAULT 500000,
  updated_by text,
  updated_at timestamptz DEFAULT now()
);
