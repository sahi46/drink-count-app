// ====================================================
// ドリンクカウント・在庫管理アプリ - Google Apps Script
// ====================================================

const SHEET_NAMES = {
  CATEGORIES: 'カテゴリマスタ',
  PRODUCTS:   '商品マスタ',
  ORDERS:     'オーダー記録',
  FREE:       'フリー記録',
  STOCK_LOG:  '在庫ログ',
  SETTINGS:   '設定',
};

function doGet() {
  return jsonResponse(getAll());
}

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ error: 'Invalid JSON' });
  }

  let result;
  try {
    switch (data.action) {
      case 'addCategory':      result = addCategory(data);      break;
      case 'deleteCategory':   result = deleteCategory(data);   break;
      case 'addProduct':       result = addProduct(data);       break;
      case 'updateProduct':    result = updateProduct(data);    break;
      case 'deleteProduct':    result = deleteProduct(data);    break;
      case 'updateOrderCount': result = updateOrderCount(data); break;
      case 'saveFreeData':     result = saveFreeData(data);     break;
      case 'addStockLog':      result = addStockLog(data);      break;
      case 'savePositions':    result = savePositions(data);    break;
      case 'saveManageOrder':  result = saveManageOrder(data);  break;
      case 'resetOrders':      result = resetOrders(data);      break;
      default: result = { error: 'Unknown action: ' + data.action };
    }
  } catch (err) {
    result = { error: err.message };
  }

  return jsonResponse(result);
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getToday() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
}

function parseDate(val) {
  return Utilities.formatDate(new Date(val), 'Asia/Tokyo', 'yyyy-MM-dd');
}

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    initHeaders(sheet, name);
  }
  return sheet;
}

function initHeaders(sheet, name) {
  const headers = {
    [SHEET_NAMES.CATEGORIES]: ['ID', 'カテゴリ名'],
    [SHEET_NAMES.PRODUCTS]:   ['ID', '名前', 'タイプ', 'カテゴリID', '単位', '容量', '在庫数', '発注点'],
    [SHEET_NAMES.ORDERS]:     ['日付', '商品ID', 'カウント数'],
    [SHEET_NAMES.FREE]:       ['日付', '商品ID', '営業前個数', '営業前ml', '営業後個数', '営業後ml'],
    [SHEET_NAMES.STOCK_LOG]:  ['日付', '商品ID', '種別', '数量', 'メモ'],
    [SHEET_NAMES.SETTINGS]:   ['キー', '値'],
  };
  sheet.appendRow(headers[name] || []);
}

// ---- 全データ一括取得 ----

function getAll() {
  return {
    categories:     _getCategories(),
    products:       _getProducts(),
    todayOrders:    _getTodayOrders(),
    todayFree:      _getTodayFree(),
    iconPositions:  _getPositions(),
    manageOrderList: _getSetting('manageOrderList', null, true),
    manageFreeList:  _getSetting('manageFreeList',  null, true),
  };
}

// ---- 設定シート汎用 read/write ----

// JSON フラグが true のときはパースして返す
function _getSetting(key, defaultValue, parseJson) {
  const rows = getSheet(SHEET_NAMES.SETTINGS).getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === key) {
      const v = String(rows[i][1]);
      if (!v) return defaultValue;
      return parseJson ? JSON.parse(v) : v;
    }
  }
  return defaultValue;
}

function _setSetting(key, value) {
  const sheet = getSheet(SHEET_NAMES.SETTINGS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

// ---- アクティブ日付（オーダーセッション管理）----
// 自動リセットを防ぐため、todayOrders / updateOrderCount は
// getToday() ではなく activeDate を使う。
// リセット時だけ activeDate を今日の日付に更新する。

function _getActiveDate() {
  const v = _getSetting('activeDate', '', false);
  return v || getToday(); // 未設定なら今日（初回起動時）
}

// ---- 商品リスト並び順（管理画面） ----

function saveManageOrder(data) {
  const key = data.type === 'order' ? 'manageOrderList' : 'manageFreeList';
  _setSetting(key, JSON.stringify(data.order || []));
  return { success: true };
}

// ---- カテゴリ ----

function _getCategories() {
  const rows = getSheet(SHEET_NAMES.CATEGORIES).getDataRange().getValues();
  return rows.slice(1)
    .map(r => ({ id: String(r[0]), name: String(r[1]) }))
    .filter(r => r.id && r.id !== 'ID');
}

function addCategory(data) {
  const id = 'cat_' + Date.now();
  getSheet(SHEET_NAMES.CATEGORIES).appendRow([id, data.name]);
  return { id, name: data.name };
}

function deleteCategory(data) {
  const sheet = getSheet(SHEET_NAMES.CATEGORIES);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.id)) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { error: 'Not found' };
}

// ---- 商品 ----

function _getProducts() {
  const rows = getSheet(SHEET_NAMES.PRODUCTS).getDataRange().getValues();
  return rows.slice(1)
    .map(r => ({
      id:           String(r[0]),
      name:         String(r[1]),
      type:         String(r[2]),
      categoryId:   String(r[3]),
      unit:         String(r[4]),
      volume:       String(r[5]),
      stock:        Number(r[6]) || 0,
      reorderPoint: Number(r[7]) || 0,
    }))
    .filter(r => r.id && r.id !== 'ID');
}

