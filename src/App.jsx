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
  const [iconColors, setIconColors] = useState(() => {
    try { return JSON.parse(localStorage.getItem('iconColors') || '{}'); } catch { return {}; }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const ordersRef     = useRef({});
  const saveTimers    = useRef({});
  const pendingIds    = useRef(new Set());
  const saveVersions  = useRef({});
  const screenAreaRef = useRef(null);

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

  // Safari iOS keyboard viewport bug 対策
  useEffect(() => {
    const el = screenAreaRef.current;

    const onFocusOut = (e) => {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') return;
      // フォーカスが別の入力欄に移る場合はリセットしない
      const next = e.relatedTarget;
      if (next && (next.tagName === 'INPUT' || next.tagName === 'TEXTAREA')) return;
      window.scrollTo(0, 0);
      if (el) el.scrollTop = 0;
    };

    const onScroll = () => {
      if (!el) return;
      const max = el.scrollHeight - el.clientHeight;
      if (el.scrollTop > Math.max(0, max)) el.scrollTop = Math.max(0, max);
    };

    window.addEventListener('focusout', onFocusOut, true);
    el?.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('focusout', onFocusOut, true);
      el?.removeEventListener('scroll', onScroll);
    };
  }, []);

  useEffect(() => {
    const el = screenAreaRef.current;
    if (!el) return;
    if (tab !== 'count') return;
    const block = (e) => e.preventDefault();
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, [tab]);

  const post = useCallback(async (action, payload = {}) => {
    const result = await gasPost(action, payload);
    if (result.error) throw new Error(result.error);
    await fetchAll(true);
    return result;
  }, [fetchAll]);

  const savePositions = useCallback(async (positions) => {
    await gasPost('savePositions', { positions });
  }, []);

  const saveIconColor = useCallback((productId, color) => {
    setIconColors(prev => {
      const next = { ...prev, [productId]: color };
      localStorage.setItem('iconColors', JSON.stringify(next));
      return next;
    });
  }, []);

  const updateOrderCount = useCallback((productId, delta) => {
    const current = ordersRef.current[productId] ?? 0;
    const next = Math.max(0, current + delta);
    ordersRef.current = { ...ordersRef.current, [productId]: next };
    setTodayOrders({ ...ordersRef.current });

    pendingIds.current.add(productId);
    const version = (saveVersions.current[productId] || 0) + 1;
    saveVersions.current[productId] = version;
    clearTimeout(saveTimers.current[productId]);
    saveTimers.current[productId] = setTimeout(async () => {
      const count = ordersRef.current[productId] ?? 0;
      try {
        await gasPost('updateOrderCount', { productId, count });
      } finally {
        // タイマー待機中に新たなタップがあった場合はpendingを維持
        if (saveVersions.current[productId] === version) {
          pendingIds.current.delete(productId);
        }
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

  const screenProps = { categories, products, todayOrders, todayFree, iconPositions, iconColors, post, savePositions, saveIconColor, updateOrderCount, refresh: fetchAll };

  return (
    <div className="app">
      {error && <div className="error-banner">{error}</div>}
      <div className={`screen-area ${tab === 'count' ? 'no-scroll' : ''}`} ref={screenAreaRef}>
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
