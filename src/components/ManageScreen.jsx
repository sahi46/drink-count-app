import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

const ICON_COLORS = [
  '#FF6B6B', '#FF9F43', '#FECA57', '#54A0FF',
  '#5F27CD', '#00D2D3', '#1DD1A1', '#FF9FF3',
  '#48DBFB', '#C8D6E5', '#FF6348', '#2ED573',
  '#A29BFE', '#FD79A8', '#FDCB6E', '#6C5CE7',
];

export default function ManageScreen({ categories, products, post }) {
  const [subTab, setSubTab] = useState('order');

  return (
    <div className="screen">
      <div className="screen-header">
        <h1>管理</h1>
      </div>

      <div className="sub-tabs">
        {[['order', 'オーダー'], ['free', 'フリー'], ['categories', 'カテゴリ']].map(([id, label]) => (
          <button
            key={id}
            className={`sub-tab${subTab === id ? ' active' : ''}`}
            onClick={() => setSubTab(id)}
          >{label}</button>
        ))}
      </div>

      {subTab === 'order'      && <OrderManager      products={products} post={post} />}
      {subTab === 'free'       && <FreeManager       products={products} post={post} />}
      {subTab === 'categories' && <CategoryManager   categories={categories} post={post} />}
    </div>
  );
}

// ---- スワイプ削除対応リストアイテム ----

function SwipeItem({ onEdit, onDelete, children, colorDot }) {
  const [offset, setOffset] = useState(0);
  const startX = useRef(null);
  const THRESHOLD = 60;

  const onTouchStart = (e) => { startX.current = e.touches[0].clientX; };
  const onTouchMove  = (e) => {
    if (startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    if (dx < 0) setOffset(Math.max(dx, -THRESHOLD));
  };
  const onTouchEnd = () => {
    if (offset < -THRESHOLD / 2) setOffset(-THRESHOLD);
    else setOffset(0);
    startX.current = null;
  };

  const close = () => setOffset(0);

  return (
    <div className="swipe-item-wrap" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div className="swipe-item-delete-bg">
        <button className="swipe-delete-btn" onTouchEnd={(e) => { e.stopPropagation(); close(); onDelete(); }}>削除</button>
      </div>
      <div
        className="swipe-item-content"
        style={{ transform: `translateX(${offset}px)` }}
        onClick={() => { if (offset < -10) { close(); return; } onEdit(); }}
      >
        {colorDot && <span className="list-item-color-dot" style={{ background: colorDot }} />}
        {children}
      </div>
    </div>
  );
}

// ---- オーダードリンク管理 ----

function OrderManager({ products, post }) {
  const orderProds = products.filter(p => p.type === 'order');
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('削除しますか？')) return;
    await post('deleteProduct', { id });
  }, [post]);

  return (
    <>
      <div className="section-header">
        <h2>オーダードリンク一覧</h2>
        <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setShowForm(true); }}>
          ＋ 追加
        </button>
      </div>

      {orderProds.length === 0 && <div className="empty-state">オーダードリンクがありません。</div>}

      {orderProds.map(p => (
        <SwipeItem
          key={p.id}
          colorDot={p.color || '#54A0FF'}
          onEdit={() => { setEditing(p); setShowForm(true); }}
          onDelete={() => handleDelete(p.id)}
        >
          <div className="list-item-info">
            <div className="list-item-name">{p.name}</div>
          </div>
        </SwipeItem>
      ))}

      {showForm && (
        <OrderForm product={editing} post={post} onClose={() => setShowForm(false)} />
      )}
    </>
  );
}

