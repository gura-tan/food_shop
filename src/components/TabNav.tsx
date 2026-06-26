export type TabId = 'settings' | 'cashier' | 'kitchen' | 'pickup';

interface Props {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const TABS: { id: TabId; label: string; emoji: string }[] = [
  { id: 'settings', label: '設定', emoji: '⚙️' },
  { id: 'cashier',  label: 'レジ',  emoji: '🛒' },
  { id: 'kitchen',  label: '厨房',  emoji: '🍳' },
  { id: 'pickup',   label: '受取',  emoji: '📦' },
];

export function TabNav({ activeTab, onTabChange }: Props) {
  return (
    <nav className="tab-nav" role="tablist">
      {TABS.map(tab => (
        <button
          key={tab.id}
          id={`tab-${tab.id}`}
          role="tab"
          aria-selected={activeTab === tab.id}
          className={`tab-nav-button ${activeTab === tab.id ? 'tab-nav-button--active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          <span className="tab-nav-emoji">{tab.emoji}</span>
          <span className="tab-nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
