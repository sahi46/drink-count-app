import { useState } from 'react';

export default function ManageScreen({ categories, products, post }) {
  const [subTab, setSubTab] = useState('products');

  return (
    <div className="screen">
      <div className="screen-header">
        <h1>管理</h1>
      </div>

      <div className="sub-tabs">
        <button
          className={`sub-tab ${subTab === 'products' ? 'active' : ''}`}
          onClick={() => setSubTab('products')}
        >商品管理</button>
        <button
          className={`sub-tab ${subTab === 'categories' ? 'active' : ''}`}
          onClick={() => setSubTab('categories')}
        >カテゴリ管理</button>
      </div>

      {subTab === 'products'   && <ProductManager   categories={categories} products={products} post={post} />}
      {subTab === 'categories' && <CategoryManager  categories={categories} post={post} />}
    </div>
  );
}

// ---- 商品管理 ----

function ProductManager({ categories, products, post }) {
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const handleDelete = async (id) => {
    if (!window.confirm('この商品を削除しますか？')) return;
    await post('deleteProduct', { id });
  };

  return (
    <>
      <div className="section-header">
        <h2>商品一覧</h2>
        <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setShowForm(true); }}>
          ＋ 追加
        </button>
      </div>

      {products.length === 0 && <div className="empty-state">商品がありません。</div>}

      {products.map(p => {
        const cat = categories.find(c => c.id === p.categoryId);
        return (
          <div key={p.id} className="list-item">
            <div className="list-item-info">
              <div className="list-item-name">
                {p.name}
                <span className={`badge ${p.type === 'order' ? 'badge-order' : 'badge-free'}`}>
                  {p.type === 'order' ? 'オーダー' : 'フリー'}
                </span>
              </div>
              <div className="list-item-sub">
                {cat?.name || '未分類'}{p.volume || p.unit ? ` ／ ${p.volume}${p.unit}` : ''}
              </div>
            </div>
            <div className="list-item-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(p); setShowForm(true); }}>
                編集
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>
                削除
              </button>
            </div>
          </div>
        );
      })}

      {showForm && (
        <ProductForm
          categories={categories}
          product={editing}
          post={post}
          onClose={() => setShowForm(false)}
        />
      )}
    </>
  );
}

function ProductForm({ categories, product, post, onClose }) {
  const [form, setForm] = useState({
    name:         product?.name         || '',
    type:         product?.type         || 'order',
    categoryId:   product?.categoryId   || '',
    unit:         product?.unit         || '',
    volume:       product?.volume       || '',
    stock:        product?.stock        ?? 0,
    reorderPoint: product?.reorderPoint ?? 0,
  });
  const [saving, setSaving] = useState(false);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (product) {
        await post('updateProduct', { id: product.id, ...form });
      } else {
        await post('addProduct', form);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="modal-title">{product ? '商品を編集' : '商品を追加'}</div>
        <form className="form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">商品名 *</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} required />
          </div>

          <div className="form-group">
            <label className="form-label">タイプ</label>
            <select className="form-select" value={form.type} onChange={e => set('type', e.target.value)}>
              <option value="order">オーダー</option>
              <option value="free">フリー</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">カテゴリ</label>
            <select className="form-select" value={form.categoryId} onChange={e => set('categoryId', e.target.value)}>
              <option value="">未分類</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">容量</label>
              <input className="form-input" value={form.volume} onChange={e => set('volume', e.target.value)} placeholder="350" />
            </div>
            <div className="form-group">
              <label className="form-label">単位</label>
              <input className="form-input" value={form.unit} onChange={e => set('unit', e.target.value)} placeholder="ml" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">在庫数</label>
              <input className="form-input" type="number" min="0" inputMode="numeric"
                value={form.stock} onChange={e => set('stock', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">発注点</label>
              <input className="form-input" type="number" min="0" inputMode="numeric"
                value={form.reorderPoint} onChange={e => set('reorderPoint', e.target.value)} />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>キャンセル</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- カテゴリ管理 ----

function CategoryManager({ categories, post }) {
  const [name, setName]   = useState('');
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
