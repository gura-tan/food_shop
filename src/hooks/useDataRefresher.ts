import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { writeLog } from '../lib/logger';

// 放置された注文とみなす経過時間（10分）
const STALE_BILLING_TIMEOUT_MS = 10 * 60 * 1000;
// 定期リフレッシュ間隔（2分）
const REFRESH_INTERVAL_MS = 2 * 60 * 1000;

export function useDataRefresher(deviceName: string | null) {
  const isRunningRef = useRef(false);

  const runRefresher = useCallback(async () => {
    if (!deviceName || isRunningRef.current) return;
    isRunningRef.current = true;

    try {
      // 1. 放置された古い ordering / billing 注文の自動削除
      const thresholdTime = new Date(Date.now() - STALE_BILLING_TIMEOUT_MS).toISOString();
      const { data: staleOrders } = await supabase
        .from('orders')
        .select('id, ticket_number, status, created_at')
        .in('status', ['ordering', 'billing'])
        .lt('created_at', thresholdTime);

      if (staleOrders && staleOrders.length > 0) {
        const staleIds = staleOrders.map(o => o.id);
        const { error: deleteError } = await supabase
          .from('orders')
          .delete()
          .in('id', staleIds);

        if (!deleteError) {
          await writeLog(deviceName, 'refresher_cleaned', {
            type: 'stale_billing_orders',
            count: staleIds.length,
            orders: staleOrders.map(o => ({
              id: o.id,
              ticket: o.ticket_number,
              status: o.status,
              created_at: o.created_at,
            })),
          });
        }
      }

      // 2. チケットテーブルと進行中注文の整合性チェック・修復
      // 進行中の注文 (cooking, delivering) を取得
      const { data: activeOrders } = await supabase
        .from('orders')
        .select('id, ticket_number, status')
        .in('status', ['cooking', 'delivering']);

      const activeOrderMap = new Map<number, { id: number; status: string }>();
      (activeOrders ?? []).forEach(o => {
        activeOrderMap.set(o.ticket_number, { id: o.id, status: o.status });
      });

      // 全チケットを取得
      const { data: tickets } = await supabase
        .from('tickets')
        .select('number, status, order_id');

      if (tickets) {
        for (const ticket of tickets) {
          const activeOrder = activeOrderMap.get(ticket.number);

          if (activeOrder) {
            // 進行中注文があるのに in_use でない、または order_id が異なる場合は修復
            if (ticket.status !== 'in_use' || ticket.order_id !== activeOrder.id) {
              await supabase
                .from('tickets')
                .update({ status: 'in_use', order_id: activeOrder.id })
                .eq('number', ticket.number);

              await writeLog(deviceName, 'refresher_cleaned', {
                type: 'ticket_synced_to_in_use',
                ticket_number: ticket.number,
                order_id: activeOrder.id,
              });
            }
          } else {
            // 進行中注文がないのに in_use または order_id が残っている場合は修復
            if (ticket.status === 'in_use' || ticket.order_id !== null) {
              await supabase
                .from('tickets')
                .update({ status: 'unused', order_id: null })
                .eq('number', ticket.number);

              await writeLog(deviceName, 'refresher_cleaned', {
                type: 'ticket_synced_to_unused',
                ticket_number: ticket.number,
                previous_order_id: ticket.order_id,
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn('[useDataRefresher] Error during refresh:', err);
    } finally {
      isRunningRef.current = false;
    }
  }, [deviceName]);

  useEffect(() => {
    if (!deviceName) return;

    // 初回実行
    runRefresher();

    // 定期実行
    const timer = setInterval(() => {
      runRefresher();
    }, REFRESH_INTERVAL_MS);

    // 画面アクティブ時（タブ復帰・再表示時）
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runRefresher();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [deviceName, runRefresher]);

  return { runRefresher };
}
