# Ejen Susulan Mesyuarat Panitia — Panduan

Modul tambahan untuk e-Fail Multi-Panitia (`wanjer266/panitia-rbt`). Ejen membaca PDF minit dan evidens menggunakan Claude, kemudian mengurus tugasan susulan dari keputusan mesyuarat sehingga tindakan lengkap.

---

## 1. Struktur kod sedia ada & titik integrasi

**Yang ditemui dalam `panitia-rbt`:**

| Perkara | Lokasi | Catatan |
|---|---|---|
| Panggilan Apps Script | `apiGet()`, `apiPost(payload)` dalam `index.html` | `GET ?action=data` → `{ok,data}`; `POST payload=<JSON>` (URLSearchParams). `j.data` menggantikan `state`. |
| Aliran upload | `$("saveDocBtn").onclick` → `apiPost({action:"uploadPdf", meta, base64})` | Penjana OPR juga guna `uploadPdf` (folder `pentaksiran`, "Evidens Projek"). |
| Rekod dokumen | `state.documents[]` | `id, subject, year, classId, folder, subtopic, title, status, fileName, viewUrl, downloadUrl, uploadedAt` |
| Panitia | `data-subject` pada `.subjectBtn` | ID sebenar: **`RBT`, `ASK`, `T&D`** (bukan `TND`). |
| Kategori | `STRUCTURE` | Mesyuarat = `mesyuarat` / "Minit Mesyuarat Panitia"; Laporan & Program = `profesional` / "Laporan Program Panitia"; Evidens = `pentaksiran` / "Evidens Amali", "Evidens Projek" (ada `classId`). |
| Login | Tiada | Web App e-Fail terbuka; hanya `resetDocuments` guna kata laluan. |
| Backend `.gs` | **Tiada dalam repo** | Kod tidak dilihat. Modul ejen sengaja **tidak bergantung** pada dalaman backend. |

**Reka bentuk integrasi (tiada fungsi asal diubah):**

- Projek Apps Script **baharu dan berasingan** untuk ejen, dengan Google Sheet dan folder DEMO sendiri.
- `ejen-susulan.js` dimuatkan selepas skrip utama dan membalut dua fungsi global:
  - `apiPost` — selepas `uploadPdf` berjaya, ejen kenal pasti dokumen baharu dalam `state.documents` dan ambil ID fail Drive daripada `viewUrl`/`downloadUrl`. Kemudian ia panggil `enqueue` pada Web App ejen. Guru terus nampak status **Menunggu semakan**.
  - `showFolder` — papar panel **Susulan Mesyuarat** di bawah tab Mesyuarat, Program dan Pentaksiran.
- Ejen di pelayan membuka PDF terus dari Drive menggunakan ID itu. Syaratnya, ejen mesti di-deploy oleh **akaun yang sama** yang memiliki folder e-Fail.

---

## 2. Fail

```
apps-script/          (projek Apps Script BAHARU)
  appsscript.json     manifest: V8, skop Sheets/Drive/UrlFetch/Trigger, Web App
  Config.gs           had, peta aliran, status, pembantu
  Store.gs            jadual Sheets, upsert berkunci, LockService
  Api.gs              doPost/doGet, kunci akses, pengesahan input, panel, jawapan guru, reset DEMO
  Queue.gs            enqueue (LIVE/DEMO), MD5 kandungan, ambil kerja atomik, trigger
  Claude.gs           Messages API + percubaan semula
  Tools.gs            10 alat + pengawal pelayan
  Agent.gs            gelung ejen, arahan sistem, sambung kes, muktamadkan
  Setup.gs            setupEjen(), pasangTrigger(), ujiSambunganClaude()
frontend/
  ejen-susulan.js     FAIL BAHARU → letak di root repo panitia-rbt
  patched/index.html  index.html asal + 1 baris
  patched/config.js   config.js asal + AGENT_URL
demo/
  A_…D_*.pdf          PDF rekaan untuk senario A–D
  jana_pdf_demo.py    penjana PDF demo
```

