import { useRef, useState } from 'react';

const TABS = [
  { id: 'count',     label: 'カウント', icon: '🍺' },
  { id: 'free',      label: 'フリー',   icon: '🥤' },
  { id: 'stock',     label: '在庫',     icon: '📦' },
  { id: 'receiving', label: '入荷',     icon: '📥' },
  { id: 'manage',    label: '管理',     icon: '⚙️'  },
];

export default function NavBar({ current, onChange }) {
  const navRef = useRef(null);
  const [dragging, setDragging] = useState(null); // スライド中の仮タブ

  const tabFromPoint = (clientX) => {
    if (!navRef.current) return null;
    for (const el of navRef.current.querySelectorAll('.nav-btn')) {
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right) return el.dataset.id;
    }
    return null;
  };

  const handleTouchStart = (e) => {
    setDragging(tabFromPoint(e.touches[0].clientX));
  };

  const handleTouchMove = (e) => {
    const id = tabFromPoint(e.touches[0].clientX);
    if (id) setDragging(id);
  };

  const handleTouchEnd = (e) => {
    const id = tabFromPoint(e.changedTouches[0].clientX);
    setDragging(null);
    if (id && id !== current) onChange(id);
  };

  const activeTab = dragging ?? current;

  return (
    <nav
      className="navbar"
      ref={navRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {TABS.map(t => (
        <button
          key={t.id}
          data-id={t.id}
          className={`nav-btn ${activeTab === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          <span className="nav-icon">{t.icon}</span>
          <span className="nav-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
