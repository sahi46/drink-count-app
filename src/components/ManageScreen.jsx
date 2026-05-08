import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

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

// ---- 共通：削除ハンドラ ----

function useDelete(post) {
  return async (id) => {
    if (!window.confirm('削除しますか？')) return;
    await post('deleteProduct', { id });
  };
}

// ---- オーダードリンク管理 ----

function OrderManager({ products, post }) {
  const orderProds = products.filter(p => p.type === 'order');
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const handleDelete = useDelete(post);

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
        <div key={p.id} className="list-item">
          <div className="list-item-info">
            <div className="list-item-name">{p.name}</div>
          </div>
          <div className="list-item-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(p); setShowForm(true); }}>編集</button>
            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>削除</button>
          </div>
        </div>
      ))}

      {showForm && (
        <OrderForm product={editing} post={post} onClose={() => setShowForm(false)} />
      )}
    </>
  );
}

function OrderForm({ product, post, onClose }) {
  const [name, setName] = useState(product?.name || '');
  const nameRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    document.activeElement?.blur();
    onClose();
    const payload = { name, type: 'order', categoryId: product?.categoryId || '', unit: product?.unit || '', volume: product?.volume || '', stock: product?.stock ?? 0, reorderPoint: product?.reorderPoint ?? 0 };
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
  const handleDelete = useDelete(post);

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
        <div key={p.id} className="list-item">
          <div className="list-item-info">
            <div className="list-item-name">{p.name}</div>
            <div className="list-item-sub">
              {p.unit ? `容器込み ${p.unit}g` : ''}
              {p.unit && p.volume ? ' ／ ' : ''}
              {p.volume ? `${p.volume}ml` : ''}
            </div>
          </div>
          <div className="list-item-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(p); setShowForm(true); }}>編集</button>
            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>削除</button>
          </div>
        </div>
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
    unit:   product?.unit   || '',   // 容器込みグラム
    volume: product?.volume || '',   // 容量ml
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
    document.activeElement?.blur();
    onClose();
    const payload = { name: form.name, type: 'free', categoryId: product?.categoryId || '', unit: form.unit, volume: form.volume, stock: product?.stock ?? 0, reorderPoint: product?.reorderPoint ?? 0 };
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
