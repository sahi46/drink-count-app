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
      case 'saveFreeRecord':   result = saveFreeRecord(data);   break;
      case 'addStockLog':      result = addStockLog(data);      break;
      case 'savePositions':   result = savePositions(data);   break;
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
    [SHEET_NAMES.FREE]:       ['日付', '商品ID', '補充数', '残数', '消費数'],
    [SHEET_NAMES.STOCK_LOG]:  ['日付', '商品ID', '種別', '数量', 'メモ'],
    [SHEET_NAMES.SETTINGS]:   ['キー', '値'],
  };
  sheet.appendRow(headers[name] || []);
}

// ---- 全データ一括取得 ----

function getAll() {
  return {
    categories:    _getCategories(),
    products:      _getProducts(),
    todayOrders:   _getTodayOrders(),
    todayFree:     _getTodayFree(),
    iconPositions: _getPositions(),
  };
}

function _getCategories() {
  const rows = getSheet(SHEET_NAMES.CATEGORIES).getDataRange().getValues();
  return rows.slice(1)
    .map(r => ({ id: String(r[0]), name: String(r[1]) }))
    .filter(r => r.id && r.id !== 'ID');
}

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

function _getTodayOrders() {
  const today = getToday();
  const rows = getSheet(SHEET_NAMES.ORDERS).getDataRange().getValues();
  const result = {};
  rows.slice(1).forEach(r => {
    if (!r[0]) return;
    if (parseDate(r[0]) === today) result[String(r[1])] = Number(r[2]) || 0;
  });
  return result;
}

function _getTodayFree() {
  const today = getToday();
  const rows = getSheet(SHEET_NAMES.FREE).getDataRange().getValues();
  const result = {};
  rows.slice(1).forEach(r => {
    if (!r[0]) return;
    if (parseDate(r[0]) === today) {
      result[String(r[1])] = {
        supplement:  Number(r[2]) || 0,
        remaining:   r[3] !== '' ? Number(r[3]) : null,
        consumption: Number(r[4]) || 0,
      };
    }
  });
  return result;
}

// ---- カテゴリ ----

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

function updateOrderCount(data) {
  const today = getToday();
  const sheet = getSheet(SHEET_NAMES.ORDERS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    if (parseDate(rows[i][0]) === today && String(rows[i][1]) === String(data.productId)) {
      sheet.getRange(i + 1, 3).setValue(data.count);
      return { success: true };
    }
  }
  sheet.appendRow([today, data.productId, data.count]);
  return { success: true };
}

// ---- フリードリンク記録 ----

function saveFreeRecord(data) {
  const today = getToday();
  const sheet = getSheet(SHEET_NAMES.FREE);
  const rows = sheet.getDataRange().getValues();

  const supplement  = Number(data.supplement);
  const remaining   = data.remaining != null ? Number(data.remaining) : null;
  const consumption = remaining != null ? Math.max(0, supplement - remaining) : 0;

  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    if (parseDate(rows[i][0]) === today && String(rows[i][1]) === String(data.productId)) {
      sheet.getRange(i + 1, 3, 1, 3).setValues([[
        supplement,
        remaining != null ? remaining : '',
        consumption,
      ]]);
      return { success: true };
    }
  }
  sheet.appendRow([today, data.productId, supplement, remaining != null ? remaining : '', consumption]);
  return { success: true };
}

// ---- アイコン配置 ----

function _getPositions() {
  const rows = getSheet(SHEET_NAMES.SETTINGS).getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === 'iconPositions') {
      try { return JSON.parse(String(rows[i][1])); } catch { return null; }
    }
  }
  return null;
}

function savePositions(data) {
  const sheet = getSheet(SHEET_NAMES.SETTINGS);
  const rows = sheet.getDataRange().getValues();
  const val = JSON.stringify(data.positions || []);
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === 'iconPositions') {
      sheet.getRange(i + 1, 2).setValue(val);
      return { success: true };
    }
  }
  sheet.appendRow(['iconPositions', val]);
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
