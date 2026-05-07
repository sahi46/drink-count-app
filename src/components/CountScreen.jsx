import { useState, useRef, useEffect, useCallback } from 'react';

const COLS = 4;
const EXTRA_ROWS = 2;

const ICON_COLORS = [
  '#FF6B6B', '#FF9F43', '#FECA57', '#54A0FF',
  '#5F27CD', '#00D2D3', '#1DD1A1', '#FF9FF3',
  '#48DBFB', '#C8D6E5', '#FF6348', '#2ED573',
];

function colorOf(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  return ICON_COLORS[Math.abs(h) % ICON_COLORS.length];
}

function buildPositions(saved, prods) {
  const validIds = new Set(prods.map(p => p.id));
  const base = Array.isArray(saved)
    ? saved.map(id => (id && validIds.has(id) ? id : null))
    : [];

  // まだ配置されていない商品を空きマスに追加
  const placed = new Set(base.filter(Boolean));
  const unplaced = prods.filter(p => !placed.has(p.id)).map(p => p.id);
  const result = [...base];
  for (const id of unplaced) {
    const empty = result.findIndex(x => !x);
    if (empty !== -1) result[empty] = id;
    else result.push(id);
  }

  // 末尾に EXTRA_ROWS 行分の空きを確保
  const filled = result.filter(Boolean).length;
  const minLen = COLS * (Math.ceil(Math.max(filled, 1) / COLS) + EXTRA_ROWS);
  while (result.length < minLen) result.push(null);
  while (result.length % COLS !== 0) result.push(null);
  return result;
}

