import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

const ICON_COLORS = [
  '#FF6B6B', '#FF9F43', '#FECA57', '#54A0FF',
  '#5F27CD', '#00D2D3', '#1DD1A1', '#FF9FF3',
  '#48DBFB', '#C8D6E5', '#FF6348', '#2ED573',
  '#A29BFE', '#FD79A8', '#FDCB6E', '#6C5CE7',
];

// ---- 並び順をlocalStorage + GASに保存するhook ----
function useSortList(key, items, onOrderChange) {
  const onChangeRef = useRef(onOrderChange);
  useEffect(() => { onChangeRef.current = onOrderChange; }, [onOrderChange]);

  const ids = items.map(i => i.id).join(',');

  const [order, _setOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '[]');
      const validIds = new Set(items.map(i => i.id));
      const kept  = saved.filter(id => validIds.has(id));
      const added = items.filter(i => !kept.includes(i.id)).map(i => i.id);
      return [...kept, ...added];
    } catch { return items.map(i => i.id); }
  });

  useEffect(() => {
    _setOrder(prev => {
      const validIds = new Set(items.map(i => i.id));
      const kept  = prev.filter(id => validIds.has(id));
      const added = items.filter(i => !kept.includes(i.id)).map(i => i.id);
      const next  = [...kept, ...added];
      return next.join(',') === prev.join(',') ? prev : next;
    });
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps

  const setOrder = useCallback((update) => {
    _setOrder(prev => {
      const next = typeof update === 'function' ? update(prev) : update;
      localStorage.setItem(key, JSON.stringify(next));
      onChangeRef.current?.(next);
      return next;
    });
  }, [key]);

  return [order, setOrder];
}

// ---- ドラッグ並び替えhook ----
function useDragSort(setOrder) {
  const [dragIdx, setDragIdx] = useState(-1);
  const [gapIdx,  setGapIdx]  = useState(-1);
  const [ghostY,  setGhostY]  = useState(null);
  const gapRef   = useRef(-1);
  const dragFrom = useRef(-1);
  const listRef  = useRef(null);

  const nearestGap = useCallback((cy) => {
    if (!listRef.current) return 0;
    const rows = [...listRef.current.querySelectorAll('.sort-row')];
    if (rows.length === 0) return 0;
    const gaps = [rows[0].getBoundingClientRect().top];
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i].getBoundingClientRect().bottom;
      const b = rows[i + 1].getBoundingClientRect().top;
      gaps.push((a + b) / 2);
    }
    gaps.push(rows[rows.length - 1].getBoundingClientRect().bottom);
    let best = 0, minD = Infinity;
    gaps.forEach((y, i) => { const d = Math.abs(cy - y); if (d < minD) { minD = d; best = i; } });
    return best;
  }, []);

  const commitDrag = useCallback(() => {
    const from = dragFrom.current;
    const gap  = gapRef.current;
    if (gap !== -1 && gap !== from && gap !== from + 1) {
      setOrder(prev => {
        const next = [...prev];
        const [item] = next.splice(from, 1);
        next.splice(gap > from ? gap - 1 : gap, 0, item);
        return next;
      });
    }
    setDragIdx(-1); setGhostY(null); setGapIdx(-1);
    gapRef.current = -1; dragFrom.current = -1;
  }, [setOrder]);

  const moveDrag = useCallback((cy) => {
    setGhostY(cy);
    const gap = nearestGap(cy);
    gapRef.current = gap; setGapIdx(gap);
  }, [nearestGap]);

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

  const startDrag = useCallback((e, idx) => {
    e.preventDefault();
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    dragFrom.current = idx; gapRef.current = idx;
    setDragIdx(idx); setGhostY(cy); setGapIdx(idx);
  }, []);

  const startDragAt = useCallback((idx, y) => {
    dragFrom.current = idx; gapRef.current = idx;
    setDragIdx(idx); setGhostY(y); setGapIdx(idx);
  }, []);

  return { dragIdx, gapIdx, ghostY, listRef, startDrag, startDragAt };
}

