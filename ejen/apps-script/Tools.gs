/**
 * Ejen Susulan — Alat yang dibenarkan untuk model.
 * PERATURAN KESELAMATAN (dikuatkuasakan di pelayan, bukan bergantung pada model):
 *  - Skop panitia, mod (LIVE/DEMO), tahun dan ID fail diambil daripada KERJA, bukan input model.
 *  - Model tidak boleh memadam, mengubah akses, memilih fail lain atau menjalankan kod.
 *  - Tugasan hanya boleh dicipta daripada dokumen ARAHAN (minit, perancangan, kertas kerja, post mortem), untuk keputusan "Diluluskan".
 *  - Evidens hanya boleh dipautkan daripada aliran EVIDENS; kelas bercanggah ditolak.
 *  - Tugasan hanya boleh ditutup jika semua item senarai semak sudah dipenuhi.
 *  - Setiap tulisan menggunakan kunci tindakan stabil -> pemprosesan semula tidak mencipta rekod berganda.
 */

var SEBAB_PROP = { type: 'string', description: 'Sebab ringkas berdasarkan bukti dalam PDF atau hasil alat sebelumnya (maks 1-2 ayat).' };

var DEFINISI_ALAT = [
  {
    name: 'baca_maklumat_fail',
    description: 'Baca metadata fail yang sedang diproses: aliran (ARAHAN/EVIDENS), panitia, kategori, kelas yang dipilih guru semasa muat naik, tajuk, tahun dan berapa kali fail ini telah diproses. PDF itu sendiri sudah dilampirkan dalam mesej pertama.',
    input_schema: { type: 'object', properties: { sebab: SEBAB_PROP }, required: ['sebab'] }
  },
  {
    name: 'cari_program',
    description: 'Cari program/tugasan sedia ada dalam panitia ini mengikut kata kunci nama program. Pulangkan calon dengan skor padanan, kelas, tarikh dan status. Gunakan untuk mengelak tugasan berganda dan untuk membandingkan program yang hampir sama.',
    input_schema: { type: 'object', properties: {
      kata_kunci: { type: 'string', description: 'Nama atau kata kunci program, cth. "amali litar elektrik".' },
      sebab: SEBAB_PROP
    }, required: ['kata_kunci', 'sebab'] }
  },
  {
    name: 'cari_tugasan',
    description: 'Senaraikan tugasan dalam panitia ini mengikut status, dengan ringkasan senarai semak evidens.',
    input_schema: { type: 'object', properties: {
      status: { type: 'string', enum: ['Terbuka', 'Lengkap', 'Semua'] },
      sebab: SEBAB_PROP
    }, required: ['status', 'sebab'] }
  },
  {
    name: 'baca_senarai_semak',
    description: 'Baca senarai semak evidens bagi satu tugasan: setiap item, status (Diperlukan/Dipenuhi) dan fail evidens yang sudah dipautkan.',
    input_schema: { type: 'object', properties: { taskId: { type: 'string' }, sebab: SEBAB_PROP }, required: ['taskId', 'sebab'] }
  },
  {
    name: 'cipta_atau_kemaskini_tugasan',
    description: 'HANYA untuk dokumen ARAHAN (minit mesyuarat, perancangan aktiviti, kertas kerja, post mortem). Cipta tugasan bagi keputusan atau arahan yang DILULUSKAN dan memerlukan tindakan, atau kemas kini tugasan sedia ada bagi program yang sama. Semua medan mesti diambil daripada PDF; jangan reka. Jika pemilik, tarikh akhir atau evidens tidak dinyatakan dengan jelas, jangan panggil alat ini; buka Semakan Guru.',
    input_schema: { type: 'object', properties: {
      program: { type: 'string', description: 'Nama program/tindakan seperti dalam dokumen.' },
      status_keputusan: { type: 'string', enum: ['Diluluskan', 'Cadangan', 'Makluman'] },
      keputusan: { type: 'string', description: 'Ringkasan keputusan atau arahan.' },
      tingkatan: { type: 'string', description: 'Cth. "2". Kosong jika tiada.' },
      kelas: { type: 'string', description: 'Cth. "2 Amanah". Kosong jika minit tidak menyatakan kelas.' },
      pemilik: { type: 'string', description: 'Nama pemilik tindakan seperti dalam minit.' },
      tarikh_akhir: { type: 'string', description: 'Format YYYY-MM-DD.' },
      evidens_diperlukan: { type: 'array', items: { type: 'string' }, description: 'Senarai evidens yang perlu disediakan seperti dinyatakan dalam dokumen.' },
      halaman: { type: 'integer', description: 'Nombor halaman PDF tempat keputusan ditemui.' },
      petikan: { type: 'string', description: 'Petikan tepat dan pendek (maks 30 patah perkataan) daripada PDF.' },
      sebab: SEBAB_PROP
    }, required: ['program', 'status_keputusan', 'keputusan', 'pemilik', 'tarikh_akhir', 'evidens_diperlukan', 'sebab'] }
  },
  {
    name: 'pautkan_evidens',
    description: 'HANYA untuk aliran EVIDENS (semua dokumen bukan arahan). Pautkan fail PDF yang sedang diproses kepada satu item senarai semak tugasan, jika kandungan PDF benar-benar memenuhi item itu dan program, kelas dan tarikh sepadan.',
    input_schema: { type: 'object', properties: {
      taskId: { type: 'string' },
      itemId: { type: 'string' },
      halaman: { type: 'integer' },
      petikan: { type: 'string', description: 'Petikan tepat dan pendek daripada PDF yang membuktikan item dipenuhi.' },
      sebab: SEBAB_PROP
    }, required: ['taskId', 'itemId', 'sebab'] }
  },
  {
    name: 'tutup_tugasan',
    description: 'Tutup tugasan sebagai Lengkap. Pelayan menolak jika masih ada item senarai semak yang belum dipenuhi.',
    input_schema: { type: 'object', properties: { taskId: { type: 'string' }, sebab: SEBAB_PROP }, required: ['taskId', 'sebab'] }
  },
  {
    name: 'buka_semakan_guru',
    description: 'Buka kes Semakan Guru apabila maklumat tidak cukup, bercanggah atau padanan meragukan. Tanya soalan khusus yang boleh dijawab oleh guru dan beri pilihan jawapan jika sesuai. Konteks disimpan supaya kerja boleh disambung selepas guru menjawab.',
    input_schema: { type: 'object', properties: {
      soalan: { type: 'string' },
      pilihan: { type: 'array', items: { type: 'string' }, description: 'Pilihan jawapan ringkas, 0-4 item.' },
      taskId: { type: 'string', description: 'Tugasan berkaitan jika ada.' },
      sebab: SEBAB_PROP
    }, required: ['soalan', 'sebab'] }
  },
  {
    name: 'baca_status',
    description: 'Baca semula rekod daripada pangkalan data untuk mengesahkan tindakan berjaya. Dengan taskId: tugasan, senarai semak dan evidens. Tanpa taskId: semua rekod yang disentuh oleh kerja ini.',
    input_schema: { type: 'object', properties: { taskId: { type: 'string' }, sebab: SEBAB_PROP }, required: ['sebab'] }
  },
  {
    name: 'selesai',
    description: 'Tamatkan kerja ini selepas rekod disahkan dengan baca_status, atau selepas Semakan Guru dibuka.',
    input_schema: { type: 'object', properties: {
      ringkasan: { type: 'string', description: 'Ringkasan 1-3 ayat untuk guru: apa yang ditemui dan apa yang dilakukan.' }
    }, required: ['ringkasan'] }
  }
];