function addProduct(data) {
  const id = 'prod_' + Date.now();
  getSheet(SHEET_NAMES.PRODUCTS).appendRow([
    id, data.name, data.type, data.categoryId || '',
    data.unit || '', data.volume || '',
    Number(data.stock) || 0, Number(data.reorderPoint) || 0,
  ]);
  return { id, ...data };
}

function updateProduct(data) {
  const sheet = getSheet(SHEET_NAMES.PRODUCTS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.id)) {
      sheet.getRange(i + 1, 1, 1, 8).setValues([[
        data.id, data.name, data.type, data.categoryId || '',
        data.unit || '', data.volume || '',
        Number(data.stock) || 0, Number(data.reorderPoint) || 0,
      ]]);
      return { success: true };
    }
  }
  return { error: 'Not found' };
}

function deleteProduct(data) {
  const sheet = getSheet(SHEET_NAMES.PRODUCTS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.id)) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { error: 'Not found' };
}

// ---- オーダーカウント ----
// activeDate でフィルタすることで日付変更による自動リセットを防ぐ

function _getTodayOrders() {
  const activeDate = _getActiveDate();
  const rows = getSheet(SHEET_NAMES.ORDERS).getDataRange().getValues();
  const result = {};
  rows.slice(1).forEach(r => {
    if (!r[0]) return;
    if (parseDate(r[0]) === activeDate) result[String(r[1])] = Number(r[2]) || 0;
  });
  return result;
}

function updateOrderCount(data) {
  // 書き込みも activeDate の日付で行う（リセットするまで同じ日付に蓄積）
  const activeDate = _getActiveDate();
  const sheet = getSheet(SHEET_NAMES.ORDERS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    if (parseDate(rows[i][0]) === activeDate && String(rows[i][1]) === String(data.productId)) {
      sheet.getRange(i + 1, 3).setValue(data.count);
      return { success: true };
    }
  }
  sheet.appendRow([activeDate, data.productId, data.count]);
  return { success: true };
}

// オーダーカウントを手動リセットする。
// 今日の日付の既存レコードを削除してから activeDate を今日に更新する。
function resetOrders(data) {
  const today = getToday();

  // 今日の日付のオーダー行を削除（後ろから削除して行番号ずれを防ぐ）
  const sheet = getSheet(SHEET_NAMES.ORDERS);
  const rows = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (!rows[i][0]) continue;
    if (parseDate(rows[i][0]) === today) sheet.deleteRow(i + 1);
  }

  // activeDate を今日に更新 → 次回取得から新しいセッションとして扱う
  _setSetting('activeDate', today);
  return { success: true };
}

// ---- フリードリンク記録 ----
// type: 'before' | 'after'、それぞれ個数と ml を独立して保存する

function _getTodayFree() {
  const today = getToday();
  const rows = getSheet(SHEET_NAMES.FREE).getDataRange().getValues();
  const result = {};
  rows.slice(1).forEach(r => {
    if (!r[0]) return;
    if (parseDate(r[0]) !== today) return;
    const id = String(r[1]);
    if (!result[id]) result[id] = {};
    // 列: 日付, 商品ID, 営業前個数, 営業前ml, 営業後個数, 営業後ml
    if (r[2] !== '') result[id].beforeCount = Number(r[2]);
    if (r[3] !== '') result[id].beforeMl    = Number(r[3]);
    if (r[4] !== '') result[id].afterCount  = Number(r[4]);
    if (r[5] !== '') result[id].afterMl     = Number(r[5]);
  });
  return result;
}

function saveFreeData(data) {
  const today = getToday();
  const sheet = getSheet(SHEET_NAMES.FREE);
  const rows = sheet.getDataRange().getValues();

  // before → 列3・4、after → 列5・6（1-indexed）
  const colCount = data.type === 'before' ? 3 : 5;
  const colMl    = data.type === 'before' ? 4 : 6;
  const countVal = data.count !== null ? data.count : '';
  const mlVal    = data.ml    !== null ? data.ml    : '';

  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    if (parseDate(rows[i][0]) === today && String(rows[i][1]) === String(data.productId)) {
      sheet.getRange(i + 1, colCount).setValue(countVal);
      sheet.getRange(i + 1, colMl).setValue(mlVal);
      return { success: true };
    }
  }

  // 既存行なし → 新規追加（未入力の列は空文字）
  const row = [today, data.productId, '', '', '', ''];
  row[colCount - 1] = countVal;
  row[colMl - 1]    = mlVal;
  sheet.appendRow(row);
  return { success: true };
}

// ---- アイコン配置 ----

function _getPositions() {
  const v = _getSetting('iconPositions', null, false);
  if (!v) return null;
  try { return JSON.parse(v); } catch { return null; }
}

function savePositions(data) {
  _setSetting('iconPositions', JSON.stringify(data.positions || []));
  return { success: true };
}

// ---- 在庫ログ（入荷） ----

function addStockLog(data) {
  const today = getToday();
  getSheet(SHEET_NAMES.STOCK_LOG).appendRow([
    today, data.productId, data.type, Number(data.quantity), data.memo || '',
  ]);

  const sheet = getSheet(SHEET_NAMES.PRODUCTS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.productId)) {
      const current = Number(rows[i][6]) || 0;
      const delta   = data.type === '入荷' ? Number(data.quantity) : -Number(data.quantity);
      sheet.getRange(i + 1, 7).setValue(Math.max(0, current + delta));
      break;
    }
  }
  return { success: true };
}
