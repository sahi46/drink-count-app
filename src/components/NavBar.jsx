import { useRef, useState, useEffect } from 'react';

const TABS = [
  { id: 'count',  label: 'カウント', icon: '🍺' },
  { id: 'free',   label: 'フリー',   icon: '🥤' },
  { id: 'manage', label: '管理',     icon: '⚙️'  },
];

export default function NavBar({ current, onChange }) {
  const navRef = useRef(null);
  const [dragging, setDragging] = useState(null); // スライド中の仮タブ

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const prevent = (e) => e.preventDefault();
    el.addEventListener('touchmove', prevent, { passive: false });
    return () => el.removeEventListener('touchmove', prevent);
  }, []);

  const tabFromPoint = (clientX) => {
    if (!navRef.current) return null;
    for (const el of navRef.current.querySelectorAll('.nav-btn')) {
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right) return el.dataset.id;
    }
    return null;
  };

  const handleTouchStart = (e) => {
    e.stopPropagation();
    setDragging(tabFromPoint(e.touches[0].clientX));
  };

  const handleTouchMove = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const id = tabFromPoint(e.touches[0].clientX);
    if (id) setDragging(id);
  };

  const handleTouchEnd = (e) => {
    e.stopPropagation();
    const id = tabFromPoint(e.changedTouches[0].clientX);
    setDragging(null);
    if (id && id !== current) onChange(id);
  };

  const activeTab = dragging ?? current;

  return (
    <div
      className="navbar-wrap"
      ref={navRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <nav className="navbar">
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
    </div>
  );
}