/* ---------- Pembantu skop ---------- */

function skopKerja_(ctx) {
  return function (r) { return r.panitiaId === ctx.job.panitiaId && r.mode === ctx.job.mode; };
}

function tugasanDalamSkop_(ctx, taskId) {
  var t = findById_('Tugasan', 'taskId', String(taskId || ''));
  if (!t || !skopKerja_(ctx)(t)) throw new Error('Tugasan ' + taskId + ' tidak wujud dalam panitia/mod ini.');
  return t;
}

function ringkasTugasan_(t, semak) {
  var items = semak.filter(function (s) { return s.taskId === t.taskId; });
  return {
    taskId: t.taskId, program: t.program, tahun: t.tahun, tingkatan: t.tingkatan, kelas: t.kelas,
    pemilik: t.pemilik, tarikhAkhir: t.tarikhAkhir, status: t.status,
    itemDipenuhi: items.filter(function (s) { return s.status === 'Dipenuhi'; }).length,
    itemJumlah: items.length
  };
}

function skorPadanan_(a, b) {
  var ta = norm_(a).split(' ').filter(function (w) { return w.length > 1; });
  var tb = norm_(b).split(' ').filter(function (w) { return w.length > 1; });
  if (!ta.length || !tb.length) return 0;
  var sama = ta.filter(function (w) { return tb.indexOf(w) >= 0; }).length;
  return Math.round(100 * (2 * sama) / (ta.length + tb.length));
}

