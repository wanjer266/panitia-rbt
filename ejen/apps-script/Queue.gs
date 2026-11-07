/**
 * Ejen Susulan — Giliran pemprosesan
 * Kunci kerja stabil = mode | aliran | panitia | MD5 kandungan PDF
 *  -> muat naik semula fail yang sama TIDAK mencipta kerja baharu; kerja sedia ada diproses semula.
 */

function md5Hex_(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, bytes)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function dalamFolderInduk_(file, rootId) {
  var tahap = [file.getParents()];
  for (var d = 0; d < 10 && tahap.length; d++) {
    var seterusnya = [];
    for (var i = 0; i < tahap.length; i++) {
      var it = tahap[i];
      while (it.hasNext()) {
        var f = it.next();
        if (f.getId() === rootId) return true;
        seterusnya.push(f.getParents());
      }
    }
    tahap = seterusnya;
  }
  return false;
}

/** Aliran sebenar: dipanggil oleh frontend selepas uploadPdf berjaya. */
function enqueueLive_(p) {
  var panitiaId = panitiaWajib_(p.panitiaId);
  var folder = str_(p.folder, 40, true, 'folder');
  var subtajuk = str_(p.subtopic, 120, true, 'subtopic');
  var aliran = tentukanAliran_(folder, subtajuk);
  if (!aliran) return { diabaikan: true, sebab: 'Folder ini bukan sebahagian daripada Fail Utama.' };

  var fileId = str_(p.fileId, 100, true, 'fileId');
  if (!/^[-\w]{20,}$/.test(fileId)) throw new Error('ID fail Drive tidak sah.');

  var file;
  try { file = DriveApp.getFileById(fileId); } catch (e) { throw new Error('Fail Drive tidak dapat dibuka oleh ejen. Pastikan ejen di-deploy oleh akaun pemilik folder e-Fail.'); }
  if (file.isTrashed()) throw new Error('Fail berada dalam Sampah.');
  if (file.getMimeType() !== 'application/pdf') throw new Error('Hanya PDF diproses.');
  if (file.getSize() > EJEN.MAX_PDF_BAIT) throw new Error('PDF melebihi 10 MB.');
  var root = prop_('ROOT_FOLDER_ID') || ROOT_FOLDER_ID_LALAI;
  if (root && !dalamFolderInduk_(file, root)) throw new Error('Fail bukan dalam folder e-Fail yang dibenarkan.');

  var hash = md5Hex_(file.getBlob().getBytes());
  return enqueueJob_({
    mode: 'LIVE', panitiaId: panitiaId, aliran: aliran,
    docId: str_(p.docId, 60, false, 'docId'), fileId: fileId, contentHash: hash,
    folder: folder, subtajuk: subtajuk,
    classId: str_(p.classId, 60, false, 'classId'), kelas: str_(p.className, 60, false, 'className'),
    tajuk: str_(p.title, 200, false, 'title'), namaFail: str_(p.fileName || file.getName(), 200, false, 'fileName'),
    tahun: str_(p.year, 4, false, 'year')
  });
}

