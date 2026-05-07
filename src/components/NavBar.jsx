const TABS = [
  { id: 'count',     label: 'カウント', icon: '🍺' },
  { id: 'free',      label: 'フリー',   icon: '🥤' },
  { id: 'stock',     label: '在庫',     icon: '📦' },
  { id: 'receiving', label: '入荷',     icon: '📥' },
  { id: 'manage',    label: '管理',     icon: '⚙️'  },
];

export default function NavBar({ current, onChange }) {
  return (
    <nav className="navbar">
      {TABS.map(t => (
        <button
          key={t.id}
          className={`nav-btn ${current === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          <span className="nav-icon">{t.icon}</span>
          <span className="nav-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
