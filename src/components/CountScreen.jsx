import { useState, useRef, useEffect, useCallback } from 'react';

const COLS = 4;
const MIN_ROWS = 6; // グリッドの最小行数（アイコンが少ないときも間延びしないように）

const ICON_COLORS = [
  '#FF6B6B', '#FF9F43', '#FECA57', '#54A0FF',
  '#5F27CD', '#00D2D3', '#1DD1A1', '#FF9FF3',
  '#48DBFB', '#C8D6E5', '#FF6348', '#2ED573',
];

// 商品IDのハッシュから色を決定。管理画面でカラーが設定されていればそちらを優先
function colorOf(id, iconColors) {
  if (iconColors?.[id]) return iconColors[id];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  return ICON_COLORS[Math.abs(h) % ICON_COLORS.length];
}

// saved（GAS から取得した配置配列）と現在の商品リストを突き合わせてグリッド配置を構築する。
// 削除された商品は null に、新規商品は空きマスに追加する。
function buildPositions(saved, prods) {
  const validIds = new Set(prods.map(p => p.id));
  const base = Array.isArray(saved)
    ? saved.map(id => (id && validIds.has(id) ? id : null))
    : [];

  const placed = new Set(base.filter(Boolean));
  const unplaced = prods.filter(p => !placed.has(p.id)).map(p => p.id);
  const result = [...base];
  for (const id of unplaced) {
    const empty = result.findIndex(x => !x);
    if (empty !== -1) result[empty] = id;
    else result.push(id);
  }

  // 行数が MIN_ROWS に満たない場合は null で埋めて見た目を揃える
  const filled = result.filter(Boolean).length;
  const minLen = Math.max(COLS * MIN_ROWS, COLS * Math.ceil(Math.max(filled, 1) / COLS));
  while (result.length < minLen) result.push(null);
  while (result.length % COLS !== 0) result.push(null);
  return result;
}

