import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { writeLog } from '../../lib/logger';
import { useMenus } from '../../hooks/useMenus';
import { useSettings } from '../../hooks/useSettings';
import type { Log } from '../../types';
import { format } from 'date-fns';

interface Props {
  deviceName: string;
}

export function SettingsTab({ deviceName }: Props) {
  const { menus, refetch: refetchMenus } = useMenus();
  const { settings, refetch: refetchSettings } = useSettings();

  const [newMenuName, setNewMenuName] = useState('');
  const [newMenuPrice, setNewMenuPrice] = useState('');
  const [ticketMax, setTicketMax] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<null | 'orders' | 'tickets'>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Password lock state
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Logs
  const [logDate, setLogDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [logs, setLogs] = useState<Log[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    if (settings.ticket_max) {
      setTicketMax(String(settings.ticket_max));
    }
  }, [settings.ticket_max]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (password === 'ate') {
      setIsUnlocked(true);
      setPasswordError('');
      setPassword('');
    } else {
      setPasswordError('パスワードが正しくありません');
    }
  }

  // ---- Ticket max update ----
  async function handleTicketMaxSave() {
    const val = parseInt(ticketMax, 10);
    if (!val || val < 1) { showToast('1以上の整数を入力してください'); return; }
    setBusyAction('ticket_max');
    // Update settings
    await supabase.from('settings').update({ value: String(val) }).eq('key', 'ticket_max');
    // Recreate tickets table rows if max increased
    const currentMax = settings.ticket_max;
    if (val > currentMax) {
      const inserts = [];
      for (let i = currentMax + 1; i <= val; i++) inserts.push({ number: i });
      if (inserts.length > 0) await supabase.from('tickets').insert(inserts);
    } else if (val < currentMax) {
      // Remove tickets beyond new max (only unused ones)
      await supabase.from('tickets').delete().gt('number', val).eq('status', 'unused');
    }
    await writeLog(deviceName, 'settings_updated', { key: 'ticket_max', value: val });
    await refetchSettings();
    setBusyAction(null);
    showToast('整理券枚数を更新しました');
  }

  // ---- Menu ----
  async function handleAddMenu(e: React.FormEvent) {
    e.preventDefault();
    const name = newMenuName.trim();
    const price = parseInt(newMenuPrice, 10);
    if (!name) { showToast('メニュー名を入力してください'); return; }
    if (isNaN(price) || price < 0) { showToast('正しい単価を入力してください'); return; }
    setBusyAction('add_menu');
    const { error } = await supabase.from('menus').insert({ name, price, sort_order: menus.length });
    if (!error) {
      await writeLog(deviceName, 'menu_added', { name, price });
      setNewMenuName('');
      setNewMenuPrice('');
      await refetchMenus();
      showToast(`「${name}」を追加しました`);
    }
    setBusyAction(null);
  }

  async function handleDeleteMenu(id: string, name: string) {
    if (!window.confirm(`「${name}」を削除しますか？`)) return;
    setBusyAction('del_menu_' + id);
    await supabase.from('menus').delete().eq('id', id);
    await writeLog(deviceName, 'menu_deleted', { id, name });
    await refetchMenus();
    setBusyAction(null);
    showToast(`「${name}」を削除しました`);
  }

  // ---- Reset ----
  async function handleResetOrders() {
    setConfirmDialog(null);
    setBusyAction('reset_orders');
    // Delete all order_items and orders, reset tickets, reset settings
    await supabase.from('order_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('orders').delete().gt('id', 0);
    // Reset all tickets to unused
    await supabase.from('tickets').update({ status: 'unused', order_id: null }).gt('number', 0);
    await supabase.from('settings').update({ value: '1' }).eq('key', 'next_ticket_number');
    await writeLog(deviceName, 'settings_reset_orders');
    await refetchSettings();
    setBusyAction(null);
    showToast('整理券・注文履歴をリセットしました');
  }

  async function handleResetTickets() {
    setConfirmDialog(null);
    setBusyAction('reset_tickets');
    await supabase.from('tickets').update({ status: 'unused', order_id: null }).gt('number', 0);
    await supabase.from('settings').update({ value: '1' }).eq('key', 'next_ticket_number');
    await writeLog(deviceName, 'settings_reset_tickets');
    await refetchSettings();
    setBusyAction(null);
    showToast('整理券番号をリセットしました');
  }

  // ---- Logs ----
  async function fetchLogs() {
    setLogsLoading(true);
    const start = `${logDate}T00:00:00+09:00`;
    const end   = `${logDate}T23:59:59+09:00`;
    const { data } = await supabase
      .from('logs')
      .select('*')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false });
    setLogs((data as Log[]) ?? []);
    setLogsLoading(false);
  }

  const ACTION_LABELS: Record<string, string> = {
    order_created:           '注文作成（会計ボタン）',
    order_billing_confirmed: '会計確定（完了ボタン）',
    order_billing_reverted:  '会計取消（戻るボタン）',
    order_cooking_done:      '商品完成',
    order_cooking_reverted:  '商品完成取消',
    order_completed:         '受取完了',
    order_pickup_reverted:   '受取完了取消',
    order_replaced:          '重複注文の自動整理（削除）',
    refresher_cleaned:       'リフレッシャーによる自動整理',
    menu_added:              'メニュー追加',
    menu_deleted:            'メニュー削除',
    settings_updated:        '設定変更',
    settings_reset_orders:   '整理券・注文リセット',
    settings_reset_tickets:  '整理券リセット',
  };

  if (!isUnlocked) {
    return (
      <div className="tab-content settings-lock-container">
        <div className="settings-lock-card">
          <div className="settings-lock-icon">🔒</div>
          <h2 className="settings-lock-title">設定のロック解除</h2>
          <p className="settings-lock-desc">設定画面を開くにはパスワードを入力してください</p>
          <form onSubmit={handleUnlock} className="settings-lock-form">
            <input
              id="settings-password-input"
              type="password"
              className="settings-input settings-lock-input"
              placeholder="パスワード"
              value={password}
              onChange={e => { setPassword(e.target.value); setPasswordError(''); }}
              autoFocus
            />
            {passwordError && <p className="settings-lock-error">{passwordError}</p>}
            <button id="settings-unlock-button" type="submit" className="btn btn--primary btn--full">
              解除
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-content settings-tab">
      {toast && <div className="toast">{toast}</div>}

      {/* Header bar with lock button */}
      <div className="settings-header-bar">
        <h1 className="settings-page-title">⚙️ システム設定</h1>
        <button
          id="settings-lock-button"
          className="btn btn--ghost btn--sm"
          onClick={() => setIsUnlocked(false)}
        >
          🔒 ロックする
        </button>
      </div>

      {/* Confirm dialog */}
      {confirmDialog && (
        <div className="confirm-overlay">
          <div className="confirm-card">
            <h3 className="confirm-title">
              {confirmDialog === 'orders' ? '整理券・注文履歴をリセット' : '整理券番号をリセット'}
            </h3>
            <p className="confirm-message">
              {confirmDialog === 'orders'
                ? 'すべての注文データを削除し、整理券番号を1に戻します。この操作は取り消せません。'
                : '整理券番号を1にリセットします。'}
            </p>
            <div className="confirm-actions">
              <button className="btn btn--ghost" onClick={() => setConfirmDialog(null)}>キャンセル</button>
              <button
                className="btn btn--danger"
                onClick={confirmDialog === 'orders' ? handleResetOrders : handleResetTickets}
              >
                リセットする
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ticket max */}
      <section className="settings-section">
        <h2 className="settings-section-title">🎫 整理券の設定</h2>
        <div className="settings-row">
          <label htmlFor="ticket-max-input" className="settings-label">最大枚数</label>
          <div className="settings-input-group">
            <input
              id="ticket-max-input"
              type="number"
              min="1"
              max="100"
              className="settings-input"
              value={ticketMax}
              onChange={e => setTicketMax(e.target.value)}
            />
            <span className="settings-unit">枚</span>
            <button
              id="ticket-max-save"
              className="btn btn--primary"
              onClick={handleTicketMaxSave}
              disabled={busyAction === 'ticket_max'}
            >
              保存
            </button>
          </div>
          <p className="settings-hint">現在: {settings.ticket_max}枚 ／ 次の整理券番号: #{settings.next_ticket_number}</p>
        </div>
      </section>

      {/* Menus */}
      <section className="settings-section">
        <h2 className="settings-section-title">🍽️ メニュー管理</h2>
        <form className="menu-add-form" onSubmit={handleAddMenu}>
          <input
            id="menu-name-input"
            type="text"
            className="settings-input menu-name-input"
            placeholder="メニュー名"
            value={newMenuName}
            onChange={e => setNewMenuName(e.target.value)}
          />
          <div className="menu-price-row">
            <input
              id="menu-price-input"
              type="number"
              min="0"
              className="settings-input menu-price-input"
              placeholder="単価"
              value={newMenuPrice}
              onChange={e => setNewMenuPrice(e.target.value)}
            />
            <span className="settings-unit">円</span>
            <button
              id="menu-add-button"
              type="submit"
              className="btn btn--primary"
              disabled={busyAction === 'add_menu'}
            >
              追加
            </button>
          </div>
        </form>

        {menus.length === 0 ? (
          <p className="empty-message">メニューがまだありません</p>
        ) : (
          <ul className="menu-list">
            {menus.map(menu => (
              <li key={menu.id} className="menu-list-item">
                <span className="menu-list-name">{menu.name}</span>
                <span className="menu-list-price">¥{menu.price.toLocaleString()}</span>
                <button
                  id={`menu-delete-${menu.id}`}
                  className="btn btn--danger btn--sm"
                  onClick={() => handleDeleteMenu(menu.id, menu.name)}
                  disabled={busyAction === 'del_menu_' + menu.id}
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Reset */}
      <section className="settings-section">
        <h2 className="settings-section-title">♻️ リセット</h2>
        <div className="reset-buttons">
          <button
            id="reset-orders-button"
            className="btn btn--danger btn--wide"
            onClick={() => setConfirmDialog('orders')}
            disabled={!!busyAction}
          >
            整理券・注文履歴をリセット
          </button>
          <button
            id="reset-tickets-button"
            className="btn btn--warning btn--wide"
            onClick={() => setConfirmDialog('tickets')}
            disabled={!!busyAction}
          >
            整理券番号のみリセット
          </button>
        </div>
      </section>

      {/* Logs */}
      <section className="settings-section">
        <h2 className="settings-section-title">📋 ログ閲覧</h2>
        <div className="log-filter-row">
          <input
            id="log-date-input"
            type="date"
            className="settings-input"
            value={logDate}
            onChange={e => setLogDate(e.target.value)}
          />
          <button
            id="log-fetch-button"
            className="btn btn--primary"
            onClick={fetchLogs}
            disabled={logsLoading}
          >
            {logsLoading ? '読み込み中...' : '表示'}
          </button>
        </div>
        {logs.length === 0 ? (
          <p className="empty-message">ログがありません</p>
        ) : (
          <ul className="log-list">
            {logs.map(log => (
              <li key={log.id} className="log-item">
                <span className="log-time">
                  {format(new Date(log.created_at), 'HH:mm:ss')}
                </span>
                <span className="log-device">{log.device_name}</span>
                <span className="log-action">{ACTION_LABELS[log.action] ?? log.action}</span>
                {log.detail && (
                  <span className="log-detail">{JSON.stringify(log.detail)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