// ---- ManageScreen ----
export default function ManageScreen({ categories, products, post, iconColors, saveIconColor, hiddenProducts, toggleVisibility, saveManageOrder }) {
  const [subTab, setSubTab] = useState('order');
  return (
    <div className="screen">
      <div className="screen-header"><h1>管理</h1></div>
      <div className="sub-tabs">
        {[['order', 'オーダー'], ['free', 'フリー'], ['categories', 'カテゴリ']].map(([id, label]) => (
          <button key={id} className={`sub-tab${subTab === id ? ' active' : ''}`} onClick={() => setSubTab(id)}>{label}</button>
        ))}
      </div>
      {subTab === 'order'      && <OrderManager products={products} post={post} iconColors={iconColors} saveIconColor={saveIconColor} hiddenProducts={hiddenProducts} toggleVisibility={toggleVisibility} saveManageOrder={saveManageOrder} />}
      {subTab === 'free'       && <FreeManager  products={products} post={post} hiddenProducts={hiddenProducts} toggleVisibility={toggleVisibility} saveManageOrder={saveManageOrder} />}
      {subTab === 'categories' && <CategoryManager categories={categories} post={post} />}
    </div>
  );
}

// ---- 長押し＋スワイプ削除＋タップ編集 統合コンポーネント ----
function InteractiveItem({ idx, onEdit, onDelete, onLongPress, colorDot, extra, children }) {
  const [offset, setOffset] = useState(0);
  const wrapRef  = useRef(null);
  const touchRef = useRef(null);
  const THRESHOLD = 72;

  useEffect(() => {
    if (offset >= 0) return;
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOffset(0);
    };
    document.addEventListener('touchstart', close, { passive: true });
    document.addEventListener('mousedown',  close);
    return () => {
      document.removeEventListener('touchstart', close);
      document.removeEventListener('mousedown',  close);
    };
  }, [offset]);

  const onTouchStart = (e) => {
    const t = e.touches[0];
    touchRef.current = {
      startX: t.clientX, startY: t.clientY, startOffset: offset,
      isHoriz: null, didLong: false,
      timer: setTimeout(() => {
        if (!touchRef.current) return;
        touchRef.current.didLong = true;
        onLongPress(idx, t.clientY);
      }, 600),
    };
  };

  const onTouchMove = (e) => {
    const tc = touchRef.current;
    if (!tc) return;
    const dx = e.touches[0].clientX - tc.startX;
    const dy = e.touches[0].clientY - tc.startY;
    if ((Math.abs(dx) > 8 || Math.abs(dy) > 8) && tc.timer) {
      clearTimeout(tc.timer); tc.timer = null;
    }
    if (tc.isHoriz === null) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      tc.isHoriz = Math.abs(dx) > Math.abs(dy) * 1.5;
    }
    if (!tc.isHoriz) return;
    setOffset(Math.max(-THRESHOLD, Math.min(0, tc.startOffset + dx)));
  };

  const onTouchEnd = (e) => {
    const tc = touchRef.current;
    if (!tc) return;
    if (tc.timer) clearTimeout(tc.timer);
    touchRef.current = null;
    if (tc.didLong) return;
    const dx = e.changedTouches[0].clientX - tc.startX;
    const dy = e.changedTouches[0].clientY - tc.startY;
    if (tc.isHoriz) {
      setOffset((tc.startOffset + dx) < -THRESHOLD / 2 ? -THRESHOLD : 0);
    } else if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
      if (tc.startOffset < -8) setOffset(0);
      else onEdit();
    }
  };

  return (
    <div ref={wrapRef} className="swipe-item-wrap" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div className="swipe-item-delete-bg">
        <button className="swipe-delete-btn"
          onTouchEnd={(e) => { e.stopPropagation(); setOffset(0); onDelete(); }}
          onClick={(e)    => { e.stopPropagation(); setOffset(0); onDelete(); }}
        >削除</button>
      </div>
      <div className="swipe-item-content" style={{ transform: `translateX(${offset}px)` }}>
        {colorDot && <span className="list-item-color-dot" style={{ background: colorDot }} />}
        <div className="swipe-item-body">{children}</div>
        {extra}
        <span className="swipe-item-arrow">›</span>
      </div>
    </div>
  );
}

// ---- 表示トグル（共通）----
function VisibilityToggle({ id, hiddenProducts, toggleVisibility }) {
  const hidden = !!hiddenProducts?.[id];
  return (
    <button type="button" className={`vis-toggle${hidden ? ' hidden' : ''}`}
      onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); toggleVisibility(id); }}
      onClick={(e)    => { e.stopPropagation(); toggleVisibility(id); }}
    >{hidden ? '非表示' : '表示中'}</button>
  );
}

