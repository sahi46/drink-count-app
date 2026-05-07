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

export default function StockScreen({ categories, products }) {
  const lowStock = products.filter(p => p.reorderPoint > 0 && p.stock <= p.reorderPoint);
  const groups   = groupByCategory(products, categories);

  return (
    <div className="screen">
      <div className="screen-header">
        <h1>在庫状況</h1>
      </div>

      {lowStock.length > 0 && (
        <div className="stock-warning-banner">
          ⚠ {lowStock.length}品目が発注点を下回っています
        </div>
      )}

      {products.length === 0 ? (
        <div className="empty-state">商品がありません。</div>
      ) : (
        groups.map(({ label, prods }) => (
          <div key={label} className="category-section">
            <div className="category-title">{label}</div>
            {prods.map(p => {
              const isLow = p.reorderPoint > 0 && p.stock <= p.reorderPoint;
              return (
                <div key={p.id} className={`stock-item ${isLow ? 'low' : ''}`}>
                  <div>
                    <div className="stock-name">{p.name}</div>
                    <div className="stock-detail">
                      {[p.volume && `${p.volume}${p.unit}`, p.reorderPoint > 0 && `発注点 ${p.reorderPoint}`]
                        .filter(Boolean).join(' ／ ')}
                    </div>
                  </div>
                  <div className="stock-right">
                    <div className={`stock-count ${isLow ? 'low' : ''}`}>{p.stock}</div>
                    <div className="stock-unit">{p.unit}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