export default function CountScreen({ products, todayOrders, iconPositions, iconColors, hiddenProducts, savePositions, updateOrderCount }) {
  // 非表示設定の商品はカウント画面に出さない
  const orderProds = products.filter(p => p.type === 'order' && !hiddenProducts?.[p.id]);
  const productIds = orderProds.map(p => p.id).join(',');

  const [positions, setPositions] = useState(() => buildPositions(iconPositions, orderProds));
  const [jiggling, setJiggling] = useState(false); // 編集モード（ジグルアニメーション + ドラッグ有効）
  const [ghost, setGhost]       = useState(null);  // ドラッグゴースト { id, x, y }
  const [fromIdx, setFromIdx]   = useState(-1);    // ドラッグ元セルインデックス
  const [hoverIdx, setHoverIdx] = useState(-1);    // ドロップ先ハイライト

  // useCallback / useEffect のクロージャ内で最新値を参照するための refs
  const posRef      = useRef(positions);
  const hoverRef    = useRef(-1);
  const jiggleRef   = useRef(false);
  const drag        = useRef(null);    // ドラッグ状態 { id, from, active, sx, sy }
  const gridRef     = useRef(null);
  const pressTimer  = useRef(null);
  const didLong     = useRef(false);

  useEffect(() => { posRef.current    = positions; }, [positions]);
  useEffect(() => { hoverRef.current  = hoverIdx;  }, [hoverIdx]);
  useEffect(() => { jiggleRef.current = jiggling;  }, [jiggling]);

  // 商品が追加・削除されたとき、グリッド配置を再計算して GAS に保存
  useEffect(() => {
    setPositions(prev => {
      const next = buildPositions(prev, orderProds);
      posRef.current = next;
      savePositions(next).catch(() => {});
      return next;
    });
  }, [productIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' });

  // ---- 通常モード：長押し (600ms) でジグルモードへ ----
  const pressOrigin = useRef(null);
  const startPress = (e) => {
    if (e?.cancelable) e.preventDefault();
    clearTimeout(pressTimer.current);
    didLong.current = false;
    const pt = e.touches ? e.touches[0] : e;
    pressOrigin.current = { x: pt.clientX, y: pt.clientY };
    pressTimer.current = setTimeout(() => { didLong.current = true; setJiggling(true); }, 600);
  };
  // 10px 以上移動したら長押しをキャンセル（スクロール中に誤発動しないように）
  const cancelPressIfMoved = (e) => {
    if (!pressOrigin.current) return;
    const pt = e.touches ? e.touches[0] : e;
    if (Math.hypot(pt.clientX - pressOrigin.current.x, pt.clientY - pressOrigin.current.y) > 10) {
      clearTimeout(pressTimer.current);
      pressOrigin.current = null;
    }
  };
  const endPress = () => { clearTimeout(pressTimer.current); pressOrigin.current = null; };
  // 長押し中または編集モード中はタップを無視してカウントアップしない
  const handleTap = (id) => { if (didLong.current || jiggleRef.current) return; updateOrderCount(id, 1); };

  // ---- 編集モード：アイコンをドラッグして入れ替え ----
  // 全セルの中心から最も近いセルを返す（= ドロップ先）
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
    // 6px 未満の移動はジグルモード開始直後の微振動として無視する
    if (!d.active) {
      if (Math.hypot(cx - d.sx, cy - d.sy) < 6) return;
      d.active = true;
    }
    setGhost({ id: d.id, x: cx, y: cy });
    const to = nearestCell(cx, cy);
    // ドラッグ元と同じセルにいる場合はハイライトしない
    setHoverIdx(to !== d.from ? to : -1);
  }, [nearestCell]);

  // ドラッグ確定：from ↔ to を入れ替えて GAS に保存
  const commitDrag = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    if (d.active) {
      const to = hoverRef.current; // 最新のホバー先を ref から取得（クロージャ汚染を避ける）
      if (to !== -1 && to !== d.from) {
        setPositions(prev => {
          const next = [...prev];
          [next[d.from], next[to]] = [next[to], next[d.from]];
          posRef.current = next;
          savePositions(next).catch(() => {});
          return next;
        });
      }
    }
    drag.current = null;
    setGhost(null); setFromIdx(-1); setHoverIdx(-1);
  }, [savePositions]);

  // iOS ルーペ・コンテキストメニューをグリッド全体でブロック
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const block = (e) => e.preventDefault();
    grid.addEventListener('touchstart', block, { passive: false });
    return () => grid.removeEventListener('touchstart', block);
  }, []);

  // 編集モード中のタッチドラッグ（passive: false でスクロールを防止）
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

  // 編集モード中のマウスドラッグ（PC 対応）
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
    // active: false のうちは 6px 閾値内の微動を無視（commitDrag 参照）
    drag.current = { id, from: idx, active: false, sx: cx, sy: cy };
    setFromIdx(idx);
  };

  const stopJiggling = () => {
    clearTimeout(pressTimer.current);
    didLong.current = false;
    jiggleRef.current = false;
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
        <div
          className="icon-grid free-grid"
          ref={gridRef}
          style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {positions.map((productId, i) => {
            const p        = productId ? orderProds.find(q => q.id === productId) : null;
            const count    = p ? (todayOrders[p.id] || 0) : 0;
            const dragging = fromIdx === i && ghost; // このセルのアイコンがドラッグ中
            const isHover  = hoverIdx === i && ghost; // ドロップ先としてハイライト

            return (
              <div
                key={i}
                className={`icon-cell ${isHover ? 'cell-hover' : ''}`}
                onTouchStart={startPress}
                onTouchMove={cancelPressIfMoved}
                onTouchEnd={() => {
                  // 空きセルをタップ → ジグルモード中なら終了（空きタップで抜ける UI）
                  if (!p && jiggleRef.current) {
                    if (!didLong.current) stopJiggling();
                    didLong.current = false;
                  } else { endPress(); }
                }}
                onMouseDown={startPress}
                onMouseMove={cancelPressIfMoved}
                onMouseUp={() => {
                  if (!p && jiggleRef.current) {
                    if (!didLong.current) stopJiggling();
                    didLong.current = false;
                  } else { endPress(); }
                }}
                onMouseLeave={endPress}
              >
                {p ? (
                  <div className={`icon-item ${jiggling ? 'jiggling' : ''}`}>
                    <div className="icon-wrapper" style={{ opacity: dragging ? 0.22 : 1 }}>
                      <button
                        className="icon-btn"
                        style={{ background: colorOf(p.id, iconColors), animationDelay: `${(i % 2) * 0.11}s` }}
                        draggable={false}
                        onTouchStart={(e) => { if (jiggling) startDrag(e.touches[0].clientX, e.touches[0].clientY, i, p.id); else startPress(); }}
                        onTouchEnd={(e) => { if (!jiggling) { endPress(); handleTap(p.id); } }}
                        onMouseDown={(e) => { if (jiggling) { e.preventDefault(); startDrag(e.clientX, e.clientY, i, p.id); } else startPress(); }}
                        onMouseUp={jiggling ? undefined : endPress}
                        onMouseLeave={jiggling ? undefined : endPress}
                        // pointerType チェック：タッチは onTouchEnd で処理済みなので onClick では重複しない
                        onClick={(e) => { if (e.pointerType !== 'touch') handleTap(p.id); }}
                        onContextMenu={(e) => e.preventDefault()}
                      >
                        <span className="icon-name">{p.name}</span>
                      </button>
                      {count > 0 && !dragging && (
                        <span className="count-badge">{count > 99 ? '99+' : count}</span>
                      )}
                      {/* −1 ボタン：アイコン下部にオーバーレイ。stopPropagation でセルの長押し判定を防ぐ */}
                      {jiggling && !dragging && (
                        <button
                          className="icon-dec-btn"
                          onTouchStart={(e) => e.stopPropagation()}
                          onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); updateOrderCount(p.id, -1); }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); updateOrderCount(p.id, -1); }}
                        >−1</button>
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

      {/* ドラッグゴースト：fixed 配置で指に追従 */}
      {ghost && (() => {
        const p = orderProds.find(q => q.id === ghost.id);
        if (!p) return null;
        return (
          <div className="drag-ghost" style={{ left: ghost.x, top: ghost.y }}>
            <div className="icon-btn" style={{ background: colorOf(p.id, iconColors), width: 68, height: 68, borderRadius: 16 }}>
              <span className="icon-letter">{p.name.charAt(0)}</span>
            </div>
            <div className="icon-label">{p.name}</div>
          </div>
        );
      })()}
    </div>
  );
}