export default function CountScreen({ products, todayOrders, iconPositions, post, updateOrderCount }) {
  const orderProds = products.filter(p => p.type === 'order');
  const productIds = orderProds.map(p => p.id).join(',');

  const [positions, setPositions] = useState(() => buildPositions(iconPositions, orderProds));
  const [jiggling, setJiggling] = useState(false);
  const [ghost, setGhost]       = useState(null);   // { id, x, y }
  const [fromIdx, setFromIdx]   = useState(-1);
  const [hoverIdx, setHoverIdx] = useState(-1);

  // refs（コールバック内でも最新値を読むため）
  const posRef      = useRef(positions);
  const hoverRef    = useRef(-1);
  const drag        = useRef(null);
  const gridRef     = useRef(null);
  const pressTimer  = useRef(null);
  const didLong     = useRef(false);

  useEffect(() => { posRef.current = positions; },  [positions]);
  useEffect(() => { hoverRef.current = hoverIdx; }, [hoverIdx]);

  // 商品追加・削除に追従
  useEffect(() => {
    setPositions(prev => {
      const next = buildPositions(prev, orderProds);
      posRef.current = next;
      post('savePositions', { positions: next }).catch(() => {});
      return next;
    });
  }, [productIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' });

  // ---- 通常モード：長押しでジグル ----
  const startPress = () => {
    didLong.current = false;
    pressTimer.current = setTimeout(() => { didLong.current = true; setJiggling(true); }, 500);
  };
  const endPress = () => clearTimeout(pressTimer.current);
  const handleTap = (id) => { if (didLong.current || jiggling) return; updateOrderCount(id, 1); };

  // ---- 編集モード：ドラッグ ----
  const nearestCell = useCallback((cx, cy) => {
    if (!gridRef.current) return -1;
    let best = -1, minD = Infinity;
    gridRef.current.querySelectorAll('.icon-cell').forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(cx - (r.left + r.width / 2), cy - (r.top + r.height / 2));
      if (d < minD) { minD = d; best = i; }
    });
    return best;
  }, []);

  const moveDrag = useCallback((cx, cy) => {
    const d = drag.current;
    if (!d) return;
    if (!d.active) {
      if (Math.hypot(cx - d.sx, cy - d.sy) < 6) return;
      d.active = true;
    }
    setGhost({ id: d.id, x: cx, y: cy });
    const to = nearestCell(cx, cy);
    setHoverIdx(to !== d.from ? to : -1);
  }, [nearestCell]);

  const commitDrag = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    if (d.active) {
      const to = hoverRef.current;
      if (to !== -1 && to !== d.from) {
        setPositions(prev => {
          const next = [...prev];
          [next[d.from], next[to]] = [next[to], next[d.from]];
          posRef.current = next;
          post('savePositions', { positions: next }).catch(() => {});
          return next;
        });
      }
    }
    drag.current = null;
    setGhost(null); setFromIdx(-1); setHoverIdx(-1);
  }, [post]);

  // タッチ（iOS, passive: false でスクロールをブロック）
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || !jiggling) return;
    const mv = (e) => { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY); };
    const up = () => commitDrag();
    grid.addEventListener('touchmove',   mv, { passive: false });
    grid.addEventListener('touchend',    up);
    grid.addEventListener('touchcancel', up);
    return () => {
      grid.removeEventListener('touchmove',   mv);
      grid.removeEventListener('touchend',    up);
      grid.removeEventListener('touchcancel', up);
    };
  }, [jiggling, moveDrag, commitDrag]);

  // マウス（PC）
  useEffect(() => {
    if (!jiggling) return;
    const mv = (e) => moveDrag(e.clientX, e.clientY);
    const up = () => commitDrag();
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup',   up);
    return () => {
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup',   up);
    };
  }, [jiggling, moveDrag, commitDrag]);

  const startDrag = (cx, cy, idx, id) => {
    drag.current = { id, from: idx, active: false, sx: cx, sy: cy };
    setFromIdx(idx);
  };

  const stopJiggling = () => {
    setJiggling(false); setGhost(null); setFromIdx(-1); setHoverIdx(-1);
    drag.current = null;
  };

  return (
    <div className="screen count-screen">
      <div className="screen-header">
        <h1>オーダーカウント</h1>
        {jiggling
          ? <button className="done-btn" onClick={stopJiggling}>完了</button>
          : <span className="screen-date">{today}</span>
        }
      </div>

      {orderProds.length === 0 ? (
        <div className="empty-state">
          オーダードリンクがありません。<br />管理画面で商品を追加してください。
        </div>
      ) : (
        <div className="icon-grid free-grid" ref={gridRef} style={{ userSelect: 'none' }}>
          {positions.map((productId, i) => {
            const p        = productId ? orderProds.find(q => q.id === productId) : null;
            const count    = p ? (todayOrders[p.id] || 0) : 0;
            const dragging = fromIdx === i && ghost;
            const isHover  = hoverIdx === i && ghost;

            return (
              <div key={i} className={`icon-cell ${isHover ? 'cell-hover' : ''}`}>
                {p ? (
                  <div className={`icon-item ${jiggling ? 'jiggling' : ''}`}>
                    <div className="icon-wrapper" style={{ opacity: dragging ? 0.22 : 1 }}>
                      {jiggling && (
                        <button
                          className="minus-badge"
                          onTouchStart={(e) => e.stopPropagation()}
                          onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); updateOrderCount(p.id, -1); }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); updateOrderCount(p.id, -1); }}
                        >−</button>
                      )}
                      <button
                        className="icon-btn"
                        style={{ background: colorOf(p.id), animationDelay: `${(i % 2) * 0.11}s` }}
                        draggable={false}
                        onTouchStart={(e) => { if (jiggling) startDrag(e.touches[0].clientX, e.touches[0].clientY, i, p.id); else startPress(); }}
                        onTouchEnd={jiggling ? undefined : endPress}
                        onMouseDown={(e) => { if (jiggling) { e.preventDefault(); startDrag(e.clientX, e.clientY, i, p.id); } else startPress(); }}
                        onMouseUp={jiggling ? undefined : endPress}
                        onMouseLeave={jiggling ? undefined : endPress}
                        onClick={() => handleTap(p.id)}
                        onContextMenu={(e) => e.preventDefault()}
                      >
                        <span className="icon-letter">{p.name.charAt(0)}</span>
                      </button>
                      {count > 0 && !dragging && (
                        <span className="count-badge">{count > 99 ? '99+' : count}</span>
                      )}
                    </div>
                    <div className="icon-label" style={{ opacity: dragging ? 0.22 : 1 }}>{p.name}</div>
                  </div>
                ) : (
                  <div className="icon-empty" />
                )}
              </div>
            );
          })}
        </div>
      )}

      {ghost && (() => {
        const p = orderProds.find(q => q.id === ghost.id);
        if (!p) return null;
        return (
          <div className="drag-ghost" style={{ left: ghost.x, top: ghost.y }}>
            <div className="icon-btn" style={{ background: colorOf(p.id), width: 68, height: 68, borderRadius: 16 }}>
              <span className="icon-letter">{p.name.charAt(0)}</span>
            </div>
            <div className="icon-label">{p.name}</div>
          </div>
        );
      })()}
    </div>
  );
}
