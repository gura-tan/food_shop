export function OfflineOverlay() {
  return (
    <div className="offline-overlay">
      <div className="offline-card">
        <div className="offline-icon">📡</div>
        <h2 className="offline-title">オフラインです</h2>
        <p className="offline-message">
          インターネット接続が切断されました。<br />
          接続が回復するまでお待ちください。
        </p>
        <div className="offline-spinner" />
      </div>
    </div>
  );
}
