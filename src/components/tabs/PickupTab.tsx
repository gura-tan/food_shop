import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { writeLog } from '../../lib/logger';
import { useOrders } from '../../hooks/useOrders';
import type { Order } from '../../types';

interface Props {
  deviceName: string;
}

export function PickupTab({ deviceName }: Props) {
  const { orders } = useOrders();
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  // Active orders: billing (dim) + cooking / delivering (normal)
  const visibleOrders = orders.filter(
    o => o.status === 'billing' || o.status === 'cooking' || o.status === 'delivering'
  );

  const fetchHistory = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('status', 'completed')
      .order('updated_at', { ascending: false })
      .limit(3);
    setHistoryOrders((data as Order[]) ?? []);
  }, []);

  useEffect(() => {
    fetchHistory();
    const channel = supabase
      .channel('pickup_history')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => {
        fetchHistory();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchHistory]);

  // 受取完了: completed にして整理券を解放
  async function handleComplete(orderId: number, ticketNumber: number) {
    setBusy(orderId);
    await supabase.from('orders').update({ status: 'completed' }).eq('id', orderId);
    await supabase
      .from('tickets')
      .update({ status: 'unused', order_id: null })
      .eq('number', ticketNumber);
    await writeLog(deviceName, 'order_completed', { order_id: orderId, ticket_number: ticketNumber });
    await fetchHistory();
    setBusy(null);
  }

  // 受取待ちに戻す: cooking に戻して整理券を再使用
  async function handleUndoComplete(orderId: number, ticketNumber: number) {
    setBusy(orderId);
    await supabase.from('orders').update({ status: 'cooking' }).eq('id', orderId);
    await supabase
      .from('tickets')
      .update({ status: 'in_use', order_id: orderId })
      .eq('number', ticketNumber);
    await writeLog(deviceName, 'order_pickup_reverted', { order_id: orderId, ticket_number: ticketNumber });
    await fetchHistory();
    setBusy(null);
  }

  return (
    <div className="tab-content pickup-tab">
      <h2 className="tab-section-title">受取待ち</h2>

      {visibleOrders.length === 0 ? (
        <p className="empty-message">受取待ちの注文はありません</p>
      ) : (
        <ul className="pickup-order-list">
          {visibleOrders.map(order => {
            const isBilling = order.status === 'billing';
            return (
              <li
                key={order.id}
                className={`pickup-order-card ${isBilling ? 'pickup-order-card--dim' : 'pickup-order-card--active'}`}
              >
                <div className="order-card-header">
                  <div className="order-ticket-badge">
                    <span className="order-ticket-label">整理券</span>
                    <span className="order-ticket-num">#{order.ticket_number}</span>
                  </div>
                  {isBilling && (
                    <span className="order-status-badge order-status-badge--billing">会計中</span>
                  )}
                </div>

                <ul className="order-items-list">
                  {order.items?.map(item => (
                    <li
                      key={item.id}
                      className={`order-item-row ${isBilling ? 'order-item-row--muted' : ''}`}
                    >
                      <span className="order-item-name">{item.menu_name}</span>
                      <span className="order-item-qty">{item.quantity}個</span>
                    </li>
                  ))}
                </ul>

                {!isBilling && (
                  <button
                    id={`pickup-done-${order.id}`}
                    className="btn btn--primary btn--full"
                    onClick={() => handleComplete(order.id, order.ticket_number)}
                    disabled={busy === order.id}
                  >
                    📦 受取完了
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* History: recent completed orders (undo available) */}
      {historyOrders.length > 0 && (
        <>
          <h2 className="tab-section-title tab-section-title--sub">直近の完成済み（取り消し可）</h2>
          <ul className="pickup-order-list pickup-history-list">
            {historyOrders.map(order => (
              <li key={order.id} className="pickup-order-card pickup-order-card--history">
                <div className="order-card-header">
                  <div className="order-ticket-badge order-ticket-badge--history">
                    <span className="order-ticket-label">整理券</span>
                    <span className="order-ticket-num">#{order.ticket_number}</span>
                  </div>
                  <span className="order-status-badge order-status-badge--completed">お渡し済み</span>
                </div>
                <ul className="order-items-list">
                  {order.items?.map(item => (
                    <li key={item.id} className="order-item-row order-item-row--muted">
                      <span className="order-item-name">{item.menu_name}</span>
                      <span className="order-item-qty">{item.quantity}個</span>
                    </li>
                  ))}
                </ul>
                <button
                  id={`pickup-undo-${order.id}`}
                  className="btn btn--warning btn--full"
                  onClick={() => handleUndoComplete(order.id, order.ticket_number)}
                  disabled={busy === order.id}
                >
                  ↩ 受取待ちに戻す
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

