import { useState, useRef, useCallback, useEffect } from 'react';
import { gasPost } from '../api';

export default function FreeScreen({ products, todayFree }) {
  const freeProds = products.filter(p => p.type === 'free');
  const prodIds   = freeProds.map(p => p.id).join(',');

  const [subTab, setSubTab] = useState('before');
  const [order,  setOrder]  = useState(() => freeProds.map(p => p.id));

  useEffect(() => {
    setOrder(prev => {
      const validIds = new Set(freeProds.map(p => p.id));
      const kept  = prev.filter(id => validIds.has(id));
      const added = freeProds.filter(p => !kept.includes(p.id)).map(p => p.id);
      return [...kept, ...added];
    });
  }, [prodIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const makeInit = (type) => {
    const d = {};
    freeProds.forEach(p => {
      d[p.id] = {
        count: todayFree[p.id]?.[`${type}Count`] != null ? String(todayFree[p.id][`${type}Count`]) : '',
        ml:    todayFree[p.id]?.[`${type}Ml`]    != null ? String(todayFree[p.id][`${type}Ml`])    : '',
      };
    });
    return d;
  };

  const [beforeData, setBeforeData] = useState(() => makeInit('before'));
  const [afterData,  setAfterData]  = useState(() => makeInit('after'));
  const saveTimers = useRef({});

  const scheduleSave = useCallback((productId, type, count, ml) => {
    const key = `${productId}_${type}`;
    clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(() => {
      gasPost('saveFreeData', {
        productId, type,
        count: count !== '' ? Number(count) : null,
        ml:    ml    !== '' ? Number(ml)    : null,
      }).catch(() => {});
    }, 800);
  }, []);

  const setField = useCallback((type, productId, field, value) => {
    const setter = type === 'before' ? setBeforeData : setAfterData;
    setter(prev => {
      const next = { ...prev, [productId]: { ...prev[productId], [field]: value } };
      scheduleSave(productId, type, next[productId].count, next[productId].ml);
      return next;
    });
  }, [scheduleSave]);

  // Enter キーで次フィールドへ
  const inputRefs = useRef([]);
  const handleKey = (e, idx) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    inputRefs.current[idx + 1]?.focus();
  };

  // ドラッグ並べ替え
  const [dragIdx,  setDragIdx]  = useState(-1);
  const [hoverIdx, setHoverIdx] = useState(-1);
  const [ghostY,   setGhostY]   = useState(null);
  const hoverRef  = useRef(-1);
  const dragState = useRef(null);
  const listRef   = useRef(null);
  const pressTimer = useRef(null);

  const nearestRow = useCallback((cy) => {
    if (!listRef.current) return -1;
    let best = -1, minD = Infinity;
    listRef.current.querySelectorAll('.free-row').forEach((el, i) => {
      const r   = el.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      const d   = Math.abs(cy - mid);
      if (d < minD) { minD = d; best = i; }
    });
    return best;
  }, []);

  const moveRow = useCallback((cy) => {
    const d = dragState.current;
    if (!d) return;
    if (!d.active) {
      if (Math.abs(cy - d.sy) < 8) return;
      d.active = true;
    }
    setGhostY(cy);
    const to = nearestRow(cy);
    const h  = to !== d.from ? to : -1;
    hoverRef.current = h;
    setHoverIdx(h);
  }, [nearestRow]);

  const commitRow = useCallback(() => {
    const d = dragState.current;
    if (!d) return;
    if (d.active) {
      const to = hoverRef.current;
      if (to !== -1 && to !== d.from) {
        setOrder(prev => {
          const next = [...prev];
          [next[d.from], next[to]] = [next[to], next[d.from]];
          return next;
        });
      }
    }
    dragState.current = null;
    setGhostY(null);
    setDragIdx(-1);
    hoverRef.current = -1;
    setHoverIdx(-1);
  }, []);

  useEffect(() => {
    if (dragIdx === -1) return;
    const mv = (e) => {
      e.preventDefault();
      moveRow(e.touches ? e.touches[0].clientY : e.clientY);
    };
    const up = () => commitRow();
    document.addEventListener('touchmove', mv, { passive: false });
    document.addEventListener('touchend',  up);
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup',   up);
    return () => {
      document.removeEventListener('touchmove', mv);
      document.removeEventListener('touchend',  up);
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup',   up);
    };
  }, [dragIdx, moveRow, commitRow]);

  const startPress = (e, idx) => {
    if (e.target.tagName === 'INPUT') return;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      dragState.current = { from: idx, active: false, sy: cy };
      setDragIdx(idx);
    }, 600);
  };
  const endPress = () => clearTimeout(pressTimer.current);

  const orderedProds = order.map(id => freeProds.find(p => p.id === id)).filter(Boolean);
  const today = new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' });

  const renderList = (type) => {
    const data = type === 'before' ? beforeData : afterData;
    return (
      <div ref={listRef}>
        {orderedProds.map((p, idx) => (
          <div
            key={p.id}
            className={`free-row${hoverIdx === idx ? ' free-row-hover' : ''}${dragIdx === idx ? ' free-row-dragging' : ''}`}
            onTouchStart={(e) => startPress(e, idx)}
            onTouchEnd={endPress}
            onMouseDown={(e) => startPress(e, idx)}
            onMouseUp={endPress}
            onMouseLeave={endPress}
          >
            <div className="free-row-grip">⠿</div>
            <div className="free-row-name">{p.name}</div>
            <div className="free-row-inputs">
              <div className="free-row-field">
                <input
                  ref={el => { inputRefs.current[idx * 2] = el; }}
                  className="free-row-input"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={(data[p.id] || {}).count || ''}
                  onChange={e => setField(type, p.id, 'count', e.target.value)}
                  onKeyDown={e => handleKey(e, idx * 2)}
                  placeholder="0"
                />
                <span className="free-row-unit">個</span>
              </div>
              <div className="free-row-field">
                <input
                  ref={el => { inputRefs.current[idx * 2 + 1] = el; }}
                  className="free-row-input"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={(data[p.id] || {}).ml || ''}
                  onChange={e => setField(type, p.id, 'ml', e.target.value)}
                  onKeyDown={e => handleKey(e, idx * 2 + 1)}
                  placeholder="0"
                />
                <span className="free-row-unit">ml</span>
              </div>
            </div>
          </div>
        ))}

        {ghostY !== null && dragIdx >= 0 && orderedProds[dragIdx] && (
          <div className="free-drag-ghost" style={{ top: ghostY }}>
            <span className="free-row-grip">⠿</span>
            <span className="free-row-name">{orderedProds[dragIdx].name}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="screen">
      <div className="screen-header">
        <h1>フリードリンク</h1>
        <span className="screen-date">{today}</span>
      </div>

      <div className="sub-tabs">
        {[['before', '営業前'], ['after', '営業後'], ['summary', '集計']].map(([id, label]) => (
          <button
            key={id}
            className={`sub-tab${subTab === id ? ' active' : ''}`}
            onClick={() => setSubTab(id)}
          >{label}</button>
        ))}
      </div>

      {freeProds.length === 0 ? (
        <div className="empty-state">
          フリードリンクがありません。<br />管理画面で商品を追加してください。
        </div>
      ) : subTab === 'before' ? renderList('before')
        : subTab === 'after'  ? renderList('after')
        : (
          <div className="free-summary">
            <div className="free-summary-header">
              <span>商品</span>
              <span>営業前</span>
              <span>営業後</span>
              <span>出庫</span>
            </div>
            {orderedProds.map(p => {
              const b  = beforeData[p.id] || {};
              const a  = afterData[p.id]  || {};
              const bc = b.count !== '' ? Number(b.count) : null;
              const bm = b.ml    !== '' ? Number(b.ml)    : null;
              const ac = a.count !== '' ? Number(a.count) : null;
              const am = a.ml    !== '' ? Number(a.ml)    : null;
              const dc = bc != null && ac != null ? bc - ac : null;
              const dm = bm != null && am != null ? bm - am : null;
              return (
                <div key={p.id} className="free-summary-row">
                  <div className="free-summary-name">{p.name}</div>
                  <div className="free-summary-cell">
                    {bc != null ? `${bc}個` : '—'}<br />{bm != null ? `${bm}ml` : '—'}
                  </div>
                  <div className="free-summary-cell">
                    {ac != null ? `${ac}個` : '—'}<br />{am != null ? `${am}ml` : '—'}
                  </div>
                  <div className={`free-summary-cell free-summary-diff${dc != null && dc > 0 ? ' positive' : ''}`}>
                    {dc != null ? `${dc}個` : '—'}<br />{dm != null ? `${dm}ml` : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        )
      }
    </div>
  );
}