/** Mod DEMO: PDF disimpan dalam folder DEMO ejen sahaja, bukan dalam e-Fail sebenar. */
function enqueueDemo_(p) {
  var panitiaId = panitiaWajib_(p.panitiaId);
  var aliran = str_(p.aliran, 10, true, 'aliran');
  if (!DEMO_LOKASI[aliran]) throw new Error('Aliran DEMO tidak sah.');
  if (aliran === 'MINIT') aliran = 'ARAHAN';
  var b64 = p.base64;
  if (typeof b64 !== 'string' || !b64) throw new Error('PDF DEMO tiada.');
  var bytes;
  try { bytes = Utilities.base64Decode(b64); } catch (e) { throw new Error('PDF DEMO rosak.'); }
  if (bytes.length > EJEN.MAX_PDF_BAIT) throw new Error('PDF melebihi 10 MB.');
  var head = String.fromCharCode.apply(null, bytes.slice(0, 5).map(function (b) { return b & 0xff; }));
  if (head !== '%PDF-') throw new Error('Fail bukan PDF yang sah.');

  var namaFail = str_(p.fileName, 200, true, 'fileName').replace(/[\\/:*?"<>|]/g, '_');
  var hash = md5Hex_(bytes);
  var folderId = prop_('DEMO_FOLDER_ID');
  if (!folderId) throw new Error('Folder DEMO belum disediakan. Jalankan setupEjen().');

  // Jika fail sama sudah ada sebagai kerja DEMO, guna semula fail Drive sedia ada.
  var jobKey = ['DEMO', aliran, panitiaId, hash].join('|');
  var sedia = readAll_('Giliran').filter(function (j) { return j.jobKey === jobKey; })[0];
  var fileId = sedia ? sedia.fileId : DriveApp.getFolderById(folderId)
    .createFile(Utilities.newBlob(bytes, 'application/pdf', '[DEMO] ' + namaFail)).getId();

  var lok = DEMO_LOKASI[aliran];
  return enqueueJob_({
    mode: 'DEMO', panitiaId: panitiaId, aliran: aliran, docId: '', fileId: fileId, contentHash: hash,
    folder: lok.folder, subtajuk: lok.subtajuk, classId: '',
    kelas: str_(p.className, 60, false, 'className'), tajuk: str_(p.title, 200, false, 'title') || namaFail,
    namaFail: namaFail, tahun: String(new Date().getFullYear())
  });
}

function enqueueJob_(j) {
  var jobKey = [j.mode, j.aliran, j.panitiaId, j.contentHash].join('|');
  var r = upsertByKey_('Giliran', 'jobKey', jobKey, function () {
    var o = {};
    for (var k in j) o[k] = j[k];
    o.jobId = id_('JOB');
    o.status = STATUS_KERJA.MENUNGGU;
    o.cubaan = '0';
    o.kaliProses = '0';
    o.createdAt = nowIso_();
    o.updatedAt = nowIso_();
    return o;
  }, function (sedia) {
    // Fail sama dimuat naik semula: proses semula kerja yang sama (tiada kerja berganda).
    if (sedia.status !== STATUS_KERJA.DIPROSES) {
      sedia.status = STATUS_KERJA.MENUNGGU;
      sedia.cubaan = '0';
      sedia.lastError = '';
      sedia.leaseUntil = '';
      sedia.resumeCaseId = '';
    }
    if (!sedia.docId && j.docId) sedia.docId = j.docId;
    if (j.kelas) sedia.kelas = j.kelas;
  });
  return { jobId: r.rekod.jobId, status: r.rekod.status, baharu: r.baharu };
}

/** Ambil satu kerja secara atomik. Kerja "Diproses" yang lease-nya tamat diambil semula. */
function ambilKerja_() {
  return withLock_(function () {
    var now = new Date();
    var rows = readAll_('Giliran').filter(function (j) {
      if (j.status === STATUS_KERJA.MENUNGGU) return true;
      return j.status === STATUS_KERJA.DIPROSES && j.leaseUntil && new Date(j.leaseUntil) < now;
    }).sort(function (a, b) { return a.updatedAt < b.updatedAt ? -1 : 1; });

    for (var i = 0; i < rows.length; i++) {
      var j = rows[i];
      var cubaan = Number(j.cubaan || 0) + 1;
      if (cubaan > EJEN.MAX_CUBAAN) {
        j.status = STATUS_KERJA.GAGAL;
        j.lastError = 'Melebihi had ' + EJEN.MAX_CUBAAN + ' percubaan. ' + (j.lastError || '') + ' Perlu semakan guru.';
        updateRow_('Giliran', j);
        continue;
      }
      j.cubaan = String(cubaan);
      j.kaliProses = String(Number(j.kaliProses || 0) + 1);
      j.status = STATUS_KERJA.DIPROSES;
      j.leaseUntil = new Date(now.getTime() + EJEN.LEASE_MINIT * 60000).toISOString();
      updateRow_('Giliran', j);
      return j;
    }
    return null;
  });
}

/** Pengendali trigger masa (setiap 1 minit). */
function processQueue() { prosesGiliran_(20); }

function prosesGiliran_(maks) {
  var mula = Date.now();
  for (var n = 0; n < maks; n++) {
    if (Date.now() - mula > EJEN.BAJET_MASA_MS) break;
    var job = ambilKerja_();
    if (!job) break;
    try {
      jalankanEjen_(job);
    } catch (err) {
      console.error(err && err.stack || err);
      tandaRalatKerja_(job, err);
    }
  }
}

function tandaRalatKerja_(job, err) {
  withLock_(function () {
    var j = findById_('Giliran', 'jobId', job.jobId);
    if (!j) return;
    var muktamad = (err && err.muktamad) || Number(j.cubaan || 0) >= EJEN.MAX_CUBAAN;
    j.status = muktamad ? STATUS_KERJA.GAGAL : STATUS_KERJA.MENUNGGU;
    j.lastError = clip_(String(err && err.message || err), 400) + (muktamad ? ' Perlu semakan guru.' : ' Akan dicuba semula.');
    j.leaseUntil = '';
    updateRow_('Giliran', j);
  });
}
