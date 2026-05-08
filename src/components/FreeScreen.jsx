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
  const handleKey = (e, idx, isLast) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (isLast) {
      e.target.blur();
    } else {
      inputRefs.current[idx + 1]?.focus();
    }
  };

  // ---- ドラッグ並べ替え（グリップ即ドラッグ・間に挿入）----
  const [dragIdx, setDragIdx] = useState(-1);
  const [gapIdx,  setGapIdx]  = useState(-1);
  const [ghostY,  setGhostY]  = useState(null);
  const gapRef    = useRef(-1);
  const dragState = useRef(null);
  const listRef   = useRef(null);

  const nearestGap = useCallback((cy) => {
    if (!listRef.current) return 0;
    const rows = [...listRef.current.querySelectorAll('.free-row')];
    if (rows.length === 0) return 0;
    const gaps = [rows[0].getBoundingClientRect().top];
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i].getBoundingClientRect().bottom;
      const b = rows[i + 1].getBoundingClientRect().top;
      gaps.push((a + b) / 2);
    }
    gaps.push(rows[rows.length - 1].getBoundingClientRect().bottom);
    let best = 0, minD = Infinity;
    gaps.forEach((y, i) => {
      const d = Math.abs(cy - y);
      if (d < minD) { minD = d; best = i; }
    });
    return best;
  }, []);

  const moveDrag = useCallback((cy) => {
    if (!dragState.current) return;
    setGhostY(cy);
    const gap = nearestGap(cy);
    gapRef.current = gap;
    setGapIdx(gap);
  }, [nearestGap]);

  const commitDrag = useCallback(() => {
    const d = dragState.current;
    if (!d) return;
    const gap = gapRef.current;
    if (gap !== -1 && gap !== d.from && gap !== d.from + 1) {
      setOrder(prev => {
        const next = [...prev];
        const [item] = next.splice(d.from, 1);
        const insertAt = gap > d.from ? gap - 1 : gap;
        next.splice(insertAt, 0, item);
        return next;
      });
    }
    dragState.current = null;
    setGhostY(null);
    setDragIdx(-1);
    gapRef.current = -1;
    setGapIdx(-1);
  }, []);

  useEffect(() => {
    if (dragIdx === -1) return;
    const mv = (e) => { e.preventDefault(); moveDrag(e.touches ? e.touches[0].clientY : e.clientY); };
    const up = () => commitDrag();
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
  }, [dragIdx, moveDrag, commitDrag]);

  const startDrag = (e, idx) => {
    e.preventDefault();
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    dragState.current = { from: idx };
    gapRef.current = -1;
    setDragIdx(idx);
    setGhostY(cy);
    setGapIdx(-1);
  };

  const orderedProds = order.map(id => freeProds.find(p => p.id === id)).filter(Boolean);
  const today = new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' });

  const renderList = (type) => {
    const data = type === 'before' ? beforeData : afterData;
    return (
      <div ref={listRef}>
        {orderedProds.map((p, idx) => {
          const isLastProd = idx === orderedProds.length - 1;
          return (
            <div key={p.id}>
              {dragIdx !== -1 && gapIdx === idx && <div className="free-drop-line" />}
              <div className={`free-row${dragIdx === idx ? ' free-row-dragging' : ''}`}>
                <div
                  className="free-row-grip"
                  onTouchStart={(e) => startDrag(e, idx)}
                  onMouseDown={(e) => startDrag(e, idx)}
                >⠿</div>
                <div className="free-row-name">{p.name}</div>
                <div className="free-row-inputs">
                  <div className="free-row-field">
                    <input
                      ref={el => { inputRefs.current[idx * 2] = el; }}
                      className="free-row-input"
                      type="text"
                      inputMode="tel"
                      enterKeyHint="next"
                      value={(data[p.id] || {}).count || ''}
                      onChange={e => setField(type, p.id, 'count', e.target.value.replace(/[^0-9]/g, ''))}
                      onKeyDown={e => handleKey(e, idx * 2, false)}
                      placeholder="0"
                    />
                    <span className="free-row-unit">個</span>
                  </div>
                  <div className="free-row-field">
                    <input
                      ref={el => { inputRefs.current[idx * 2 + 1] = el; }}
                      className="free-row-input"
                      type="text"
                      inputMode="tel"
                      enterKeyHint={isLastProd ? 'done' : 'next'}
                      value={(data[p.id] || {}).ml || ''}
                      onChange={e => setField(type, p.id, 'ml', e.target.value.replace(/[^0-9]/g, ''))}
                      onKeyDown={e => handleKey(e, idx * 2 + 1, isLastProd)}
                      placeholder="0"
                    />
                    <span className="free-row-unit">ml</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {dragIdx !== -1 && gapIdx === orderedProds.length && <div className="free-drop-line" />}

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
