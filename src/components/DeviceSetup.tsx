import React, { useState } from 'react';

const STORAGE_KEY = 'food_stall_device_name';

interface Props {
  onComplete: (deviceName: string) => void;
}

export function DeviceSetup({ onComplete }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('名前を入力してください');
      return;
    }
    localStorage.setItem(STORAGE_KEY, trimmed);
    onComplete(trimmed);
  }

  return (
    <div className="device-setup-overlay">
      <div className="device-setup-card">
        <div className="device-setup-icon">🏪</div>
        <h1 className="device-setup-title">食品出店 注文管理</h1>
        <p className="device-setup-subtitle">どなたの端末からアクセスしていますか？</p>
        <form onSubmit={handleSubmit} className="device-setup-form">
          <input
            id="device-name-input"
            type="text"
            className="device-setup-input"
            placeholder="例: レジ担当・山田"
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
            autoFocus
            autoComplete="off"
          />
          {error && <p className="device-setup-error">{error}</p>}
          <button
            id="device-name-submit"
            type="submit"
            className="device-setup-button"
          >
            はじめる
          </button>
        </form>
      </div>
    </div>
  );
}

export function getStoredDeviceName(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}
