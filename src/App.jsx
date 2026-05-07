import { useState, useEffect, useCallback, useRef } from 'react';
import NavBar from './components/NavBar';
import CountScreen from './components/CountScreen';
import FreeScreen from './components/FreeScreen';
import StockScreen from './components/StockScreen';
import ReceivingScreen from './components/ReceivingScreen';
import ManageScreen from './components/ManageScreen';
import { gasGet, gasPost } from './api';

const POLL_MS = 10000;

export default function App() {
  const [tab, setTab] = useState('count');
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [todayOrders, setTodayOrders] = useState({});
  const [todayFree, setTodayFree] = useState({});
  const [iconPositions, setIconPositions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const ordersRef     = useRef({});  // 常に最新のカウント値
  const saveTimers    = useRef({});  // デバウンスタイマー
  const pendingIds    = useRef(new Set()); // 保存待ち中の商品ID

  const fetchAll = useCallback(async (silent = false) => {
    try {
      const d = await gasGet();
      setCategories(d.categories || []);
      setProducts(d.products || []);

      const serverOrders = d.todayOrders || {};
      // 保存待ち中の商品はサーバー値で上書きしない
      const merged = { ...serverOrders };
      pendingIds.current.forEach(id => {
        merged[id] = ordersRef.current[id] ?? 0;
      });
      ordersRef.current = merged;
      setTodayOrders({ ...merged });

      setTodayFree(d.todayFree || {});
      if (d.iconPositions !== undefined) setIconPositions(d.iconPositions);
      setError(null);
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(() => fetchAll(true), POLL_MS);
    return () => clearInterval(id);
  }, [fetchAll]);

  const post = useCallback(async (action, payload = {}) => {
    const result = await gasPost(action, payload);
    if (result.error) throw new Error(result.error);
    await fetchAll(true);
    return result;
  }, [fetchAll]);

  const updateOrderCount = useCallback((productId, delta) => {
    const current = ordersRef.current[productId] ?? 0;
    const next = Math.max(0, current + delta);
    ordersRef.current = { ...ordersRef.current, [productId]: next };
    setTodayOrders({ ...ordersRef.current });

    // デバウンス：連打が止まって500ms後に最終値を一度だけ送信
    pendingIds.current.add(productId);
    clearTimeout(saveTimers.current[productId]);
    saveTimers.current[productId] = setTimeout(async () => {
      const count = ordersRef.current[productId] ?? 0;
      try {
        await gasPost('updateOrderCount', { productId, count });
      } finally {
        pendingIds.current.delete(productId);
      }
    }, 500);
  }, []);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-text">読み込み中...</div>
      </div>
    );
  }

  const screenProps = { categories, products, todayOrders, todayFree, iconPositions, post, updateOrderCount, refresh: fetchAll };

  return (
    <div className="app">
      {error && <div className="error-banner">{error}</div>}
      <div className="screen-area">
        {tab === 'count'     && <CountScreen {...screenProps} />}
        {tab === 'free'      && <FreeScreen {...screenProps} />}
        {tab === 'stock'     && <StockScreen {...screenProps} />}
        {tab === 'receiving' && <ReceivingScreen {...screenProps} />}
        {tab === 'manage'    && <ManageScreen {...screenProps} />}
      </div>
      <NavBar current={tab} onChange={setTab} />
    </div>
  );
}