// ---- オーダードリンク管理 ----
function OrderManager({ products, post, iconColors, saveIconColor, hiddenProducts, toggleVisibility, saveManageOrder }) {
  const orderProds = products.filter(p => p.type === 'order');
  const onOrderChange = useCallback(o => saveManageOrder?.('order', o), [saveManageOrder]);
  const [order, setOrder] = useSortList('manageOrderList', orderProds, onOrderChange);
  const [sortMode, setSortMode] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [showForm, setShowForm] = useState(false);

  const { dragIdx, gapIdx, ghostY, listRef, startDrag, startDragAt } = useDragSort(setOrder);
  const orderedItems = order.map(id => orderProds.find(p => p.id === id)).filter(Boolean);

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('削除しますか？')) return;
    await post('deleteProduct', { id });
  }, [post]);

  const handleLongPress = useCallback((idx, y) => {
    setSortMode(true);
    startDragAt(idx, y);
  }, [startDragAt]);

  return (
    <>
      <div className="section-header">
        <h2>オーダードリンク一覧</h2>
        <div className="section-header-actions">
          {sortMode
            ? <button className="btn btn-primary btn-sm" onClick={() => setSortMode(false)}>完了</button>
            : <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setShowForm(true); }}>＋ 追加</button>
          }
        </div>
      </div>

      {orderedItems.length === 0 && <div className="empty-state">オーダードリンクがありません。</div>}

      <div ref={listRef}>
        {orderedItems.map((p, idx) => {
          const color = iconColors?.[p.id] || '#54A0FF';
          const vis   = <VisibilityToggle id={p.id} hiddenProducts={hiddenProducts} toggleVisibility={toggleVisibility} />;
          if (sortMode) {
            return (
              <div key={p.id}>
                {dragIdx !== -1 && gapIdx === idx && <div className="sort-drop-line" />}
                <div className={`sort-row${dragIdx === idx ? ' sort-row-dragging' : ''}`}>
                  <div className="sort-row-grip" onTouchStart={e => startDrag(e, idx)} onMouseDown={e => startDrag(e, idx)}>⠿</div>
                  <span className="list-item-color-dot" style={{ background: color }} />
                  <div className="sort-row-name">{p.name}</div>
                  {vis}
                </div>
              </div>
            );
          }
          return (
            <InteractiveItem key={p.id} idx={idx}
              onEdit={() => { setEditing(p); setShowForm(true); }}
              onDelete={() => handleDelete(p.id)}
              onLongPress={handleLongPress}
              colorDot={color}
              extra={vis}
            >
              <div className="list-item-name">{p.name}</div>
            </InteractiveItem>
          );
        })}
        {sortMode && dragIdx !== -1 && gapIdx === orderedItems.length && <div className="sort-drop-line" />}
      </div>

      {sortMode && ghostY !== null && dragIdx >= 0 && orderedItems[dragIdx] && createPortal(
        <div className="sort-drag-ghost" style={{ top: ghostY }}>
          <span className="sort-row-grip">⠿</span>
          <span>{orderedItems[dragIdx].name}</span>
        </div>, document.body
      )}

      {showForm && (
        <OrderForm
          product={editing} post={post}
          iconColors={iconColors} saveIconColor={saveIconColor}
          hiddenProducts={hiddenProducts} toggleVisibility={toggleVisibility}
          onClose={() => setShowForm(false)}
        />
      )}
    </>
  );
}