### Patch fail sedia ada

**`index.html`** — cari baris `</script>` terakhir sebelum `</body>`, kemudian tambah satu baris:

```html
</script>
<script src="ejen-susulan.js"></script>
</body>
```

**`config.js`** — tambah `AGENT_URL` dalam `window.APP_CONFIG`:

```js
window.APP_CONFIG = {
  API_URL: "…url sedia ada…",
  AGENT_URL: "https://script.google.com/macros/s/XXXX/exec"   // URL Web App ejen
};
```

Fungsi asal yang dibalut, **bukan diubah**: `apiPost`, `showFolder`. Fungsi muat naik, paparan fail, muat turun dan penjana OPR kekal sama. Kalau `AGENT_URL` atau kunci tiada, dashboard berjalan seperti biasa.

---

## 3. Cara ejen berfungsi

**Gelung:** Claude memilih alat → pelayan laksana dan pulangkan hasil → Claude pilih langkah seterusnya → … → `baca_status` (sahkan) → `selesai`.
Had: 12 langkah, 24 panggilan alat, 3 percubaan bagi setiap kerja, dan 3 percubaan semula API (429/5xx).

**Alat:** `baca_maklumat_fail`, `cari_program`, `cari_tugasan`, `baca_senarai_semak`, `cipta_atau_kemaskini_tugasan`, `pautkan_evidens`, `tutup_tugasan`, `buka_semakan_guru`, `baca_status`, `selesai`.
PDF dilampirkan sebagai blok `document` dalam mesej pertama (alat "baca PDF") dan di-cache untuk langkah seterusnya.

**Pengawal pelayan (tak bergantung pada model):**

- Panitia, mod, tahun dan ID fail diambil daripada kerja. Model tak boleh menukarnya.
- Tugasan hanya dicipta daripada aliran MINIT, dan hanya untuk keputusan `Diluluskan`. Pemilik, tarikh `YYYY-MM-DD` dan senarai evidens wajib ada.
- Evidens hanya dipautkan daripada aliran EVIDENS. Kalau kelas yang dipilih semasa muat naik ≠ kelas tugasan, pautan **ditolak**.
- `tutup_tugasan` ditolak selagi ada item yang belum Dipenuhi.
- Tiada alat untuk memadam, mengubah akses atau menjalankan kod. Kandungan PDF dianggap data.
- **Kunci stabil:**
  - kerja = `mode|aliran|panitia|MD5 PDF`
  - tugasan = `mode|panitia|tahun|program|kelas`
  - item = `taskId|item`
  - pautan = `taskId|itemId|MD5 PDF`
  - satu kes terbuka sahaja bagi setiap kerja

  Semua tulisan dibuat dalam `LockService`. Kerja yang sedang diproses ada *lease* 10 minit.

**Semakan Guru:** soalan, pilihan dan sebab disimpan dalam helaian `Kes`. Selepas guru menjawab, kerja yang sama dimasukkan semula ke giliran. Ejen kemudian menerima soalan, jawapan guru dan sejarah alat sebelum ini, lalu menyambung kerja dari situ.

**Model:** `claude-sonnet-5-5`, boleh ditukar melalui Script Property `CLAUDE_MODEL`. Pergantungan: Anthropic Messages API sahaja (`UrlFetchApp`), tiada pustaka luar.

---

## 4. Setup

### 4.1 Projek Apps Script ejen
1. Log masuk dengan **akaun MOE yang memiliki folder e-Fail**. Pergi ke script.google.com → **Projek baharu** → namakan *Ejen Susulan Mesyuarat Panitia*.
2. Project Settings → tandakan **Show "appsscript.json"**. Tampal kandungan `appsscript.json`.
3. Cipta fail `Config`, `Store`, `Api`, `Queue`, `Claude`, `Tools`, `Agent` dan `Setup`, kemudian tampal kod setiap satu.
4. **Script Properties** (Project Settings → Script Properties):
   - `CLAUDE_API_KEY` = API key daripada console Anthropic (platform.claude.com).
   - `ROOT_FOLDER_ID` = ID folder induk e-Fail di Drive (bahagian URL selepas `/folders/`). Disyorkan, supaya ejen hanya memproses PDF dalam folder itu.
