/**
 * Ejen Susulan — Web App API
 * Frontend memanggil dengan corak yang sama seperti backend e-Fail:
 *   POST body: payload=<JSON>   (URLSearchParams, tiada preflight CORS)
 * Respons: { ok: true, data } atau { ok: false, error }
 * Semua tindakan memerlukan AGENT_KEY.
 */

function doGet() {
  // Semakan kesihatan sahaja. Tiada data didedahkan.
  return json_({ ok: true, data: { nama: 'Ejen Susulan Dokumen Panitia', versi: EJEN.VERSI } });
}

function doPost(e) {
  try {
    var raw = (e && e.parameter && e.parameter.payload) || (e && e.postData && e.postData.contents) || '';
    if (raw.length > 15 * 1024 * 1024) throw new Error('Permintaan terlalu besar.');
    var p;
    try { p = JSON.parse(raw); } catch (err) { throw new Error('Format permintaan tidak sah.'); }
    semakKunci_(p.key);
    return json_({ ok: true, data: route_(p) });
  } catch (err) {
    console.error(err && err.stack || err);
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function semakKunci_(key) {
  var expected = prop_('AGENT_KEY');
  if (!expected) throw new Error('AGENT_KEY belum ditetapkan. Jalankan setupEjen().');
  if (typeof key !== 'string' || key.length !== expected.length) throw new Error('Kunci akses ejen tidak sah.');
  var diff = 0;
  for (var i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) throw new Error('Kunci akses ejen tidak sah.');
}

function route_(p) {
  switch (p.action) {
    case 'ping':        return { panitia: senaraiPanitia_(), versi: EJEN.VERSI };
    case 'enqueue':     return enqueueLive_(p);
    case 'demoUpload':  return enqueueDemo_(p);
    case 'list':        return senaraiPanel_(p);
    case 'answerCase':  return jawabKes_(p);
    case 'reprocess':   return prosesSemula_(p);
    case 'processNow':  prosesGiliran_(1); return senaraiPanel_(p);
    case 'resetDemo':   return resetDemo_(p);
    default: throw new Error('Tindakan tidak dikenali.');
  }
}

/* ---------- Pengesahan input ---------- */

function str_(v, max, wajib, nama) {
  if (v === null || v === undefined) v = '';
  if (typeof v !== 'string' && typeof v !== 'number') throw new Error('Medan ' + nama + ' tidak sah.');
  v = String(v).trim();
  if (wajib && !v) throw new Error('Medan ' + nama + ' wajib.');
  if (v.length > max) throw new Error('Medan ' + nama + ' terlalu panjang.');
  return v;
}

function mode_(v) {
  if (v === 'DEMO') return 'DEMO';
  if (v === undefined || v === null || v === '' || v === 'LIVE') return 'LIVE';
  throw new Error('Mod tidak sah.');
}

function panitiaWajib_(v) {
  var id = str_(v, 20, true, 'panitiaId');
  if (!panitiaAktif_(id)) throw new Error('Panitia "' + id + '" tidak didaftarkan dalam helaian Panitia.');
  return id;
}

/* ---------- Data untuk panel ---------- */

function senaraiPanel_(p) {
  var panitiaId = panitiaWajib_(p.panitiaId);
  var mode = mode_(p.mode);
  var skop = function (r) { return r.panitiaId === panitiaId && r.mode === mode; };

  var tugasan = readAll_('Tugasan').filter(skop);
  var semak = readAll_('SenaraiSemak').filter(skop);
  var evidens = readAll_('Evidens').filter(skop);
  var kes = readAll_('Kes').filter(skop);
  var kerja = readAll_('Giliran').filter(skop)
    .sort(function (a, b) { return b.createdAt < a.createdAt ? -1 : 1; }).slice(0, 40);
  var sejarah = readAll_('Sejarah').filter(skop)
    .sort(function (a, b) { return a.at < b.at ? -1 : 1; }).slice(-300);

  var buang = function (o) { var c = {}; for (var k in o) if (k !== '_row' && k !== 'actionKey' && k !== 'jobKey') c[k] = o[k]; return c; };

  return {
    mode: mode,
    panitiaId: panitiaId,
    tugasan: tugasan.map(function (t) {
      var x = buang(t);
      x.senaraiSemak = semak.filter(function (s) { return s.taskId === t.taskId; }).map(buang);
      x.evidens = evidens.filter(function (e) { return e.taskId === t.taskId; }).map(buang);
      return x;
    }),
    kes: kes.map(function (k) {
      var x = buang(k);
      try { x.pilihan = JSON.parse(k.pilihan || '[]'); } catch (e) { x.pilihan = []; }
      return x;
    }),
    kerja: kerja.map(buang),
    sejarah: sejarah.map(function (s) {
      return { jobId: s.jobId, caseId: s.caseId, taskId: s.taskId, langkah: s.langkah, alat: s.alat,
        sebab: s.sebab, ralat: s.ralat, hasil: clip_(s.hasil, 300), at: s.at };
    })
  };
}

/* ---------- Jawapan guru ---------- */

function jawabKes_(p) {
  var caseId = str_(p.caseId, 40, true, 'caseId');
  var jawapan = str_(p.jawapan, 1000, true, 'jawapan');
  var panitiaId = panitiaWajib_(p.panitiaId);
  var mode = mode_(p.mode);

  withLock_(function () {
    var k = findById_('Kes', 'caseId', caseId);
    if (!k || k.panitiaId !== panitiaId || k.mode !== mode) throw new Error('Kes tidak ditemui dalam panitia ini.');
    if (k.status !== 'Menunggu Guru') throw new Error('Kes ini sudah dijawab.');
    k.status = 'Dijawab';
    k.jawapan = jawapan;
    k.answeredAt = nowIso_();
    updateRow_('Kes', k);

    var j = findById_('Giliran', 'jobId', k.jobId);
    if (j) {
      j.status = STATUS_KERJA.MENUNGGU;
      j.resumeCaseId = k.caseId;
      j.cubaan = '0';
      j.lastError = '';
      j.leaseUntil = '';
      updateRow_('Giliran', j);
    }
  });
  return senaraiPanel_(p);
}

function prosesSemula_(p) {
  var jobId = str_(p.jobId, 40, true, 'jobId');
  var panitiaId = panitiaWajib_(p.panitiaId);
  var mode = mode_(p.mode);
  withLock_(function () {
    var j = findById_('Giliran', 'jobId', jobId);
    if (!j || j.panitiaId !== panitiaId || j.mode !== mode) throw new Error('Kerja tidak ditemui.');
    if (j.status === STATUS_KERJA.DIPROSES) throw new Error('Kerja sedang diproses.');
    j.status = STATUS_KERJA.MENUNGGU;
    j.cubaan = '0';
    j.lastError = '';
    j.resumeCaseId = '';
    j.leaseUntil = '';
    updateRow_('Giliran', j);
  });
  return senaraiPanel_(p);
}

function resetDemo_(p) {
  var panitiaId = panitiaWajib_(p.panitiaId);
  var demo = function (r) { return r.mode === 'DEMO' && r.panitiaId === panitiaId; };
  var n = 0;
  ['Sejarah', 'Evidens', 'SenaraiSemak', 'Kes', 'Tugasan', 'Giliran'].forEach(function (t) { n += deleteRowsWhere_(t, demo); });
  var out = senaraiPanel_({ panitiaId: panitiaId, mode: 'DEMO' });
  out.dipadam = n;
  return out;
}