function OrderForm({ product, post, iconColors, saveIconColor, hiddenProducts, toggleVisibility, onClose }) {
  const [name,  setName]  = useState(product?.name  || '');
  const [color, setColor] = useState(() => (product ? iconColors?.[product.id] : null) || ICON_COLORS[3]);

  const doSave = useCallback(() => {
    if (!name.trim()) return;
    if (product) saveIconColor(product.id, color);
    onClose();
    const payload = { name: name.trim(), type: 'order', categoryId: product?.categoryId || '', unit: product?.unit || '', volume: product?.volume || '', stock: product?.stock ?? 0, reorderPoint: product?.reorderPoint ?? 0 };
    if (product) {
      post('updateProduct', { id: product.id, ...payload }).catch(console.error);
    } else {
      post('addProduct', payload).then(res => {
        const newId = res?.id || res?.productId;
        if (newId) saveIconColor(newId, color);
      }).catch(console.error);
    }
  }, [name, color, product, post, saveIconColor, onClose]);

  return createPortal(
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="modal-title">{product ? 'オーダードリンクを編集' : 'オーダードリンクを追加'}</div>
        <div className="form">
          <div className="form-group">
            <label className="form-label">商品名 *</label>
            <input
              className="form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }}
              enterKeyHint="done"
            />
          </div>
          <div className="form-group">
            <label className="form-label">アイコンカラー</label>
            <div className="color-picker">
              {ICON_COLORS.map(c => (
                <button key={c} type="button"
                  className={`color-swatch${color === c ? ' selected' : ''}`}
                  style={{ background: c }}
                  onTouchEnd={(e) => { e.preventDefault(); setColor(c); }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
          {product && (
            <div className="form-group">
              <label className="form-label">カウント画面への表示</label>
              <VisibilityToggle id={product.id} hiddenProducts={hiddenProducts} toggleVisibility={toggleVisibility} />
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>キャンセル</button>
            <button type="button" className="btn btn-primary"
              onTouchEnd={(e) => { e.preventDefault(); doSave(); }}
              onClick={doSave}
            >保存</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ---- フリードリンク管理 ----
function FreeManager({ products, post, hiddenProducts, toggleVisibility, saveManageOrder }) {
  const freeProds = products.filter(p => p.type === 'free');
  const onOrderChange = useCallback(o => saveManageOrder?.('free', o), [saveManageOrder]);
  const [order, setOrder] = useSortList('manageFreeList', freeProds, onOrderChange);
  const [sortMode, setSortMode] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [showForm, setShowForm] = useState(false);

  const { dragIdx, gapIdx, ghostY, listRef, startDrag, startDragAt } = useDragSort(setOrder);
  const orderedItems = order.map(id => freeProds.find(p => p.id === id)).filter(Boolean);

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('削除しますか？')) return;
    await post('deleteProduct', { id });
  }, [post]);

  const handleLongPress = useCallback((idx, y) => {
    setSortMode(true);
    startDragAt(idx, y);
  }, [startDragAt]);

  return (
    <>
      <div className="section-header">
        <h2>フリードリンク一覧</h2>
        <div className="section-header-actions">
          {sortMode
            ? <button className="btn btn-primary btn-sm" onClick={() => setSortMode(false)}>完了</button>
            : <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setShowForm(true); }}>＋ 追加</button>
          }
        </div>
      </div>

      {orderedItems.length === 0 && <div className="empty-state">フリードリンクがありません。</div>}

      <div ref={listRef}>
        {orderedItems.map((p, idx) => {
          const vis = <VisibilityToggle id={p.id} hiddenProducts={hiddenProducts} toggleVisibility={toggleVisibility} />;
          if (sortMode) {
            return (
              <div key={p.id}>
                {dragIdx !== -1 && gapIdx === idx && <div className="sort-drop-line" />}
                <div className={`sort-row${dragIdx === idx ? ' sort-row-dragging' : ''}`}>
                  <div className="sort-row-grip" onTouchStart={e => startDrag(e, idx)} onMouseDown={e => startDrag(e, idx)}>⠿</div>
                  <div className="sort-row-name">
                    {p.name}
                    {(p.unit || p.volume) && <span className="sort-row-sub">{[p.unit && `${p.unit}g`, p.volume && `${p.volume}ml`].filter(Boolean).join(' / ')}</span>}
                  </div>
                  {vis}
                </div>
              </div>
            );
          }
          return (
            <InteractiveItem key={p.id} idx={idx}
              onEdit={() => { setEditing(p); setShowForm(true); }}
              onDelete={() => handleDelete(p.id)}
              onLongPress={handleLongPress}
              extra={vis}
            >
              <div className="list-item-info">
                <div className="list-item-name">{p.name}</div>
                {(p.unit || p.volume) && (
                  <div className="list-item-sub">
                    {p.unit ? `容器込み ${p.unit}g` : ''}{p.unit && p.volume ? ' ／ ' : ''}{p.volume ? `${p.volume}ml` : ''}
                  </div>
                )}
              </div>
            </InteractiveItem>
          );
        })}
        {sortMode && dragIdx !== -1 && gapIdx === orderedItems.length && <div className="sort-drop-line" />}
      </div>

      {sortMode && ghostY !== null && dragIdx >= 0 && orderedItems[dragIdx] && createPortal(
        <div className="sort-drag-ghost" style={{ top: ghostY }}>
          <span className="sort-row-grip">⠿</span>
          <span>{orderedItems[dragIdx].name}</span>
        </div>, document.body
      )}

      {showForm && (
        <FreeForm
          product={editing} post={post}
          hiddenProducts={hiddenProducts} toggleVisibility={toggleVisibility}
          onClose={() => setShowForm(false)}
        />
      )}
    </>
  );
}

function FreeForm({ product, post, hiddenProducts, toggleVisibility, onClose }) {
  const [form, setForm] = useState({
    name: product?.name || '', unit: product?.unit || '', volume: product?.volume || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const refs = useRef([]);
  const onKey = (e, idx) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = refs.current[idx + 1];
    if (next) next.focus({ preventScroll: true }); else e.target.blur();
  };

  const doSave = useCallback(() => {
    if (!form.name.trim()) return;
    onClose();
    const payload = { name: form.name.trim(), type: 'free', categoryId: product?.categoryId || '', unit: form.unit, volume: form.volume, stock: product?.stock ?? 0, reorderPoint: product?.reorderPoint ?? 0 };
    if (product) {
      post('updateProduct', { id: product.id, ...payload }).catch(console.error);
    } else {
      post('addProduct', payload).catch(console.error);
    }
  }, [form, product, post, onClose]);

  return createPortal(
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="modal-title">{product ? 'フリードリンクを編集' : 'フリードリンクを追加'}</div>
        <div className="form">
          <div className="form-group">
            <label className="form-label">商品名 *</label>
            <input ref={el => { refs.current[0] = el; }} className="form-input"
              value={form.name} onChange={e => set('name', e.target.value)}
              onKeyDown={e => onKey(e, 0)} enterKeyHint="next" required />
          </div>
          <div className="form-group">
            <label className="form-label">容器込みグラム</label>
            <input ref={el => { refs.current[1] = el; }} className="form-input"
              type="text" inputMode="tel"
              value={form.unit} onChange={e => set('unit', e.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={e => onKey(e, 1)} enterKeyHint="next" placeholder="例: 520" />
          </div>
          <div className="form-group">
            <label className="form-label">容量 (ml)</label>
            <input ref={el => { refs.current[2] = el; }} className="form-input"
              type="text" inputMode="tel"
              value={form.volume} onChange={e => set('volume', e.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={e => onKey(e, 2)} enterKeyHint="done" placeholder="例: 350" />
          </div>
          {product && (
            <div className="form-group">
              <label className="form-label">フリー画面への表示</label>
              <VisibilityToggle id={product.id} hiddenProducts={hiddenProducts} toggleVisibility={toggleVisibility} />
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>キャンセル</button>
            <button type="button" className="btn btn-primary"
              onTouchEnd={(e) => { e.preventDefault(); doSave(); }}
              onClick={doSave}
            >保存</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ---- カテゴリ管理 ----
function CategoryManager({ categories, post }) {
  const [name, setName]     = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try { await post('addCategory', { name: name.trim() }); setName(''); }
    finally { setSaving(false); }
  };

  return (
    <>
      <div className="card">
        <form className="form" onSubmit={handleAdd}>
          <div className="form-group">
            <label className="form-label">カテゴリ名</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }} placeholder="例：ビール" required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={!name.trim() || saving}>
            {saving ? '追加中...' : '追加'}
          </button>
        </form>
      </div>
      <div className="section-header"><h2>カテゴリ一覧</h2></div>
      {categories.length === 0 && <div className="empty-state">カテゴリがありません。</div>}
      {categories.map(cat => (
        <div key={cat.id} className="list-item">
          <div className="list-item-info"><div className="list-item-name">{cat.name}</div></div>
          <div className="list-item-actions">
            <button className="btn btn-danger btn-sm"
              onClick={() => window.confirm('このカテゴリを削除しますか？') && post('deleteCategory', { id: cat.id })}
            >削除</button>
          </div>
        </div>
      ))}
    </>
  );
}