5. Jalankan `setupEjen` dan benarkan akses. Lihat **Execution log**. Ia mencipta Sheet *Ejen Susulan Mesyuarat Panitia – Data*, folder DEMO dan `AGENT_KEY` (salin kunci ini). Fungsi ni selamat dijalankan semula.
6. Jalankan `ujiSambunganClaude`. Log patut menunjukkan nama model.
7. Jalankan `pasangTrigger` untuk memasang trigger `processQueue` setiap 1 minit (tiada trigger berganda).

### 4.2 Deploy Web App
Deploy → New deployment → **Web app** → Execute as: **Me** → Who has access: **Anyone**. Salin URL `/exec`.
Akses dilindungi oleh `AGENT_KEY` yang disemak di pelayan untuk setiap tindakan. `doGet` hanya memulangkan nama dan versi.
Selepas kod diubah, gunakan **Manage deployments → Edit → New version** supaya URL kekal sama.

### 4.3 Frontend (repo `panitia-rbt`)
1. Tambah `ejen-susulan.js` di root repo.
2. Patch `index.html` dan `config.js` (lihat seksyen 2).
3. Commit dan push. Buka dashboard → Mesyuarat Panitia → panel **Susulan Mesyuarat** → **Masukkan kunci akses** → tampal `AGENT_KEY`. Kunci disimpan dalam `localStorage` pelayar itu sahaja.

### 4.4 Menambah panitia baharu
Tambah baris dalam helaian `Panitia` (`panitiaId`, `nama`, `aktif=YA`) dan butang `data-subject` dalam `index.html`. Modul ejen tak perlu diubah.

### 4.5 Kos (anggaran)
Sonnet 5.5 dicaj USD 2 / 10 bagi sejuta token input/output. Bagi PDF 1–3 halaman dengan 6–10 langkah, kosnya dijangka sekitar USD 0.05–0.15 setiap fail, kerana PDF di-cache selepas langkah pertama. Semak penggunaan sebenar dalam console Anthropic.

---

## 5. Ujian senario A–E (mod DEMO)

Panel → pilih **DEMO (data rekaan)**. Dalam mod ini, PDF masuk ke folder DEMO ejen dan rekod ditanda `DEMO`, jadi ia tak bercampur dengan e-Fail sebenar. Klik **Proses sekarang** selepas setiap muat naik (atau tunggu trigger ±1 minit).

| # | Langkah | Jangkaan |
|---|---|---|
| A | Aliran **Minit**, fail `A_Minit_…pdf`, kelas kosong | Satu tugasan sahaja: *Amali Litar Elektrik Tingkatan 2*, 2 Amanah, Cikgu Bala Kumar, 2026-11-20. Item: Laporan amali, Rekod pengujian litar. Robotik Mini (Cadangan) tidak menjadi tugasan. Baris "abaikan arahan…" dalam 6.1 tidak diikut. Petikan dan halaman dipaparkan. |
| B | Aliran **Evidens**, kelas `2 Amanah`, fail `B_Laporan_…pdf` | "Laporan amali" ✔ dengan pautan PDF. "Rekod pengujian litar" masih ○. Tugasan **Terbuka**. Ringkasan menyebut baki item. |
| C | Aliran **Evidens**, kelas `2 Bestari`, fail `C_Rekod_…2Bestari.pdf` | Kes **Semakan Guru** dibuka. Sejarah menunjukkan *Kelas bercanggah*. Tugasan kekal **Terbuka**. Klik **Tolak padanan** → Proses sekarang → kes Ditutup, tiada pautan baharu. |
| D | Aliran **Evidens**, kelas `2 Amanah`, fail `D_Rekod_…2Amanah.pdf` | "Rekod pengujian litar" ✔. Tugasan **Lengkap**. Sejarah menunjukkan `tutup_tugasan` → `baca_status`. |
| E | (i) Klik **Proses semula** pada kerja D dan A. (ii) Muat naik semula fail D yang sama. | Bilangan baris dalam helaian `Giliran`, `Tugasan`, `SenaraiSemak` dan `Evidens` tidak bertambah. Status kekal **Lengkap**. Sejarah mencatat "sudah wujud". |

