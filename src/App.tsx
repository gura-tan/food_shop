import { useState } from 'react';
import { DeviceSetup, getStoredDeviceName } from './components/DeviceSetup';
import { OfflineOverlay } from './components/OfflineOverlay';
import { TabNav, type TabId } from './components/TabNav';
import { SettingsTab } from './components/tabs/SettingsTab';
import { CashierTab } from './components/tabs/CashierTab';
import { KitchenTab } from './components/tabs/KitchenTab';
import { PickupTab } from './components/tabs/PickupTab';
import { useOnlineStatus } from './hooks/useOnlineStatus';

export default function App() {
  const [deviceName, setDeviceName] = useState<string | null>(getStoredDeviceName());
  const [activeTab, setActiveTab] = useState<TabId>('cashier');
  const isOnline = useOnlineStatus();

  // If deviceName is stored, skip setup screen
  function handleDeviceSetup(name: string) {
    setDeviceName(name);
  }

  if (!deviceName) {
    return <DeviceSetup onComplete={handleDeviceSetup} />;
  }

  return (
    <div className="app">
      {!isOnline && <OfflineOverlay />}

      <header className="app-header">
        <div className="app-header-left">
          <span className="app-logo">🏪</span>
          <span className="app-title">注文管理</span>
        </div>
        <div className="app-header-right">
          <span className="device-chip">
            <span className="device-chip-icon">📱</span>
            {deviceName}
          </span>
          <button
            id="change-device-button"
            className="btn btn--ghost btn--xs"
            onClick={() => {
              localStorage.removeItem('food_stall_device_name');
              setDeviceName(null);
            }}
          >
            変更
          </button>
        </div>
      </header>

      <TabNav activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="app-main">
        {activeTab === 'settings' && <SettingsTab deviceName={deviceName} />}
        {activeTab === 'cashier'  && <CashierTab  deviceName={deviceName} />}
        {activeTab === 'kitchen'  && <KitchenTab  deviceName={deviceName} />}
        {activeTab === 'pickup'   && <PickupTab   deviceName={deviceName} />}
      </main>
    </div>
  );
}
