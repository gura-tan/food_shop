import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { writeLog } from '../../lib/logger';
import { useOrders } from '../../hooks/useOrders';
import type { Order } from '../../types';

interface Props {
  deviceName: string;
}

export function KitchenTab({ deviceName }: Props) {
  const { orders } = useOrders();
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  // Active orders: billing (dim) + cooking (normal)
  const activeOrders = orders.filter(o => o.status === 'billing' || o.status === 'cooking');

  const fetchHistory = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('status', 'delivering')
      .order('updated_at', { ascending: false })
      .limit(3);
    setHistoryOrders((data as Order[]) ?? []);
  }, []);

  useEffect(() => {
    fetchHistory();
    const channel = supabase
      .channel('kitchen_history')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => {
        fetchHistory();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchHistory]);

  // 商品完成ボタン: cooking → delivering
  async function handleDone(orderId: number) {
    setBusy(orderId);
    await supabase.from('orders').update({ status: 'delivering' }).eq('id', orderId);
    await writeLog(deviceName, 'order_cooking_done', { order_id: orderId });
    setBusy(null);
  }

  // 取り消しボタン: delivering → cooking
  async function handleUndoDone(orderId: number) {
    setBusy(orderId);
    await supabase.from('orders').update({ status: 'cooking' }).eq('id', orderId);
    await writeLog(deviceName, 'order_cooking_reverted', { order_id: orderId });
    setBusy(null);
  }

  return (
    <div className="tab-content kitchen-tab">
      <h2 className="tab-section-title">調理中の注文</h2>

      {activeOrders.length === 0 ? (
        <p className="empty-message">調理待ちの注文はありません</p>
      ) : (
        <ul className="kitchen-order-list">
          {activeOrders.map(order => {
            const isDim = order.status === 'billing';
            return (
              <li
                key={order.id}
                className={`kitchen-order-card ${isDim ? 'kitchen-order-card--dim' : ''}`}
              >
                <div className="order-card-header">
                  <div className="order-ticket-badge">
                    <span className="order-ticket-label">札</span>
                    <span className="order-ticket-num">{order.ticket_number}</span>
                  </div>
                  <span className="order-id-label">注文#{order.id}</span>
                  {isDim && <span className="order-status-badge order-status-badge--billing">会計中</span>}
                </div>
                <ul className="order-items-list">
                  {order.items?.map(item => (
                    <li key={item.id} className="order-item-row">
                      <span className="order-item-name">{item.menu_name}</span>
                      <span className="order-item-qty">×{item.quantity}</span>
                    </li>
                  ))}
                </ul>
                {!isDim && (
                  <button
                    id={`kitchen-done-${order.id}`}
                    className="btn btn--success btn--full"
                    onClick={() => handleDone(order.id)}
                    disabled={busy === order.id}
                  >
                    ✓ 商品完成
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* History: recent delivering orders (undo available) */}
      {historyOrders.length > 0 && (
        <>
          <h2 className="tab-section-title tab-section-title--sub">直近の完成済み（取り消し可）</h2>
          <ul className="kitchen-order-list kitchen-history-list">
            {historyOrders.map(order => (
              <li key={order.id} className="kitchen-order-card kitchen-order-card--history">
                <div className="order-card-header">
                  <div className="order-ticket-badge order-ticket-badge--history">
                    <span className="order-ticket-label">札</span>
                    <span className="order-ticket-num">{order.ticket_number}</span>
                  </div>
                  <span className="order-id-label">注文#{order.id}</span>
                </div>
                <ul className="order-items-list">
                  {order.items?.map(item => (
                    <li key={item.id} className="order-item-row order-item-row--muted">
                      <span className="order-item-name">{item.menu_name}</span>
                      <span className="order-item-qty">×{item.quantity}</span>
                    </li>
                  ))}
                </ul>
                <button
                  id={`kitchen-undo-${order.id}`}
                  className="btn btn--warning btn--full"
                  onClick={() => handleUndoDone(order.id)}
                  disabled={busy === order.id}
                >
                  ↩ 調理中に戻す
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
