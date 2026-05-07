import { useState } from 'react';

export default function ReceivingScreen({ products, post }) {
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity]   = useState('');
  const [memo, setMemo]           = useState('');
  const [saving, setSaving]       = useState(false);
  const [done, setDone]           = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!productId || !quantity) return;
    setSaving(true);
    try {
      await post('addStockLog', { productId, type: '入荷', quantity: Number(quantity), memo });
      setProductId('');
      setQuantity('');
      setMemo('');
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="screen">
      <div className="screen-header">
        <h1>入荷記録</h1>
      </div>

      {done && <div className="success-banner">入荷を記録しました</div>}

      <div className="card">
        <form className="form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">商品</label>
            <select
              className="form-select"
              value={productId}
              onChange={e => setProductId(e.target.value)}
              required
            >
              <option value="">選択してください</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">入荷数</label>
            <input
              className="form-input"
              type="number"
              inputMode="numeric"
              min="1"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              placeholder="0"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">メモ（任意）</label>
            <input
              className="form-input"
              type="text"
              value={memo}
              onChange={e => setMemo(e.target.value)}
              placeholder="納品書No. など"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={!productId || !quantity || saving}
          >
            {saving ? '記録中...' : '入荷を記録'}
          </button>
        </form>
      </div>
    </div>
  );
}