function OrderForm({ product, post, onClose }) {
  const [name,  setName]  = useState(product?.name  || '');
  const [color, setColor] = useState(product?.color || ICON_COLORS[3]);
  const nameRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      active.blur();
      // blurの後に少し待ってから保存（iOS keyboardが閉じる前にsubmitがキャンセルされるのを防ぐ）
      setTimeout(() => doSave(), 50);
    } else {
      doSave();
    }
  };

  const doSave = () => {
    if (!name.trim()) return;
    onClose();
    const payload = { name: name.trim(), type: 'order', color, categoryId: product?.categoryId || '', unit: product?.unit || '', volume: product?.volume || '', stock: product?.stock ?? 0, reorderPoint: product?.reorderPoint ?? 0 };
    if (product) {
      post('updateProduct', { id: product.id, ...payload }).catch(console.error);
    } else {
      post('addProduct', payload).catch(console.error);
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="modal-title">{product ? 'オーダードリンクを編集' : 'オーダードリンクを追加'}</div>
        <form className="form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">商品名 *</label>
            <input
              ref={nameRef}
              className="form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }}
              enterKeyHint="done"
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">アイコンカラー</label>
            <div className="color-picker">
              {ICON_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`color-swatch${color === c ? ' selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>キャンセル</button>
            <button type="submit" className="btn btn-primary">保存</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ---- フリードリンク管理 ----

function FreeManager({ products, post }) {
  const freeProds = products.filter(p => p.type === 'free');
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('削除しますか？')) return;
    await post('deleteProduct', { id });
  }, [post]);

  return (
    <>
      <div className="section-header">
        <h2>フリードリンク一覧</h2>
        <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setShowForm(true); }}>
          ＋ 追加
        </button>
      </div>

      {freeProds.length === 0 && <div className="empty-state">フリードリンクがありません。</div>}

      {freeProds.map(p => (
        <SwipeItem
          key={p.id}
          onEdit={() => { setEditing(p); setShowForm(true); }}
          onDelete={() => handleDelete(p.id)}
        >
          <div className="list-item-info">
            <div className="list-item-name">{p.name}</div>
            <div className="list-item-sub">
              {p.unit ? `容器込み ${p.unit}g` : ''}
              {p.unit && p.volume ? ' ／ ' : ''}
              {p.volume ? `${p.volume}ml` : ''}
            </div>
          </div>
        </SwipeItem>
      ))}

      {showForm && (
        <FreeForm product={editing} post={post} onClose={() => setShowForm(false)} />
      )}
    </>
  );
}

function FreeForm({ product, post, onClose }) {
  const [form, setForm] = useState({
    name:   product?.name   || '',
    unit:   product?.unit   || '',
    volume: product?.volume || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const refs = useRef([]);
  const onKey = (e, idx) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = refs.current[idx + 1];
    if (next) next.focus({ preventScroll: true });
    else e.target.blur();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      active.blur();
      setTimeout(() => doSave(), 50);
    } else {
      doSave();
    }
  };

  const doSave = () => {
    if (!form.name.trim()) return;
    onClose();
    const payload = { name: form.name.trim(), type: 'free', categoryId: product?.categoryId || '', unit: form.unit, volume: form.volume, stock: product?.stock ?? 0, reorderPoint: product?.reorderPoint ?? 0 };
    if (product) {
      post('updateProduct', { id: product.id, ...payload }).catch(console.error);
    } else {
      post('addProduct', payload).catch(console.error);
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="modal-title">{product ? 'フリードリンクを編集' : 'フリードリンクを追加'}</div>
        <form className="form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">商品名 *</label>
            <input
              ref={el => { refs.current[0] = el; }}
              className="form-input"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              onKeyDown={e => onKey(e, 0)}
              enterKeyHint="next"
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">容器込みグラム</label>
            <input
              ref={el => { refs.current[1] = el; }}
              className="form-input"
              type="text"
              inputMode="tel"
              value={form.unit}
              onChange={e => set('unit', e.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={e => onKey(e, 1)}
              enterKeyHint="next"
              placeholder="例: 520"
            />
          </div>
          <div className="form-group">
            <label className="form-label">容量 (ml)</label>
            <input
              ref={el => { refs.current[2] = el; }}
              className="form-input"
              type="text"
              inputMode="tel"
              value={form.volume}
              onChange={e => set('volume', e.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={e => onKey(e, 2)}
              enterKeyHint="done"
              placeholder="例: 350"
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>キャンセル</button>
            <button type="submit" className="btn btn-primary">保存</button>
          </div>
        </form>
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
    try {
      await post('addCategory', { name: name.trim() });
      setName('');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('このカテゴリを削除しますか？')) return;
    await post('deleteCategory', { id });
  };

  return (
    <>
      <div className="card">
        <form className="form" onSubmit={handleAdd}>
          <div className="form-group">
            <label className="form-label">カテゴリ名</label>
            <input
              className="form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
              placeholder="例：ビール"
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={!name.trim() || saving}>
            {saving ? '追加中...' : '追加'}
          </button>
        </form>
      </div>

      <div className="section-header">
        <h2>カテゴリ一覧</h2>
      </div>

      {categories.length === 0 && <div className="empty-state">カテゴリがありません。</div>}

      {categories.map(cat => (
        <div key={cat.id} className="list-item">
          <div className="list-item-info">
            <div className="list-item-name">{cat.name}</div>
          </div>
          <div className="list-item-actions">
            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(cat.id)}>削除</button>
          </div>
        </div>
      ))}
    </>
  );
}