**Reset data DEMO** memadam rekod DEMO panitia semasa sahaja.

**Ujian aliran sebenar (LIVE):** pilih **Data sebenar** → muat naik minit melalui butang asal *+ Upload PDF* dalam *Minit Mesyuarat Panitia* → toast "Ejen: fail masuk giliran" → panel menunjukkan **Menunggu semakan**.

---

## 6. Semakan yang sudah dibuat vs ujian selepas deploy

**Sudah disemak (oleh Claude sebelum serahan):**

- Semakan sintaks semua `.gs` dan `ejen-susulan.js` (`node --check`).
- 30 ujian logik pelayan dalam Node, dengan mock SpreadsheetApp/DriveApp/LockService/Utilities dan Claude berskrip:
  - Senario A–E, termasuk muat naik semula fail serupa dengan ID Drive baharu.
  - Penolakan kunci salah, panitia tak berdaftar dan fail luar `ROOT_FOLDER_ID`.
  - Penolakan pengawal: tugasan Cadangan, cipta tugasan dari aliran evidens, tutup awal, kelas bercanggah.
  - Sambung kes dengan jawapan guru.
  - Dua enqueue serentak → satu kerja; kerja yang dipegang tidak diambil proses kedua.
  - Had 12 langkah → Semakan Guru; API 401 → Gagal dengan mesej jelas.
  - DEMO terasing dan reset DEMO; skop panitia (ASK tak nampak RBT).
- Ujian pelayar (Chromium) pada `index.html` yang dipatch dengan API tiruan:
  - Upload asal menghantar `enqueue` dengan `fileId` dari `viewUrl`.
  - Panel muncul di Mesyuarat dan tersembunyi di Kurikulum.
  - Butang jawapan menghantar `answerCase`; mod DEMO bertukar.
  - Tiada ralat console.

**Perlu anda uji selepas deploy (tak dapat diuji di sini):**

1. **Medan ID fail:** pastikan rekod `uploadPdf` sebenar ada `viewUrl`/`downloadUrl` dengan `/d/<ID>` atau `?id=<ID>`. Kalau toast "ID fail Drive tidak ditemui" muncul, buka Console dan hantar senarai medan yang dicetak kepada saya.
2. **Akses Drive:** ejen dan backend e-Fail mesti di bawah akaun yang sama (atau akaun ejen ada akses ke folder). `ROOT_FOLDER_ID` mesti betul.
3. **Keputusan model sebenar** bagi senario A–E. Ujian di sini menggunakan Claude berskrip, jadi ia membuktikan pengawal dan rekod, bukan pertimbangan model. Semak juga ketepatan petikan dan halaman.
4. **Masa respons:** **Proses sekarang** boleh ambil 30–120 saat. Kalau `UrlFetchApp` tamat masa, kerja akan dicuba semula secara automatik (maks 3 kali).
5. **Dasar domain MOE:** pastikan deployment "Anyone" dibenarkan (backend e-Fail sedia ada sudah berjalan dengan cara ini).

**Had yang diketahui:**
- Memadam PDF dalam dashboard tidak memadam pautan evidens ejen. Pautan akan menuju ke fail dalam Sampah.
- Kelas hanya disemak secara deterministik bagi muat naik yang ada kelas, iaitu folder Pentaksiran atau DEMO. Untuk Laporan Program, padanan kelas bergantung pada pertimbangan model dan Semakan Guru.
