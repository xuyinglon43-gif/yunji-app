import { supabase } from './supabase';

export async function writeAuditLog(
  table_name: string,
  record_id: number,
  action: string,
  detail: string,
  operator: string
) {
  await supabase.from('audit_logs').insert({
    table_name,
    record_id,
    action,
    detail,
    operator,
  });
}

/**
 * Soft-delete: set deleted_at + deleted_by, log it.
 * Returns true on success.
 */
export async function softDelete(
  table: string,
  id: number,
  operator: string,
  detail: string
) {
  const now = new Date().toISOString();
  await supabase.from(table).update({ deleted_at: now, deleted_by: operator }).eq('id', id);
  await writeAuditLog(table, id, '软删除', detail, operator);
}

/**
 * Hard-delete: actually remove the row, log it.
 */
export async function hardDelete(
  table: string,
  id: number,
  operator: string,
  detail: string
) {
  await supabase.from(table).delete().eq('id', id);
  await writeAuditLog(table, id, '硬删除', detail, operator);
}

/**
 * Restore soft-deleted record.
 */
export async function restoreRecord(
  table: string,
  id: number,
  operator: string,
  detail: string
) {
  await supabase.from(table).update({ deleted_at: null, deleted_by: null }).eq('id', id);
  await writeAuditLog(table, id, '恢复', detail, operator);
}
