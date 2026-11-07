/**
 * Ejen Susulan — Simpanan Google Sheets
 * Setiap jadual = satu helaian. Baris 1 = pengepala. Semua sel ditulis sebagai teks
 * (format '@') supaya tarikh/ID tidak ditukar automatik oleh Sheets.
 * Lajur "mode" (LIVE / DEMO) mengasingkan rekod ujian daripada data sebenar.
 */

var JADUAL = {
  Panitia: ['panitiaId', 'nama', 'aktif'],
  Giliran: ['jobId', 'jobKey', 'mode', 'panitiaId', 'aliran', 'docId', 'fileId', 'contentHash',
    'folder', 'subtajuk', 'classId', 'kelas', 'tajuk', 'namaFail', 'tahun', 'status', 'cubaan',
    'kaliProses', 'leaseUntil', 'resumeCaseId', 'ringkasan', 'lastError', 'createdAt', 'updatedAt'],
  Tugasan: ['taskId', 'actionKey', 'mode', 'panitiaId', 'tahun', 'program', 'keputusan', 'tingkatan',
    'kelas', 'pemilik', 'tarikhAkhir', 'status', 'sumberJobId', 'sumberFileId', 'halaman', 'petikan',
    'createdAt', 'updatedAt', 'closedAt'],
  SenaraiSemak: ['itemId', 'actionKey', 'mode', 'panitiaId', 'taskId', 'item', 'status',
    'evidensFileId', 'updatedAt'],
  Evidens: ['linkId', 'actionKey', 'mode', 'panitiaId', 'taskId', 'itemId', 'fileId', 'contentHash',
    'namaFail', 'jobId', 'halaman', 'petikan', 'sebab', 'createdAt'],
  Kes: ['caseId', 'mode', 'panitiaId', 'jobId', 'taskId', 'soalan', 'pilihan', 'sebab', 'status',
    'jawapan', 'createdAt', 'answeredAt', 'closedAt'],
  Sejarah: ['logId', 'mode', 'panitiaId', 'jobId', 'caseId', 'taskId', 'langkah', 'alat', 'input',
    'hasil', 'sebab', 'ralat', 'at']
};

var _ssCache = null;
function ss_() {
  if (_ssCache) return _ssCache;
  var id = prop_('SHEET_ID');
  if (!id) throw new Error('Data ejen belum disediakan. Jalankan setupEjen() dalam editor Apps Script.');
  _ssCache = SpreadsheetApp.openById(id);
  return _ssCache;
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Helaian "' + name + '" tiada. Jalankan setupEjen() semula.');
  return sh;
}

function headers_(name) { return JADUAL[name]; }

function cellOut_(v) {
  if (v instanceof Date) return v.toISOString();
  return v === null || v === undefined ? '' : String(v);
}

function readAll_(name) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var v = sh.getRange(2, 1, last - 1, h.length).getValues();
  var out = [];
  for (var i = 0; i < v.length; i++) {
    if (v[i][0] === '' || v[i][0] === null) continue;
    var o = { _row: i + 2 };
    for (var j = 0; j < h.length; j++) o[h[j]] = cellOut_(v[i][j]);
    out.push(o);
  }
  return out;
}

function rowArray_(name, obj) {
  return headers_(name).map(function (k) {
    var v = obj[k];
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  });
}

function writeRow_(name, rowNum, obj) {
  var sh = sheet_(name);
  var arr = rowArray_(name, obj);
  var rng = sh.getRange(rowNum, 1, 1, arr.length);
  rng.setNumberFormat('@');
  rng.setValues([arr]);
}

function appendRow_(name, obj) {
  var sh = sheet_(name);
  var rowNum = sh.getLastRow() + 1;
  writeRow_(name, rowNum, obj);
  obj._row = rowNum;
  return obj;
}

function updateRow_(name, obj) {
  if (!obj._row) throw new Error('Rekod tiada nombor baris.');
  if (headers_(name).indexOf('updatedAt') >= 0) obj.updatedAt = nowIso_();
  writeRow_(name, obj._row, obj);
  return obj;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Sistem sibuk. Cuba sebentar lagi.');
  try { return fn(); } finally { lock.releaseLock(); }
}

/**
 * Cipta atau kemas kini rekod berdasarkan kunci stabil.
 * Dipanggil di dalam kunci (LockService) supaya dua proses serentak tidak mencipta rekod berganda.
 */
function upsertByKey_(name, keyField, keyVal, buatBaharu, kemasKini) {
  return withLock_(function () {
    var rows = readAll_(name);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][keyField] === keyVal) {
        var r = rows[i];
        if (kemasKini) { kemasKini(r); updateRow_(name, r); }
        return { rekod: r, baharu: false };
      }
    }
    var o = buatBaharu();
    o[keyField] = keyVal;
    appendRow_(name, o);
    return { rekod: o, baharu: true };
  });
}

function findById_(name, idField, idVal) {
  var rows = readAll_(name);
  for (var i = 0; i < rows.length; i++) if (rows[i][idField] === String(idVal)) return rows[i];
  return null;
}

/** Padam baris yang memenuhi syarat (digunakan HANYA untuk reset data DEMO). */
function deleteRowsWhere_(name, pred) {
  return withLock_(function () {
    var sh = sheet_(name);
    var rows = readAll_(name).filter(pred).sort(function (a, b) { return b._row - a._row; });
    rows.forEach(function (r) { sh.deleteRow(r._row); });
    return rows.length;
  });
}

function clip_(s, n) {
  s = typeof s === 'string' ? s : JSON.stringify(s);
  if (s === undefined) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}
