/**
 * 高危操作必须走的服务端 RPC（在 supabase/migrate_v3_role_rpc.sql 中定义）。
 * 每个函数内部会校验密码白名单，非老板调用会被服务端拒绝。
 *
 * 前端规则：组件层用 PermissionGate 隐藏按钮；
 *           写操作必须用这里的函数，不能直连 supabase.from().delete()/update()。
 */
import { supabase } from './supabase';

type RpcResult = { ok: true } | { ok: false; error: string };

async function call(fn: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** 硬删除：仅老板密码可执行 */
export async function rpcHardDelete(
  table: string,
  id: number,
  password: string,
  operator: string,
  detail: string
): Promise<RpcResult> {
  return call('rpc_hard_delete', {
    p_table: table,
    p_id: id,
    p_password: password,
    p_operator: operator,
    p_detail: detail,
  });
}

/** 修改已确认账单金额：仅老板密码可执行 */
export async function rpcEditConfirmedBill(
  billId: number,
  total: number,
  paid: number,
  foodCost: number,
  password: string,
  operator: string,
  detail: string
): Promise<RpcResult> {
  return call('rpc_edit_confirmed_bill', {
    p_bill_id: billId,
    p_total: total,
    p_paid: paid,
    p_food_cost: foodCost,
    p_password: password,
    p_operator: operator,
    p_detail: detail,
  });
}

/** 撤销已确认状态：仅老板密码可执行 */
export async function rpcUndoConfirmedStatus(
  table: 'orders' | 'bills' | 'expenses',
  id: number,
  newStatus: string,
  password: string,
  operator: string,
  detail: string
): Promise<RpcResult> {
  return call('rpc_undo_confirmed_status', {
    p_table: table,
    p_id: id,
    p_new_status: newStatus,
    p_password: password,
    p_operator: operator,
    p_detail: detail,
  });
}

/** 股东事项新增/修改：仅老板密码可执行 */
export async function rpcUpsertShareholderTx(
  id: number | null,
  date: string,
  shareholder: string,
  type: string,
  amount: number,
  attribution: string,
  note: string,
  password: string,
  operator: string
): Promise<RpcResult> {
  return call('rpc_upsert_shareholder_tx', {
    p_id: id,
    p_date: date,
    p_shareholder: shareholder,
    p_type: type,
    p_amount: amount,
    p_attribution: attribution,
    p_note: note,
    p_password: password,
    p_operator: operator,
  });
}
