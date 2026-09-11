import { useState, useRef, useEffect } from 'react';
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

  // 端末ごとの整理券番号拘束（ホールド）管理
  const [heldTicket, setHeldTicket] = useState<number | null>(null);
  const [hasPrecedingHold, setHasPrecedingHold] = useState(false);
  const [precedingTicket, setPrecedingTicket] = useState<number | null>(null);

  // 整理券番号の手動変更用（デンジャーゾーン・2段階セーフティ＆連続タップ対応）
  type AdjustMode = 'idle' | 'confirming' | 'continuous';
  const [adjustMode, setAdjustMode] = useState<AdjustMode>('idle');
  const [pendingTarget, setPendingTarget] = useState<number | null>(null);
  const [adjustBusy, setAdjustBusy] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentTicket = heldTicket ?? settings.next_ticket_number;

  // 生存確認＆他端末の拘束状況チェック（ハートビート）
  const refreshHeartbeat = useRef<() => Promise<void>>(async () => {});
  refreshHeartbeat.current = async () => {
    try {
      const { data, error } = await supabase.rpc('heartbeat_cashier_ticket', {
        p_device_name: deviceName,
      });
      if (!error && data && data.length > 0) {
        const row = data[0] as {
          ticket_number: number;
          has_preceding: boolean;
          preceding_ticket: number | null;
        };
        setHeldTicket(row.ticket_number);
        setHasPrecedingHold(row.has_preceding);
        setPrecedingTicket(row.preceding_ticket);
      }
    } catch (err) {
      console.warn('[CashierTab] heartbeat error:', err);
    }
  };

  // レジタブのマウント時拘束・アンマウント時解放・Realtime購読
  useEffect(() => {
    let mounted = true;

    async function initHold() {
      try {
        const { data, error } = await supabase.rpc('claim_cashier_ticket', {
          p_device_name: deviceName,
        });
        if (!error && data !== null && mounted) {
          setHeldTicket(data as number);
        }
        if (mounted) {
          await refreshHeartbeat.current();
        }
      } catch (err) {
        console.warn('[CashierTab] init hold error:', err);
      }
    }

    initHold();

    // 5秒ごとの定期ハートビート
    const heartbeatTimer = setInterval(() => {
      refreshHeartbeat.current();
    }, 5000);

    // cashier_holds テーブルのリアルタイム変更を検知（他端末の離脱による自動繰り上がり等）
    const channel = supabase
      .channel(`cashier_holds_${deviceName}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cashier_holds' },
        () => {
          refreshHeartbeat.current();
        }
      )
      .subscribe();

    // ページ離脱（リロード、閉じる）時の解放
    const handleBeforeUnload = () => {
      supabase.rpc('release_cashier_ticket', { p_device_name: deviceName });
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      mounted = false;
      clearInterval(heartbeatTimer);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      supabase.removeChannel(channel);
      // レジタブを離脱（アンマウント）する際に拘束を手放す
      supabase.rpc('release_cashier_ticket', { p_device_name: deviceName });
    };
  }, [deviceName]);

  function clearAdjustTimer() {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }

  function startAdjustTimer(ms = 3500) {
    clearAdjustTimer();
    resetTimerRef.current = setTimeout(() => {
      setAdjustMode('idle');
      setPendingTarget(null);
    }, ms);
  }

  useEffect(() => {
    return () => clearAdjustTimer();
  }, []);

  function calcNextTicket(current: number, max: number, delta: number): number {
    if (delta > 0) {
      return current >= max ? 1 : current + 1;
    } else {
      return current <= 1 ? max : current - 1;
    }
  }

  async function applyTicketChange(targetNum: number) {
    setAdjustBusy(true);
    const oldNum = currentTicket;
    await supabase.from('settings').update({ value: String(targetNum) }).eq('key', 'next_ticket_number');
    // 全端末の拘束番号を再計算・スライド
    await supabase.rpc('resequence_cashier_holds');
    await writeLog(deviceName, 'settings_updated', {
      key: 'next_ticket_number',
      from: oldNum,
      to: targetNum,
      reason: 'cashier_manual_adjustment',
    });
    await refetchSettings();
    await refreshHeartbeat.current();
    setAdjustBusy(false);
  }

  async function handleStepClick(delta: number) {
    if (showBilling || adjustBusy || busy) return;

    if (adjustMode === 'continuous') {
      // 連続タップモード: 2段階確認を省略して即座に変更
      const newNum = calcNextTicket(currentTicket, settings.ticket_max, delta);
      await applyTicketChange(newNum);
      startAdjustTimer(3500);
      return;
    }

    if (adjustMode === 'confirming') {
      // 確認待ち時にもう一方のボタンを押した場合は変更予定先を更新
      const newTarget = calcNextTicket(currentTicket, settings.ticket_max, delta);
      setPendingTarget(newTarget);
      startAdjustTimer(4000);
      return;
    }

    // 通常時（idle）: 初回タップは確認待ちモードへ
    const target = calcNextTicket(currentTicket, settings.ticket_max, delta);
    setPendingTarget(target);
    setAdjustMode('confirming');
    startAdjustTimer(4000);
  }

  async function handleConfirmAdjust() {
    if (pendingTarget === null || adjustBusy) return;
    const target = pendingTarget;
    await applyTicketChange(target);
    setPendingTarget(null);
    setAdjustMode('continuous'); // 確定後は連続タップモードへ
    startAdjustTimer(3500);
  }

  function handleCancelAdjust() {
    clearAdjustTimer();
    setAdjustMode('idle');
    setPendingTarget(null);
  }

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
    handleCancelAdjust();
    setBusy(true);
    const ticketNumber = currentTicket;

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

    // 会計ポップアップ表示時に最新の他端末状況をチェック
    await refreshHeartbeat.current();
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

  // 完了ボタン: move to cooking, complete ticket hold, and claim next
  async function handleConfirm() {
    if (!currentOrderId) return;
    setBusy(true);

    const ticketNumber = currentTicket;

    // Move order to cooking
    await supabase.from('orders').update({ status: 'cooking' }).eq('id', currentOrderId);

    // Mark ticket as in_use
    await supabase.from('tickets').update({ status: 'in_use', order_id: currentOrderId }).eq('number', ticketNumber);

    // Complete ticket and claim new ticket for this device
    const { data: newTicket } = await supabase.rpc('complete_cashier_ticket', {
      p_device_name: deviceName,
      p_completed_ticket: ticketNumber,
    });

    if (newTicket !== null && typeof newTicket === 'number') {
      setHeldTicket(newTicket);
    }

    await writeLog(deviceName, 'order_billing_confirmed', {
      order_id: currentOrderId,
      ticket_number: ticketNumber,
    });

    // Reset local state
    setCart([]);
    setCurrentOrderId(null);
    setShowBilling(false);
    handleCancelAdjust();
    await refetchSettings();
    await refreshHeartbeat.current();
    setBusy(false);
  }

  return (
    <div className="tab-content cashier-tab">
      {/* Header info - Unified to Ticket/整理券 */}
      <div className="cashier-header">
        <div className="cashier-info-badge cashier-info-badge--ticket">
          <span className="cashier-info-label">整理券番号</span>
          <span className="cashier-info-value">#{currentTicket}</span>
        </div>

        {/* 整理券番号手動調整ゾーン（デンジャーゾーン） */}
        <div className="ticket-adjust-zone" aria-label="整理券番号手動調整">
          {adjustMode === 'confirming' && pendingTarget !== null ? (
            <div className="ticket-adjust-confirm">
              <span className="ticket-adjust-confirm-label">#{pendingTarget} に変更?</span>
              <button
                type="button"
                id="ticket-adjust-confirm-btn"
                className="ticket-adjust-btn ticket-adjust-btn--confirm"
                onClick={handleConfirmAdjust}
                disabled={adjustBusy || showBilling}
              >
                確定
              </button>
              <button
                type="button"
                id="ticket-adjust-cancel-btn"
                className="ticket-adjust-btn ticket-adjust-btn--cancel"
                onClick={handleCancelAdjust}
                disabled={adjustBusy}
                title="キャンセル"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className={`ticket-adjust-stepper ${adjustMode === 'continuous' ? 'ticket-adjust-stepper--active' : ''}`}>
              <button
                type="button"
                id="ticket-adjust-minus"
                className="ticket-adjust-btn ticket-adjust-btn--step"
                onClick={() => handleStepClick(-1)}
                disabled={showBilling || adjustBusy || busy}
                title="整理券番号を1つ戻す"
              >
                −
              </button>
              <button
                type="button"
                id="ticket-adjust-plus"
                className="ticket-adjust-btn ticket-adjust-btn--step"
                onClick={() => handleStepClick(1)}
                disabled={showBilling || adjustBusy || busy}
                title="整理券番号を1つ進める"
              >
                ＋
              </button>
              {adjustMode === 'continuous' && (
                <button
                  type="button"
                  id="ticket-adjust-done-btn"
                  className="ticket-adjust-btn ticket-adjust-btn--done"
                  onClick={handleCancelAdjust}
                  title="調整完了"
                >
                  完了
                </button>
              )}
            </div>
          )}
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
              <span className="billing-ticket-number">#{currentTicket}</span>
            </div>

            {hasPrecedingHold && (
              <div className="billing-warning-alert" role="alert">
                <div className="billing-warning-header">
                  <span className="billing-warning-icon">⚠️</span>
                  <span className="billing-warning-title">渡す整理券の番号を確認してください!</span>
                </div>
                <p className="billing-warning-sub">
                  別のレジで若い番号{precedingTicket ? `（#${precedingTicket}）` : ''}が接客中のため、連番が前後しています。
                </p>
              </div>
            )}

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
