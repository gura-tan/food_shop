import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { writeLog } from '../../lib/logger';
import { useOrders } from '../../hooks/useOrders';

interface Props {
  deviceName: string;
}

export function PickupTab({ deviceName }: Props) {
  const { orders } = useOrders();
  const [busy, setBusy] = useState<number | null>(null);

  // Show cooking (dim) and delivering (highlight) orders
  const visibleOrders = orders.filter(o => o.status === 'cooking' || o.status === 'delivering');

  async function handleComplete(orderId: number, ticketNumber: number) {
    setBusy(orderId);
    await supabase.from('orders').update({ status: 'completed' }).eq('id', orderId);
    // Free the ticket
    await supabase
      .from('tickets')
      .update({ status: 'unused', order_id: null })
      .eq('number', ticketNumber);
    await writeLog(deviceName, 'order_completed', { order_id: orderId, ticket_number: ticketNumber });
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
            const isReady = order.status === 'delivering';
            return (
              <li
                key={order.id}
                className={`pickup-order-card ${isReady ? 'pickup-order-card--ready' : 'pickup-order-card--cooking'}`}
              >
                {isReady && (
                  <div className="pickup-ready-banner">
                    ✨ お渡し準備完了
                  </div>
                )}
                <div className="order-card-header">
                  <div className={`order-ticket-badge ${isReady ? 'order-ticket-badge--ready' : ''}`}>
                    <span className="order-ticket-label">札</span>
                    <span className="order-ticket-num">{order.ticket_number}</span>
                  </div>
                  <span className="order-id-label">注文#{order.id}</span>
                </div>
                <ul className="order-items-list">
                  {order.items?.map(item => (
                    <li
                      key={item.id}
                      className={`order-item-row ${!isReady ? 'order-item-row--muted' : ''}`}
                    >
                      <span className="order-item-name">{item.menu_name}</span>
                      <span className="order-item-qty">×{item.quantity}</span>
                    </li>
                  ))}
                </ul>
                {isReady && (
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
    </div>
  );
}
