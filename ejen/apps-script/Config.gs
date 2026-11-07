/**
 * Ejen Susulan Mesyuarat Panitia — Konfigurasi
 * Projek Apps Script BERASINGAN daripada backend e-Fail sedia ada.
 * Semua rahsia disimpan dalam Script Properties (bukan dalam kod).
 *
 * Script Properties:
 *   CLAUDE_API_KEY   (wajib)  API key Anthropic
 *   CLAUDE_MODEL     (pilihan) lalai: claude-sonnet-5-5
 *   AGENT_KEY        (wajib)  kunci akses panel; dijana oleh setupEjen()
 *   SHEET_ID         (auto)   Google Sheet data ejen; dicipta oleh setupEjen()
 *   DEMO_FOLDER_ID   (auto)   folder Drive untuk PDF DEMO; dicipta oleh setupEjen()
 *   ROOT_FOLDER_ID   (disyorkan) ID folder induk e-Fail; ejen hanya proses PDF di bawahnya
 */

/** Folder induk e-Fail (sama seperti ROOT_FOLDER_ID dalam backend e-Fail). Script Property ROOT_FOLDER_ID mengatasi nilai ini. */
var ROOT_FOLDER_ID_LALAI = '1AXYqFzVWNJdnaUbQPaH8P9JS1x1hY1I2';

var EJEN = {
  VERSI: '1.0.0',
  MODEL_LALAI: 'claude-sonnet-5-5',
  MAX_TOKENS: 2048,
  MAX_LANGKAH: 12,          // pusingan model -> alat bagi satu kerja
  MAX_PANGGILAN_ALAT: 24,   // jumlah panggilan alat bagi satu kerja
  MAX_CUBAAN: 3,            // percubaan semula kerja yang gagal
  MAX_CUBAAN_API: 3,        // percubaan semula panggilan Claude (429/5xx)
  MAX_PDF_BAIT: 10 * 1024 * 1024,
  LEASE_MINIT: 10,          // kerja "Diproses" lebih lama dari ini dianggap tergantung
  BAJET_MASA_MS: 4.5 * 60 * 1000,
  ZON_MASA: 'Asia/Kuala_Lumpur'
};

/**
 * Peta aliran: folder + subtajuk dashboard -> aliran ejen.
 * Nilai folder/subtajuk diambil terus daripada STRUCTURE dalam index.html.
 * Tidak bergantung pada panitia; panitia dikawal oleh helaian "Panitia".
 */
var ALIRAN = [
  { aliran: 'MINIT',   folder: 'mesyuarat',   subtajuk: ['Minit Mesyuarat Panitia'] },
  { aliran: 'EVIDENS', folder: 'profesional', subtajuk: ['Laporan Program Panitia'] },
  { aliran: 'EVIDENS', folder: 'pentaksiran', subtajuk: ['Evidens Amali', 'Evidens Projek'] }
];

/** Lokasi lalai bagi muat naik DEMO (tidak masuk ke e-Fail sebenar). */
var DEMO_LOKASI = {
  MINIT:   { folder: 'mesyuarat',   subtajuk: 'Minit Mesyuarat Panitia' },
  EVIDENS: { folder: 'pentaksiran', subtajuk: 'Evidens Amali' }
};

var STATUS_KERJA = {
  MENUNGGU: 'Menunggu semakan',
  DIPROSES: 'Diproses',
  SELESAI: 'Selesai',
  SEMAKAN_GURU: 'Semakan Guru',
  GAGAL: 'Gagal'
};

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function setProp_(k, v) { PropertiesService.getScriptProperties().setProperty(k, v); }

function nowIso_() { return new Date().toISOString(); }
function id_(prefix) { return prefix + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10); }

/** Normalisasi untuk kunci & padanan: huruf kecil, tanpa simbol, ruang tunggal. */
function norm_(s) {
  return String(s == null ? '' : s).toLowerCase()
    .replace(/&/g, ' dan ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
/** Normalisasi kelas: "2 Amanah", "2-AMANAH", "2amanah" -> "2amanah" */
function normKelas_(s) { return norm_(s).replace(/\s+/g, ''); }

function tentukanAliran_(folder, subtajuk) {
  for (var i = 0; i < ALIRAN.length; i++) {
    var a = ALIRAN[i];
    if (a.folder === folder && a.subtajuk.indexOf(subtajuk) >= 0) return a.aliran;
  }
  return null;
}

function panitiaAktif_(panitiaId) {
  var rows = readAll_('Panitia');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].panitiaId) === String(panitiaId) && String(rows[i].aktif).toUpperCase() === 'YA') return true;
  }
  return false;
}

function senaraiPanitia_() {
  return readAll_('Panitia')
    .filter(function (p) { return String(p.aktif).toUpperCase() === 'YA'; })
    .map(function (p) { return { panitiaId: String(p.panitiaId), nama: String(p.nama) }; });
}
