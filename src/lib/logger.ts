import { supabase } from './supabase';

export type LogAction =
  | 'order_created'
  | 'order_billing_confirmed'
  | 'order_billing_reverted'
  | 'order_cooking_done'
  | 'order_cooking_reverted'
  | 'order_completed'
  | 'order_pickup_reverted'
  | 'menu_added'
  | 'menu_deleted'
  | 'order_replaced'
  | 'refresher_cleaned'
  | 'settings_updated'
  | 'settings_reset_orders'
  | 'settings_reset_tickets';

export async function writeLog(
  deviceName: string,
  action: LogAction,
  detail?: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from('logs').insert({
      device_name: deviceName,
      action,
      detail: detail ?? null,
    });
  } catch (err) {
    // ログ失敗は握りつぶす（メイン操作を妨げない）
    console.warn('[logger] Failed to write log:', err);
  }
}
