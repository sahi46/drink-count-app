import { useState } from 'react';

function groupByCategory(products, categories) {
  const groups = [];
  const used = new Set();
  categories.forEach(cat => {
    const prods = products.filter(p => p.categoryId === cat.id);
    if (prods.length > 0) {
      groups.push({ label: cat.name, prods });
      prods.forEach(p => used.add(p.id));
    }
  });
  const rest = products.filter(p => !used.has(p.id));
  if (rest.length > 0) groups.push({ label: 'その他', prods: rest });
  return groups;
}

export default function FreeScreen({ categories, products, todayFree, post }) {
  const freeProducts = products.filter(p => p.type === 'free');

  // 初期値をスプシのデータで埋める（画面を開くたびにリセット）
  const [values, setValues] = useState(() => {
    const init = {};
    freeProducts.forEach(p => {
      init[p.id] = {
        supplement: todayFree[p.id]?.supplement != null ? String(todayFree[p.id].supplement) : '',
        remaining:  todayFree[p.id]?.remaining  != null ? String(todayFree[p.id].remaining)  : '',
      };
    });
    return init;
  });

  const [saving, setSaving] = useState({});

  const setVal = (id, field, val) =>
    setValues(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }));

  const calcConsumption = (id) => {
    const v = values[id] || {};
    if (v.supplement !== '' && v.remaining !== '') {
      return Math.max(0, Number(v.supplement) - Number(v.remaining));
    }
    return null;
  };

  const handleSave = async (productId) => {
    const v = values[productId] || {};
    if (v.supplement === '') return;
    setSaving(s => ({ ...s, [productId]: true }));
    try {
      await post('saveFreeRecord', {
        productId,
        supplement: Number(v.supplement),
        remaining:  v.remaining !== '' ? Number(v.remaining) : null,
      });
    } finally {
      setSaving(s => ({ ...s, [productId]: false }));
    }
  };

  const groups = groupByCategory(freeProducts, categories);
  const today  = new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' });

  return (
    <div className="screen">
      <div className="screen-header">
        <h1>フリードリンク</h1>
        <span className="screen-date">{today}</span>
      </div>

      {freeProducts.length === 0 ? (
        <div className="empty-state">
          フリードリンクがありません。<br />
          管理画面で商品を追加してください。
        </div>
      ) : (
        groups.map(({ label, prods }) => (
          <div key={label} className="category-section">
            <div className="category-title">{label}</div>
            {prods.map(p => {
              const v = values[p.id] || { supplement: '', remaining: '' };
              const consumption = calcConsumption(p.id);
              return (
                <div key={p.id} className="free-product-card">
                  <div className="free-product-name">{p.name}</div>
                  <div className="free-inputs">
                    <div className="free-input-group">
                      <label className="free-input-label">補充数（営業前）</label>
                      <input
                        className="free-input"
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={v.supplement}
                        onChange={e => setVal(p.id, 'supplement', e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="free-input-group">
                      <label className="free-input-label">残数（営業後）</label>
                      <input
                        className="free-input"
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={v.remaining}
                        onChange={e => setVal(p.id, 'remaining', e.target.value)}
                        placeholder="未入力"
                      />
                    </div>
                  </div>
                  {consumption !== null && (
                    <div className="free-consumption">
                      消費数：{consumption} {p.unit}
                    </div>
                  )}
                  <button
                    className="free-save-btn"
                    onClick={() => handleSave(p.id)}
                    disabled={v.supplement === '' || saving[p.id]}
                  >
                    {saving[p.id] ? '保存中...' : '保存'}
                  </button>
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