function halaman_(v) {
  var n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 999 ? String(n) : '';
}

function teks_(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }

/* ---------- Pelaksanaan alat ---------- */

var ALAT = {

  baca_maklumat_fail: function (ctx) {
    var j = ctx.job;
    return { aliran: j.aliran, panitia: j.panitiaId, mod: j.mode, folder: j.folder, subtajuk: j.subtajuk,
      kelasDipilihGuru: j.kelas || '(tiada / umum)', tajuk: j.tajuk, namaFail: j.namaFail, tahun: j.tahun,
      kaliProses: Number(j.kaliProses || 1) };
  },

  cari_program: function (ctx, inp) {
    var kk = teks_(inp.kata_kunci, 200);
    if (!kk) throw new Error('kata_kunci wajib.');
    var semak = readAll_('SenaraiSemak').filter(skopKerja_(ctx));
    var calon = readAll_('Tugasan').filter(skopKerja_(ctx)).map(function (t) {
      var r = ringkasTugasan_(t, semak);
      r.skor = skorPadanan_(kk, t.program);
      r.keputusan = t.keputusan;
      r.halamanMinit = t.halaman;
      return r;
    }).filter(function (r) { return r.skor >= 30; })
      .sort(function (a, b) { return b.skor - a.skor; }).slice(0, 8);
    return { bilangan: calon.length, calon: calon,
      nota: calon.length > 1 ? 'Lebih daripada satu calon: bandingkan kelas, tarikh dan keputusan sebelum bertindak.' : '' };
  },

  cari_tugasan: function (ctx, inp) {
    var st = inp.status === 'Lengkap' || inp.status === 'Semua' ? inp.status : 'Terbuka';
    var semak = readAll_('SenaraiSemak').filter(skopKerja_(ctx));
    var list = readAll_('Tugasan').filter(skopKerja_(ctx))
      .filter(function (t) { return st === 'Semua' || t.status === st; })
      .map(function (t) { return ringkasTugasan_(t, semak); });
    return { bilangan: list.length, tugasan: list.slice(0, 30) };
  },

  baca_senarai_semak: function (ctx, inp) {
    var t = tugasanDalamSkop_(ctx, inp.taskId);
    var items = readAll_('SenaraiSemak').filter(function (s) { return s.taskId === t.taskId; });
    var ev = readAll_('Evidens').filter(function (e) { return e.taskId === t.taskId; });
    return {
      tugasan: { taskId: t.taskId, program: t.program, kelas: t.kelas, tingkatan: t.tingkatan,
        tarikhAkhir: t.tarikhAkhir, status: t.status, keputusan: t.keputusan },
      item: items.map(function (s) {
        return { itemId: s.itemId, item: s.item, status: s.status,
          evidens: ev.filter(function (e) { return e.itemId === s.itemId; })
            .map(function (e) { return { namaFail: e.namaFail, halaman: e.halaman, sumberIniFailSemasa: e.contentHash === ctx.job.contentHash }; }) };
      })
    };
  },

  cipta_atau_kemaskini_tugasan: function (ctx, inp) {
    var j = ctx.job;
    if (!alirArahan_(j.aliran)) throw new Error('Tugasan hanya boleh dicipta daripada dokumen arahan (minit, perancangan, kertas kerja, post mortem). Untuk dokumen lain, gunakan pautkan_evidens.');
    if (inp.status_keputusan !== 'Diluluskan') throw new Error('Keputusan berstatus "' + inp.status_keputusan + '" tidak boleh dijadikan tugasan. Hanya keputusan Diluluskan.');
    var program = teks_(inp.program, 150);
    var pemilik = teks_(inp.pemilik, 120);
    var tarikh = teks_(inp.tarikh_akhir, 10);
    if (!program) throw new Error('Nama program wajib.');
    if (!pemilik) throw new Error('Pemilik tiada dalam dokumen. Buka Semakan Guru.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tarikh) || isNaN(new Date(tarikh + 'T00:00:00Z'))) throw new Error('Tarikh akhir tidak jelas (perlu YYYY-MM-DD). Buka Semakan Guru jika dokumen tidak menyatakannya.');
    var evidens = (Array.isArray(inp.evidens_diperlukan) ? inp.evidens_diperlukan : [])
      .map(function (s) { return teks_(s, 120); }).filter(Boolean).slice(0, 10);
    if (!evidens.length) throw new Error('Senarai evidens tiada. Buka Semakan Guru untuk bertanya evidens yang diperlukan.');

    var kelas = teks_(inp.kelas, 60);
    var actionKey = [j.mode, j.panitiaId, j.tahun, norm_(program), normKelas_(kelas)].join('|');
    var r = upsertByKey_('Tugasan', 'actionKey', actionKey, function () {
      return { taskId: id_('TGS'), mode: j.mode, panitiaId: j.panitiaId, tahun: j.tahun, program: program,
        keputusan: teks_(inp.keputusan, 500), tingkatan: teks_(inp.tingkatan, 10), kelas: kelas,
        pemilik: pemilik, tarikhAkhir: tarikh, status: 'Terbuka', sumberJobId: j.jobId, sumberFileId: j.fileId,
        halaman: halaman_(inp.halaman), petikan: teks_(inp.petikan, 300), createdAt: nowIso_(), updatedAt: nowIso_(), closedAt: '' };
    }, function (t) {
      t.keputusan = teks_(inp.keputusan, 500) || t.keputusan;
      t.pemilik = pemilik;
      t.tarikhAkhir = tarikh;
      if (inp.tingkatan) t.tingkatan = teks_(inp.tingkatan, 10);
      if (inp.halaman) t.halaman = halaman_(inp.halaman);
      if (inp.petikan) t.petikan = teks_(inp.petikan, 300);
      t.sumberJobId = j.jobId;
      t.sumberFileId = j.fileId;
    });
    var t = r.rekod;

    var itemBaharu = 0;
    evidens.forEach(function (nama) {
      var key = t.taskId + '|' + norm_(nama);
      var x = upsertByKey_('SenaraiSemak', 'actionKey', key, function () {
        return { itemId: id_('ITM'), mode: j.mode, panitiaId: j.panitiaId, taskId: t.taskId, item: nama,
          status: 'Diperlukan', evidensFileId: '', updatedAt: nowIso_() };
      }, null);
      if (x.baharu) itemBaharu++;
    });
    // Tugasan Lengkap yang menerima item evidens baharu dibuka semula.
    if (!r.baharu && itemBaharu > 0 && t.status === 'Lengkap') {
      withLock_(function () { var tt = findById_('Tugasan', 'taskId', t.taskId); tt.status = 'Terbuka'; tt.closedAt = ''; updateRow_('Tugasan', tt); });
    }
    ctx.disentuh[t.taskId] = true;
    return { taskId: t.taskId, dicipta: r.baharu, dikemaskini: !r.baharu, itemEvidensBaharu: itemBaharu };
  },

  pautkan_evidens: function (ctx, inp) {
    var j = ctx.job;
    if (j.aliran !== 'EVIDENS') throw new Error('Dokumen arahan tidak dipautkan sebagai evidens. Gunakan cipta_atau_kemaskini_tugasan.');
    var t = tugasanDalamSkop_(ctx, inp.taskId);
    var item = findById_('SenaraiSemak', 'itemId', String(inp.itemId || ''));
    if (!item || item.taskId !== t.taskId) throw new Error('Item ' + inp.itemId + ' bukan milik tugasan ' + t.taskId + '.');
    if (j.kelas && t.kelas && normKelas_(j.kelas) !== normKelas_(t.kelas)) {
      throw new Error('Kelas bercanggah: fail dimuat naik untuk "' + j.kelas + '" tetapi tugasan untuk "' + t.kelas + '". Pautan ditolak; buka Semakan Guru.');
    }

    var key = [t.taskId, item.itemId, j.contentHash].join('|');
    var sudahAda = readAll_('Evidens').some(function (e) { return e.actionKey === key; });
    if (!sudahAda && t.status === 'Lengkap') throw new Error('Tugasan ' + t.taskId + ' sudah Lengkap. Evidens baharu tidak dipautkan; buka Semakan Guru jika perlu.');
    var r = upsertByKey_('Evidens', 'actionKey', key, function () {
      return { linkId: id_('EVD'), mode: j.mode, panitiaId: j.panitiaId, taskId: t.taskId, itemId: item.itemId,
        fileId: j.fileId, contentHash: j.contentHash, namaFail: j.namaFail, jobId: j.jobId,
        halaman: halaman_(inp.halaman), petikan: teks_(inp.petikan, 300), sebab: teks_(inp.sebab, 300), createdAt: nowIso_() };
    }, null);

    withLock_(function () {
      var it = findById_('SenaraiSemak', 'itemId', item.itemId);
      if (it.status !== 'Dipenuhi') { it.status = 'Dipenuhi'; it.evidensFileId = j.fileId; updateRow_('SenaraiSemak', it); }
    });
    ctx.disentuh[t.taskId] = true;

    var baki = readAll_('SenaraiSemak').filter(function (s) { return s.taskId === t.taskId && s.status !== 'Dipenuhi'; })
      .map(function (s) { return { itemId: s.itemId, item: s.item }; });
    return { linkId: r.rekod.linkId, pautanBaharu: r.baharu,
      nota: r.baharu ? 'Pautan dicipta.' : 'Pautan ini sudah wujud; tiada rekod berganda dicipta.',
      itemMasihDiperlukan: baki };
  },

  tutup_tugasan: function (ctx, inp) {
    var t = tugasanDalamSkop_(ctx, inp.taskId);
    var items = readAll_('SenaraiSemak').filter(function (s) { return s.taskId === t.taskId; });
    var baki = items.filter(function (s) { return s.status !== 'Dipenuhi'; });
    if (!items.length) throw new Error('Tugasan tiada senarai semak; tidak boleh ditutup secara automatik.');
    if (baki.length) throw new Error('Belum boleh ditutup. Item belum dipenuhi: ' + baki.map(function (s) { return s.item; }).join(', '));
    if (t.status === 'Lengkap') return { taskId: t.taskId, status: 'Lengkap', nota: 'Sudah Lengkap sebelum ini.' };
    withLock_(function () {
      var tt = findById_('Tugasan', 'taskId', t.taskId);
      tt.status = 'Lengkap'; tt.closedAt = nowIso_();
      updateRow_('Tugasan', tt);
    });
    ctx.disentuh[t.taskId] = true;
    return { taskId: t.taskId, status: 'Lengkap' };
  },

  buka_semakan_guru: function (ctx, inp) {
    var j = ctx.job;
    var soalan = teks_(inp.soalan, 800);
    if (!soalan) throw new Error('Soalan wajib.');
    var pilihan = (Array.isArray(inp.pilihan) ? inp.pilihan : []).map(function (s) { return teks_(s, 120); }).filter(Boolean).slice(0, 4);
    var taskId = '';
    if (inp.taskId) { try { taskId = tugasanDalamSkop_(ctx, inp.taskId).taskId; } catch (e) { taskId = ''; } }

    // Satu kes terbuka bagi setiap kerja: proses semula mengemas kini kes yang sama (tiada kes berganda).
    var hasil = withLock_(function () {
      var sedia = readAll_('Kes').filter(function (k) { return k.jobId === j.jobId && k.status === 'Menunggu Guru'; })[0];
      if (sedia) {
        sedia.soalan = soalan; sedia.pilihan = JSON.stringify(pilihan); sedia.taskId = taskId || sedia.taskId; sedia.sebab = teks_(inp.sebab, 400);
        updateRow_('Kes', sedia);
        return { caseId: sedia.caseId, baharu: false };
      }
      var k = { caseId: id_('KES'), mode: j.mode, panitiaId: j.panitiaId, jobId: j.jobId, taskId: taskId,
        soalan: soalan, pilihan: JSON.stringify(pilihan), sebab: teks_(inp.sebab, 400), status: 'Menunggu Guru',
        jawapan: '', createdAt: nowIso_(), answeredAt: '', closedAt: '' };
      appendRow_('Kes', k);
      return { caseId: k.caseId, baharu: true };
    });
    ctx.kesDibuka = hasil.caseId;
    return { caseId: hasil.caseId, kesBaharu: hasil.baharu, nota: 'Kes Semakan Guru dibuka. Tugasan berkaitan kekal terbuka.' };
  },

  baca_status: function (ctx, inp) {
    if (inp.taskId) return ALAT.baca_senarai_semak(ctx, inp);
    var semak = readAll_('SenaraiSemak').filter(skopKerja_(ctx));
    var ids = Object.keys(ctx.disentuh);
    var tugasan = readAll_('Tugasan').filter(function (t) { return ids.indexOf(t.taskId) >= 0; })
      .map(function (t) { return ringkasTugasan_(t, semak); });
    var kes = readAll_('Kes').filter(function (k) { return k.jobId === ctx.job.jobId && k.status === 'Menunggu Guru'; })
      .map(function (k) { return { caseId: k.caseId, soalan: k.soalan }; });
    return { tugasanDisentuh: tugasan, kesTerbuka: kes };
  },

  selesai: function (ctx, inp) {
    ctx.selesai = true;
    ctx.ringkasan = teks_(inp.ringkasan, 600);
    return { ok: true };
  }
};

/** Pelaksana alat dengan had & log. Dipanggil oleh gelung ejen. */
function laksanaAlat_(ctx, nama, input) {
  ctx.panggilan++;
  var hasil, ralat = '';
  if (ctx.panggilan > EJEN.MAX_PANGGILAN_ALAT) {
    hasil = { ralat: 'Had panggilan alat dicapai. Panggil buka_semakan_guru atau selesai.' };
  } else if (!Object.prototype.hasOwnProperty.call(ALAT, nama)) {
    hasil = { ralat: 'Alat "' + nama + '" tidak dibenarkan.' };
  } else {
    try { hasil = ALAT[nama](ctx, input || {}); }
    catch (e) { hasil = { ralat: String(e && e.message || e) }; }
  }
  if (hasil && hasil.ralat) ralat = hasil.ralat;

  appendRow_('Sejarah', {
    logId: id_('LOG'), mode: ctx.job.mode, panitiaId: ctx.job.panitiaId, jobId: ctx.job.jobId,
    caseId: (hasil && hasil.caseId) || ctx.job.resumeCaseId || '',
    taskId: (input && input.taskId) || (hasil && hasil.taskId) || '',
    langkah: String(ctx.langkah), alat: nama, input: clip_(input || {}, 1500), hasil: clip_(hasil, 1500),
    sebab: teks_((input && (input.sebab || input.ringkasan)) || '', 400), ralat: clip_(ralat, 400), at: nowIso_()
  });
  return hasil;
}
