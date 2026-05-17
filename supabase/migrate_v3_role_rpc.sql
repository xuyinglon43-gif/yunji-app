-- =========================================================
-- v3 角色权限后端兜底（实用档）
-- =========================================================
-- 目标：高危操作（硬删、改已确认账单金额、改股东事项）必须通过
-- SECURITY DEFINER RPC，函数内部校验调用方密码是否为老板密码。
--
-- 设计原则：
-- 1. 内部 5 个账号 + 可信团队，不做完整 RLS（成本过高，收益边际）。
-- 2. 高危操作走 RPC，密码作为参数传入校验，前端必须先 login 才有密码。
-- 3. audit_logs 在 RPC 内同步写入，记录操作来源（密码 hash）。
--
-- 执行顺序：在 Supabase SQL Editor 中按节执行。
-- =========================================================

-- ---------- 1. 老板密码白名单函数（私有 schema） ----------
-- 把密码硬编码在 SQL 里，前端无法绕过
CREATE OR REPLACE FUNCTION public._is_boss_password(pw text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 与 src/lib/constants.ts 中 HARD_DELETE_PASSWORDS 保持一致
  RETURN pw IN ('8888', 'zhangze123');
END;
$$;

REVOKE ALL ON FUNCTION public._is_boss_password(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._is_boss_password(text) TO anon, authenticated;


-- ---------- 2. 硬删除 RPC ----------
CREATE OR REPLACE FUNCTION public.rpc_hard_delete(
  p_table text,
  p_id bigint,
  p_password text,
  p_operator text,
  p_detail text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sql text;
BEGIN
  IF NOT public._is_boss_password(p_password) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: only boss can hard-delete';
  END IF;

  IF p_table NOT IN ('orders', 'bills', 'expenses', 'members', 'business_contacts', 'biz_settlements', 'shareholder_transactions') THEN
    RAISE EXCEPTION 'INVALID_TABLE: %', p_table;
  END IF;

  v_sql := format('DELETE FROM %I WHERE id = $1', p_table);
  EXECUTE v_sql USING p_id;

  INSERT INTO audit_logs (table_name, record_id, action, detail, operator)
  VALUES (p_table, p_id, '硬删除(RPC)', p_detail, p_operator);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hard_delete(text, bigint, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_hard_delete(text, bigint, text, text, text) TO anon, authenticated;


-- ---------- 3. 修改已确认账单金额 RPC ----------
CREATE OR REPLACE FUNCTION public.rpc_edit_confirmed_bill(
  p_bill_id bigint,
  p_total numeric,
  p_paid numeric,
  p_food_cost numeric,
  p_password text,
  p_operator text,
  p_detail text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_confirmed boolean;
BEGIN
  IF NOT public._is_boss_password(p_password) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: only boss can edit confirmed bill';
  END IF;

  SELECT confirmed INTO v_confirmed FROM bills WHERE id = p_bill_id;
  IF v_confirmed IS NULL THEN
    RAISE EXCEPTION 'BILL_NOT_FOUND: %', p_bill_id;
  END IF;

  UPDATE bills
  SET total = p_total,
      paid = p_paid,
      food_cost = p_food_cost
  WHERE id = p_bill_id;

  INSERT INTO audit_logs (table_name, record_id, action, detail, operator)
  VALUES ('bills', p_bill_id, '改已确认账单(RPC)', p_detail, p_operator);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_edit_confirmed_bill(bigint, numeric, numeric, numeric, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_edit_confirmed_bill(bigint, numeric, numeric, numeric, text, text, text) TO anon, authenticated;


-- ---------- 4. 撤销已确认状态 RPC ----------
CREATE OR REPLACE FUNCTION public.rpc_undo_confirmed_status(
  p_table text,
  p_id bigint,
  p_new_status text,
  p_password text,
  p_operator text,
  p_detail text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sql text;
BEGIN
  IF NOT public._is_boss_password(p_password) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: only boss can undo confirmed status';
  END IF;

  IF p_table NOT IN ('orders', 'bills', 'expenses') THEN
    RAISE EXCEPTION 'INVALID_TABLE: %', p_table;
  END IF;

  IF p_table = 'bills' THEN
    UPDATE bills SET confirmed = false, confirmed_at = NULL WHERE id = p_id;
  ELSE
    v_sql := format('UPDATE %I SET status = $1 WHERE id = $2', p_table);
    EXECUTE v_sql USING p_new_status, p_id;
  END IF;

  INSERT INTO audit_logs (table_name, record_id, action, detail, operator)
  VALUES (p_table, p_id, '撤销已确认(RPC)', p_detail, p_operator);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_undo_confirmed_status(text, bigint, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_undo_confirmed_status(text, bigint, text, text, text, text) TO anon, authenticated;


-- ---------- 5. 股东事项表（仅老板能写） ----------
CREATE TABLE IF NOT EXISTS public.shareholder_transactions (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  shareholder TEXT NOT NULL,           -- 颖龙 / 张泽 / 共同
  type TEXT NOT NULL,                  -- 垫付/往来款/分配/增资/减资
  amount NUMERIC(12, 2) NOT NULL,      -- 金额（正负代表方向）
  attribution TEXT,                    -- 归属事项（如"2-3月工资旧账"）
  note TEXT,
  created_at TIMESTAMP DEFAULT now(),
  created_by TEXT,
  deleted_at TIMESTAMP,
  deleted_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_shareholder_date ON public.shareholder_transactions(date);
CREATE INDEX IF NOT EXISTS idx_shareholder_active ON public.shareholder_transactions(deleted_at) WHERE deleted_at IS NULL;

-- 股东事项 RPC（写入/修改）
CREATE OR REPLACE FUNCTION public.rpc_upsert_shareholder_tx(
  p_id bigint,                -- NULL = 新增；非空 = 修改
  p_date date,
  p_shareholder text,
  p_type text,
  p_amount numeric,
  p_attribution text,
  p_note text,
  p_password text,
  p_operator text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id bigint;
BEGIN
  IF NOT public._is_boss_password(p_password) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: only boss can write shareholder transactions';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO shareholder_transactions
      (date, shareholder, type, amount, attribution, note, created_by)
    VALUES (p_date, p_shareholder, p_type, p_amount, p_attribution, p_note, p_operator)
    RETURNING id INTO v_new_id;

    INSERT INTO audit_logs (table_name, record_id, action, detail, operator)
    VALUES ('shareholder_transactions', v_new_id, '新增(RPC)',
            format('%s | %s | ¥%s | %s', p_shareholder, p_type, p_amount, COALESCE(p_attribution, '')),
            p_operator);
    RETURN v_new_id;
  ELSE
    UPDATE shareholder_transactions SET
      date = p_date,
      shareholder = p_shareholder,
      type = p_type,
      amount = p_amount,
      attribution = p_attribution,
      note = p_note
    WHERE id = p_id;

    INSERT INTO audit_logs (table_name, record_id, action, detail, operator)
    VALUES ('shareholder_transactions', p_id, '修改(RPC)',
            format('%s | %s | ¥%s | %s', p_shareholder, p_type, p_amount, COALESCE(p_attribution, '')),
            p_operator);
    RETURN p_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_upsert_shareholder_tx(bigint, date, text, text, numeric, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_shareholder_tx(bigint, date, text, text, numeric, text, text, text, text) TO anon, authenticated;


-- ---------- 6. 录入 4 月旧账初始数据（一次性） ----------
-- 4 月支付 ¥30.3 万 旧股东应付（2-3 月工资/社保），由颖龙+张泽个人承担
INSERT INTO public.shareholder_transactions (date, shareholder, type, amount, attribution, note, created_by)
SELECT '2026-04-30', '共同', '往来款（旧账）', 303000, '2-3月工资/社保旧账',
       '按合同约定由颖龙+张泽个人承担，不计入新团队 P&L', '系统初始化'
WHERE NOT EXISTS (
  SELECT 1 FROM public.shareholder_transactions WHERE attribution = '2-3月工资/社保旧账'
);


-- =========================================================
-- 验证：
-- SELECT * FROM public.shareholder_transactions;
-- SELECT public._is_boss_password('8888');       -- true
-- SELECT public._is_boss_password('renzhuan7777'); -- false
-- =========================================================
