import { useState, useRef, useCallback, useEffect } from 'react';
import { gasPost } from '../api';

// フリードリンク画面。営業前・営業後の在庫数（個数・ml）を記録し、出庫量を算出する。
// 表示順はドラッグで並び替え可能。並び替えはこの画面内の state のみで管理（GAS 非保存）。
export default function FreeScreen({ products, todayFree, hiddenProducts }) {
  // 非表示設定の商品はフリー画面に出さない
  const freeProds = products.filter(p => p.type === 'free' && !hiddenProducts?.[p.id]);
  const prodIds   = freeProds.map(p => p.id).join(',');

  // 現在表示中のサブタブ（営業前 / 営業後 / 集計）
  const [subTab, setSubTab] = useState('before');
  // 表示順（商品 ID の配列）。ドラッグで並べ替えるが GAS には保存しない
  const [order,  setOrder]  = useState(() => freeProds.map(p => p.id));

  // 商品が追加・削除されたとき、order リストを同期する。
  // 削除された ID は除去し、新規 ID は末尾に追加。
  useEffect(() => {
    setOrder(prev => {
      const validIds = new Set(freeProds.map(p => p.id));
      const kept  = prev.filter(id => validIds.has(id));
      const added = freeProds.filter(p => !kept.includes(p.id)).map(p => p.id);
      return [...kept, ...added];
    });
  }, [prodIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // GAS から取得した todayFree を前後データの初期値に変換する。
  // todayFree 構造: { [productId]: { beforeCount, beforeMl, afterCount, afterMl } }
  // UI 上は文字列で管理し、空欄は '' として扱う（null と 0 を区別するため）。
  const makeInit = (type) => {
    const d = {};
    freeProds.forEach(p => {
      d[p.id] = {
        count: todayFree[p.id]?.[`${type}Count`] != null ? String(todayFree[p.id][`${type}Count`]) : '',
        ml:    todayFree[p.id]?.[`${type}Ml`]    != null ? String(todayFree[p.id][`${type}Ml`])    : '',
      };
    });
    return d;
  };

  // 営業前・営業後それぞれの入力値 { [productId]: { count, ml } }
  const [beforeData, setBeforeData] = useState(() => makeInit('before'));
  const [afterData,  setAfterData]  = useState(() => makeInit('after'));
  // デバウンス用タイマー。キーごとに `${productId}_${type}` をキーとして管理
  const saveTimers = useRef({});

  // 入力変更後 800ms 待ってから GAS に保存する（連打中は毎回リセット）。
  // count / ml が空欄のときは null を送り「未入力」として記録する。
  const scheduleSave = useCallback((productId, type, count, ml) => {
    const key = `${productId}_${type}`;
    clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(() => {
      gasPost('saveFreeData', {
        productId, type,
        count: count !== '' ? Number(count) : null,
        ml:    ml    !== '' ? Number(ml)    : null,
      }).catch(() => {});
    }, 800);
  }, []);

  // フィールド変更ハンドラ。state を更新してから保存をスケジュールする。
  const setField = useCallback((type, productId, field, value) => {
    const setter = type === 'before' ? setBeforeData : setAfterData;
    setter(prev => {
      const next = { ...prev, [productId]: { ...prev[productId], [field]: value } };
      scheduleSave(productId, type, next[productId].count, next[productId].ml);
      return next;
    });
  }, [scheduleSave]);

  // Enter キーでのカーソル移動。PC・iOS キーボードどちらでも使いやすくするため
  // 「全商品の個数列 → 全商品のml列」という列優先順で進む（行優先は直感に反する）。
  const countRefs = useRef([]);
  const mlRefs    = useRef([]);
  const handleCountKey = (e, idx) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = countRefs.current[idx + 1];
    if (next) next.focus();              // 次の商品の個数へ
    else if (mlRefs.current[0]) mlRefs.current[0].focus(); // ml 列の先頭へ
    else e.target.blur();
  };
  const handleMlKey = (e, idx) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = mlRefs.current[idx + 1];
    if (next) next.focus();   // 次の商品の ml へ
    else e.target.blur();     // 最後の行は blur でキーボードを閉じる
  };

  // ---- ドラッグ並べ替え（グリップをタッチ／クリックして即ドラッグ開始）----
  // dragIdx: 現在ドラッグ中の行インデックス（-1 = 非ドラッグ）
  // gapIdx:  挿入位置を示すギャップインデックス（行数 +1 個のギャップが存在する）
  // ghostY:  ゴースト要素の Y 座標（fixed 配置）
  const [dragIdx, setDragIdx] = useState(-1);
  const [gapIdx,  setGapIdx]  = useState(-1);
  const [ghostY,  setGhostY]  = useState(null);
  // コミット時のクロージャ汚染を防ぐため、最新のギャップを ref でも保持
  const gapRef    = useRef(-1);
  const dragState = useRef(null); // { from: number } — ドラッグ元行インデックス
  const listRef   = useRef(null);

  // 各行の境界から n+1 個のギャップ座標を計算し、タッチ Y に最も近いギャップを返す。
  // ギャップ 0 = 先頭行の上、ギャップ n = 末尾行の下。
  const nearestGap = useCallback((cy) => {
    if (!listRef.current) return 0;
    const rows = [...listRef.current.querySelectorAll('.free-row')];
    if (rows.length === 0) return 0;
    const gaps = [rows[0].getBoundingClientRect().top];
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i].getBoundingClientRect().bottom;
      const b = rows[i + 1].getBoundingClientRect().top;
      gaps.push((a + b) / 2); // 行間の中点
    }
    gaps.push(rows[rows.length - 1].getBoundingClientRect().bottom);
    let best = 0, minD = Infinity;
    gaps.forEach((y, i) => {
      const d = Math.abs(cy - y);
      if (d < minD) { minD = d; best = i; }
    });
    return best;
  }, []);

  // タッチ移動中にゴーストとギャップを更新する
  const moveDrag = useCallback((cy) => {
    if (!dragState.current) return;
    setGhostY(cy);
    const gap = nearestGap(cy);
    gapRef.current = gap;
    setGapIdx(gap);
  }, [nearestGap]);

  // ドロップ確定：from 行をギャップ位置に挿入する。
  // gap > from の場合は splice 後にインデックスが 1 ずれるため insertAt = gap - 1。
  const commitDrag = useCallback(() => {
    const d = dragState.current;
    if (!d) return;
    const gap = gapRef.current;
    if (gap !== -1 && gap !== d.from && gap !== d.from + 1) {
      setOrder(prev => {
        const next = [...prev];
        const [item] = next.splice(d.from, 1);
        const insertAt = gap > d.from ? gap - 1 : gap;
        next.splice(insertAt, 0, item);
        return next;
      });
    }
    dragState.current = null;
    setGhostY(null);
    setDragIdx(-1);
    gapRef.current = -1;
    setGapIdx(-1);
  }, []);

  // ドラッグ中のみ document レベルでイベントを監視する。
  // passive: false で touchmove の preventDefault() を有効にし、スクロールを防止。
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

  // グリップ要素のタッチ／マウスダウンでドラッグを即開始する
  const startDrag = (e, idx) => {
    e.preventDefault();
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    dragState.current = { from: idx };
    gapRef.current = -1;
    setDragIdx(idx);
    setGhostY(cy);
    setGapIdx(-1);
  };

  // order 配列に従って商品を並べ直す（削除済み商品は filter で除く）
  const orderedProds = order.map(id => freeProds.find(p => p.id === id)).filter(Boolean);
  const today = new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' });

  // 営業前・営業後共通のリスト描画。
  // ドラッグ中はギャップ位置に挿入ラインを表示し、ドラッグ行を薄くする。
  const renderList = (type) => {
    const data = type === 'before' ? beforeData : afterData;
    return (
      <div ref={listRef}>
        {orderedProds.map((p, idx) => {
          const isLastProd = idx === orderedProds.length - 1;
          return (
            <div key={p.id}>
              {/* ギャップがこの行の上に来るとき挿入ラインを描画 */}
              {dragIdx !== -1 && gapIdx === idx && <div className="free-drop-line" />}
              <div className={`free-row${dragIdx === idx ? ' free-row-dragging' : ''}`}>
                {/* グリップ：タッチ／クリックで即ドラッグ開始 */}
                <div
                  className="free-row-grip"
                  onTouchStart={(e) => startDrag(e, idx)}
                  onMouseDown={(e) => startDrag(e, idx)}
                >⠿</div>
                <div className="free-row-name">{p.name}</div>
                <div className="free-row-inputs">
                  <div className="free-row-field">
                    <input
                      ref={el => { countRefs.current[idx] = el; }}
                      className="free-row-input"
                      type="text"
                      inputMode="tel"       // iOS で数字キーボードを表示
                      enterKeyHint="next"   // Enter キーのラベルを「次へ」に
                      tabIndex={idx + 1}
                      value={(data[p.id] || {}).count || ''}
                      onChange={e => setField(type, p.id, 'count', e.target.value.replace(/[^0-9]/g, ''))}
                      onKeyDown={e => handleCountKey(e, idx)}
                      placeholder="0"
                    />
                    <span className="free-row-unit">個</span>
                  </div>
                  <div className="free-row-field">
                    <input
                      ref={el => { mlRefs.current[idx] = el; }}
                      className="free-row-input"
                      type="text"
                      inputMode="tel"
                      enterKeyHint={isLastProd ? 'done' : 'next'}
                      tabIndex={orderedProds.length + idx + 1}
                      value={(data[p.id] || {}).ml || ''}
                      onChange={e => setField(type, p.id, 'ml', e.target.value.replace(/[^0-9]/g, ''))}
                      onKeyDown={e => handleMlKey(e, idx)}
                      placeholder="0"
                    />
                    <span className="free-row-unit">ml</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {/* 末尾ギャップ（全行の下）への挿入ライン */}
        {dragIdx !== -1 && gapIdx === orderedProds.length && <div className="free-drop-line" />}

        {/* ドラッグゴースト：fixed 配置で指に追従 */}
        {ghostY !== null && dragIdx >= 0 && orderedProds[dragIdx] && (
          <div className="free-drag-ghost" style={{ top: ghostY }}>
            <span className="free-row-grip">⠿</span>
            <span className="free-row-name">{orderedProds[dragIdx].name}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="screen">
      <div className="screen-header">
        <h1>フリードリンク</h1>
        <span className="screen-date">{today}</span>
      </div>

      <div className="sub-tabs">
        {[['before', '営業前'], ['after', '営業後'], ['summary', '集計']].map(([id, label]) => (
          <button
            key={id}
            className={`sub-tab${subTab === id ? ' active' : ''}`}
            onClick={() => setSubTab(id)}
          >{label}</button>
        ))}
      </div>

      {freeProds.length === 0 ? (
        <div className="empty-state">
          フリードリンクがありません。<br />管理画面で商品を追加してください。
        </div>
      ) : subTab === 'before' ? renderList('before')
        : subTab === 'after'  ? renderList('after')
        : (
          // 集計タブ：営業前 − 営業後 = 出庫量を計算して表示
          // 片方でも未入力の場合は '—' を表示して誤解を防ぐ
          <div className="free-summary">
            <div className="free-summary-header">
              <span>商品</span>
              <span>営業前</span>
              <span>営業後</span>
              <span>出庫</span>
            </div>
            {orderedProds.map(p => {
              const b  = beforeData[p.id] || {};
              const a  = afterData[p.id]  || {};
              const bc = b.count !== '' ? Number(b.count) : null;
              const bm = b.ml    !== '' ? Number(b.ml)    : null;
              const ac = a.count !== '' ? Number(a.count) : null;
              const am = a.ml    !== '' ? Number(a.ml)    : null;
              // 両方入力済みの場合のみ差分を計算
              const dc = bc != null && ac != null ? bc - ac : null;
              const dm = bm != null && am != null ? bm - am : null;
              return (
                <div key={p.id} className="free-summary-row">
                  <div className="free-summary-name">{p.name}</div>
                  <div className="free-summary-cell">
                    {bc != null ? `${bc}個` : '—'}<br />{bm != null ? `${bm}ml` : '—'}
                  </div>
                  <div className="free-summary-cell">
                    {ac != null ? `${ac}個` : '—'}<br />{am != null ? `${am}ml` : '—'}
                  </div>
                  {/* 出庫数がプラスのとき（正常消費）は green で強調 */}
                  <div className={`free-summary-cell free-summary-diff${dc != null && dc > 0 ? ' positive' : ''}`}>
                    {dc != null ? `${dc}個` : '—'}<br />{dm != null ? `${dm}ml` : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        )
      }
    </div>
  );
}
