import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { writeLog } from '../../lib/logger';
import { useMenus } from '../../hooks/useMenus';
import { useSettings } from '../../hooks/useSettings';
import type { CartItem } from '../../types';

interface Props {
  deviceName: string;
}

export function CashierTab({ deviceName }: Props) {
  const { menus } = useMenus();
  const { settings, refetch: refetchSettings } = useSettings();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [showBilling, setShowBilling] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const total = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

  function addToCart(menuId: string, menuName: string, unitPrice: number) {
    setCart(prev => {
      const existing = prev.find(i => i.menu_id === menuId);
      if (existing) {
        return prev.map(i => i.menu_id === menuId ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { menu_id: menuId, menu_name: menuName, unit_price: unitPrice, quantity: 1 }];
    });
  }

  function adjustQty(menuId: string, delta: number) {
    setCart(prev =>
      prev
        .map(i => i.menu_id === menuId ? { ...i, quantity: i.quantity + delta } : i)
        .filter(i => i.quantity > 0)
    );
  }

  // Press 会計ボタン: upsert order in 'ordering' status, show billing popup
  async function handleBilling() {
    if (cart.length === 0) return;
    setBusy(true);
    const ticketNumber = settings.next_ticket_number;

    // Create or update order
    if (currentOrderId === null) {
      // Create new order in 'ordering' status
      const { data } = await supabase.from('orders').insert({
        ticket_number: ticketNumber,
        status: 'ordering',
        device_name: deviceName,
      }).select('id').single();

      const orderId = (data as { id: number }).id;
      setCurrentOrderId(orderId);

      // Insert order items
      await supabase.from('order_items').insert(
        cart.map(item => ({
          order_id: orderId,
          menu_id: item.menu_id,
          menu_name: item.menu_name,
          unit_price: item.unit_price,
          quantity: item.quantity,
        }))
      );

      // Update status to billing
      await supabase.from('orders').update({ status: 'billing' }).eq('id', orderId);
      await writeLog(deviceName, 'order_created', {
        order_id: orderId,
        ticket_number: ticketNumber,
        items: cart.map(i => ({ name: i.menu_name, qty: i.quantity })),
        total,
      });
    } else {
      // Already created (re-showing billing popup): update items
      await supabase.from('order_items').delete().eq('order_id', currentOrderId);
      await supabase.from('order_items').insert(
        cart.map(item => ({
          order_id: currentOrderId,
          menu_id: item.menu_id,
          menu_name: item.menu_name,
          unit_price: item.unit_price,
          quantity: item.quantity,
        }))
      );
      await supabase.from('orders').update({ status: 'billing', ticket_number: ticketNumber }).eq('id', currentOrderId);
      await writeLog(deviceName, 'order_created', {
        order_id: currentOrderId,
        ticket_number: ticketNumber,
        items: cart.map(i => ({ name: i.menu_name, qty: i.quantity })),
        total,
      });
    }

    setShowBilling(true);
    setBusy(false);
  }

  // 戻るボタン: revert to ordering status
  async function handleBack() {
    if (currentOrderId) {
      await supabase.from('orders').update({ status: 'ordering' }).eq('id', currentOrderId);
      await writeLog(deviceName, 'order_billing_reverted', { order_id: currentOrderId });
    }
    setShowBilling(false);
  }

  // 完了ボタン: move to cooking, increment ticket/order numbers
  async function handleConfirm() {
    if (!currentOrderId) return;
    setBusy(true);

    const ticketNumber = settings.next_ticket_number;

    // Move order to cooking
    await supabase.from('orders').update({ status: 'cooking' }).eq('id', currentOrderId);

    // Mark ticket as in_use
    await supabase.from('tickets').update({ status: 'in_use', order_id: currentOrderId }).eq('number', ticketNumber);

    // Advance next_ticket_number (wrap around)
    const newTicket = ticketNumber >= settings.ticket_max ? 1 : ticketNumber + 1;
    await supabase.from('settings').update({ value: String(newTicket) }).eq('key', 'next_ticket_number');

    await writeLog(deviceName, 'order_billing_confirmed', {
      order_id: currentOrderId,
      ticket_number: ticketNumber,
    });

    // Reset local state
    setCart([]);
    setCurrentOrderId(null);
    setShowBilling(false);
    await refetchSettings();
    setBusy(false);
  }

  return (
    <div className="tab-content cashier-tab">
      {/* Header info - Unified to Ticket/整理券 */}
      <div className="cashier-header">
        <div className="cashier-info-badge cashier-info-badge--ticket">
          <span className="cashier-info-label">整理券番号</span>
          <span className="cashier-info-value">#{settings.next_ticket_number}</span>
        </div>
      </div>

      <div className="cashier-body">
        {/* Menu grid */}
        <div className="cashier-menu-section">
          <h2 className="cashier-section-title">メニュー</h2>
          {menus.length === 0 ? (
            <p className="empty-message">メニューが登録されていません<br />設定タブから追加してください</p>
          ) : (
            <div className="menu-grid menu-grid--fixed">
              {menus.map(menu => (
                <button
                  key={menu.id}
                  id={`menu-btn-${menu.id}`}
                  className="menu-grid-item"
                  onClick={() => addToCart(menu.id, menu.name, menu.price)}
                >
                  <span className="menu-grid-name">{menu.name}</span>
                  <span className="menu-grid-price">¥{menu.price.toLocaleString()}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Order list */}
        <div className="cashier-order-section">
          <h2 className="cashier-section-title">注文内容</h2>
          <div className="cashier-order-card">
            {cart.length === 0 ? (
              <p className="empty-message empty-message--compact">メニューを選択してください</p>
            ) : (
              <ul className="cart-list">
                {cart.map(item => (
                  <li key={item.menu_id} className="cart-item">
                    <div className="cart-item-info">
                      <span className="cart-item-name">{item.menu_name}</span>
                      <span className="cart-item-price">¥{item.unit_price.toLocaleString()}</span>
                    </div>
                    <div className="cart-item-qty">
                      <button
                        id={`qty-minus-${item.menu_id}`}
                        className="qty-btn qty-btn--minus"
                        onClick={() => adjustQty(item.menu_id, -1)}
                      >−</button>
                      <span className="qty-value">{item.quantity}</span>
                      <button
                        id={`qty-plus-${item.menu_id}`}
                        className="qty-btn qty-btn--plus"
                        onClick={() => adjustQty(item.menu_id, 1)}
                      >＋</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="cashier-total">
              <span className="cashier-total-label">合計</span>
              <span className="cashier-total-value">¥{total.toLocaleString()}</span>
            </div>

            <button
              id="billing-button"
              className="btn btn--billing"
              onClick={handleBilling}
              disabled={cart.length === 0 || busy}
            >
              💳 会計
            </button>
          </div>
        </div>
      </div>

      {/* Billing popup */}
      {showBilling && (
        <div className="billing-overlay">
          <div className="billing-card">
            <h2 className="billing-title">会計確認</h2>
            <div className="billing-ticket">
              <span className="billing-ticket-label">整理券</span>
              <span className="billing-ticket-number">#{settings.next_ticket_number}</span>
            </div>

            <ul className="billing-list">
              {cart.map(item => (
                <li key={item.menu_id} className="billing-list-item">
                  <span className="billing-item-name">{item.menu_name}</span>
                  <span className="billing-item-qty">×{item.quantity}</span>
                  <span className="billing-item-subtotal">
                    ¥{(item.unit_price * item.quantity).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>

            <div className="billing-total">
              <span>合計</span>
              <span className="billing-total-value">¥{total.toLocaleString()}</span>
            </div>

            <div className="billing-actions">
              <button
                id="billing-back-button"
                className="btn btn--ghost btn--wide"
                onClick={handleBack}
                disabled={busy}
              >
                ← もどる
              </button>
              <button
                id="billing-confirm-button"
                className="btn btn--success btn--wide"
                onClick={handleConfirm}
                disabled={busy}
              >
                ✓ 完了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
