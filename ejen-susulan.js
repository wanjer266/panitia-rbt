/* Ejen Susulan Mesyuarat Panitia — modul frontend
 * Dimuatkan SELEPAS skrip utama index.html. Tidak mengubah fungsi asal:
 *  - membalut apiPost()  : selepas uploadPdf berjaya, hantar fail ke giliran ejen
 *  - membalut showFolder(): papar panel "Susulan Mesyuarat" dalam tab Mesyuarat / Program / Pentaksiran
 * Menggunakan global sedia ada: state, currentSubject, currentYear, currentFolder, apiGet, toast, esc, $
 */
(function () {
  "use strict";
  var AGENT_URL = (window.APP_CONFIG && window.APP_CONFIG.AGENT_URL) || "";
  if (AGENT_URL.indexOf("PASTE_") >= 0) AGENT_URL = "";
  var FOLDER_PANEL = ["mesyuarat", "profesional", "pentaksiran"];
  // Mesti sepadan dengan ALIRAN dalam Config.gs (pelayan tetap mengesahkan).
  var SKOP_UPLOAD = {
    "mesyuarat": ["Minit Mesyuarat Panitia"],
    "profesional": ["Laporan Program Panitia"],
    "pentaksiran": ["Evidens Amali", "Evidens Projek"]
  };

  function simpan(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function baca(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }

  var mod = baca("ejenMode") === "DEMO" ? "DEMO" : "LIVE";
  var kunci = baca("ejenKey");
  var dataPanel = null, pemasaPoll = null, sedangMuat = false;

  /* ---------- Tera air DEMO (syarat pertandingan) ----------
   * Dipaparkan pada SELURUH halaman apabila mod DEMO dipilih dalam panel,
   * atau apabila URL mengandungi ?demo=1. Tidak menghalang klik (pointer-events: none).
   */
  var paksaDemo = /[?&]demo=1\b/.test(location.search);
  function kemaskiniTeraAir() {
    var aktif = paksaDemo || mod === "DEMO";
    var wm = document.getElementById("ejenTeraAir");
    var bn = document.getElementById("ejenBannerDemo");
    if (!aktif) { if (wm) wm.remove(); if (bn) bn.remove(); return; }
    if (!wm) {
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240">' +
        '<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" transform="rotate(-30 180 120)" ' +
        'font-family="Arial, sans-serif" font-size="64" font-weight="900" fill="rgb(220,38,38)" fill-opacity="0.13">DEMO</text></svg>';
      wm = document.createElement("div");
      wm.id = "ejenTeraAir";
      wm.setAttribute("aria-hidden", "true");
      wm.style.cssText = "position:fixed;inset:0;z-index:99998;pointer-events:none;background-repeat:repeat;" +
        "background-image:url(\"data:image/svg+xml;utf8," + encodeURIComponent(svg) + "\")";
      document.body.appendChild(wm);
    }
    if (!bn) {
      bn = document.createElement("div");
      bn.id = "ejenBannerDemo";
      bn.setAttribute("role", "status");
      bn.textContent = "DEMO — Ejen Susulan Mesyuarat Panitia • data rekaan untuk pertandingan";
      bn.style.cssText = "position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:99999;pointer-events:none;" +
        "background:#dc2626;color:#fff;font:800 13px/1 Inter,Arial,sans-serif;letter-spacing:.04em;" +
        "padding:7px 16px;border-radius:0 0 10px 10px;box-shadow:0 4px 14px rgba(0,0,0,.18)";
      document.body.appendChild(bn);
    }
  }
  kemaskiniTeraAir();

  async function ejen(payload) {
    if (!AGENT_URL) throw new Error("AGENT_URL belum ditetapkan dalam config.js.");
    if (!kunci) throw new Error("Masukkan kunci akses ejen dalam panel Susulan Mesyuarat.");
    var body = new URLSearchParams();
    payload.key = kunci;
    body.set("payload", JSON.stringify(payload));
    var r = await fetch(AGENT_URL, { method: "POST", body: body, redirect: "follow" });
    var txt = await r.text(), j;
    try { j = JSON.parse(txt); } catch (e) { throw new Error("Respons ejen tidak sah: " + txt.slice(0, 120)); }
    if (!j.ok) throw new Error(j.error || "Operasi ejen gagal.");
    return j.data;
  }

  /* ---------- 1. Sambungan pada aliran upload sebenar ---------- */

  function cariFileId(d) {
    if (!d) return "";
    var keys = ["fileId", "driveFileId", "driveId", "file_id", "gid"];
    for (var i = 0; i < keys.length; i++) if (d[keys[i]] && /^[-\w]{20,}$/.test(String(d[keys[i]]))) return String(d[keys[i]]);
    var urls = [d.viewUrl, d.previewUrl, d.downloadUrl, d.url];
    for (var u = 0; u < urls.length; u++) {
      var s = String(urls[u] || ""), m = s.match(/\/d\/([-\w]{20,})/) || s.match(/[?&]id=([-\w]{20,})/);
      if (m) return m[1];
    }
    return "";
  }

  async function hantarUploadKeEjen(meta, idSebelum) {
    if (!meta || !SKOP_UPLOAD[meta.folder] || SKOP_UPLOAD[meta.folder].indexOf(meta.subtopic) < 0) return;
    if (!AGENT_URL || !kunci) { toast("PDF disimpan. Ejen belum disambung (tetapkan kunci dalam panel Susulan Mesyuarat)."); return; }
    var docs = (state.documents || []);
    var baru = docs.filter(function (d) { return !idSebelum.has(String(d.id)); });
    if (!baru.length) { await apiGet(); docs = state.documents || []; baru = docs.filter(function (d) { return !idSebelum.has(String(d.id)); }); }
    var calon = baru.filter(function (d) {
      return (d.subject || "RBT") === meta.subject && d.folder === meta.folder && d.subtopic === meta.subtopic && d.title === meta.title;
    }).sort(function (a, b) { return new Date(b.uploadedAt) - new Date(a.uploadedAt); });
    var doc = calon[0] || baru[0];
    var fileId = cariFileId(doc);
    if (!fileId) {
      console.warn("Ejen: medan rekod dokumen =", doc ? Object.keys(doc) : "(tiada dokumen baharu)");
      toast("Ejen: ID fail Drive tidak ditemui dalam rekod dokumen. Semak console.");
      return;
    }
    var kelas = "";
    if (meta.classId) { var c = (state.classes || []).find(function (x) { return String(x.id) === String(meta.classId); }); kelas = c ? c.name : ""; }
    var hasil = await ejen({ action: "enqueue", panitiaId: meta.subject, docId: String(doc.id || ""), fileId: fileId,
      folder: meta.folder, subtopic: meta.subtopic, classId: meta.classId ? String(meta.classId) : "", className: kelas,
      title: meta.title, fileName: meta.fileName, year: String(meta.year || currentYear) });
    if (hasil && hasil.diabaikan) return;
    toast("Ejen: fail masuk giliran — Menunggu semakan.");
    if (mod === "LIVE") muatPanel();
  }

  var apiPostAsal = window.apiPost;
  if (typeof apiPostAsal === "function") {
    window.apiPost = async function (payload) {
      var idSebelum = new Set(((state && state.documents) || []).map(function (d) { return String(d.id); }));
      var res = await apiPostAsal.apply(this, arguments);
      if (payload && payload.action === "uploadPdf") {
        hantarUploadKeEjen(payload.meta, idSebelum).catch(function (e) { console.error(e); toast("Ejen: " + e.message); });
      }
      return res;
    };
  }

  var showFolderAsal = window.showFolder;
  if (typeof showFolderAsal === "function") {
    window.showFolder = async function (id) {
      var r = await showFolderAsal.apply(this, arguments);
      paparPanel(id);
      return r;
    };
  }

  /* ---------- 2. Panel Susulan Mesyuarat ---------- */

  var css = document.createElement("style");
  css.textContent = [
    "#ejenPanel .ejenBar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}",
    "#ejenPanel .ejenDemo{border:2px dashed var(--warn);background:#fffaf0;border-radius:12px;padding:12px;margin-bottom:12px}",
    "#ejenPanel .ejenDemo b{color:var(--warn)}",
    "#ejenPanel .ejenGrid{display:grid;grid-template-columns:1fr 1fr;gap:14px}",
    "@media(max-width:900px){#ejenPanel .ejenGrid{grid-template-columns:1fr}}",
    "#ejenPanel h4{margin:6px 0 8px;font-size:14px}",
    "#ejenPanel .chk{font-size:12px;margin:3px 0}",
    "#ejenPanel .chk.ok{color:var(--ok)} #ejenPanel .chk.no{color:var(--warn)}",
    "#ejenPanel .quote{font-size:12px;color:#4d5870;border-left:3px solid var(--line);padding-left:8px;margin:6px 0;font-style:italic}",
    "#ejenPanel details{margin-top:6px;font-size:12px} #ejenPanel details summary{cursor:pointer;color:var(--primary)}",
    "#ejenPanel .log{border-top:1px dashed var(--line);padding:4px 0} #ejenPanel .log code{font-size:11px;background:#eef1f5;padding:1px 5px;border-radius:5px}",
    "#ejenPanel .log.err{color:var(--danger)}",
    "#ejenPanel .kes{border-color:var(--warn);background:#fffaf0}",
    "#ejenPanel textarea{width:100%;min-height:54px;margin-top:6px}"
  ].join("\n");
  document.head.appendChild(css);

  function pastikanPanel() {
    var p = document.getElementById("ejenPanel");
    if (p) return p;
    p = document.createElement("div");
    p.id = "ejenPanel";
    p.className = "panel";
    $("folderView").appendChild(p);
    return p;
  }

  function badge(s) {
    var cls = (s === "Lengkap" || s === "Selesai" || s === "Dipenuhi" || s === "Ditutup") ? "status-complete"
      : (s === "Semakan Guru" || s === "Gagal" || s === "Menunggu Guru" || s === "Diperlukan") ? "status-update" : "status-draft";
    return '<span class="statusBadge ' + cls + '">' + esc(s || "-") + "</span>";
  }
  function pautanDrive(fileId, label, cls) {
    if (!fileId) return esc(label || "");
    return '<a ' + (cls ? 'class="' + cls + '" ' : "") + 'href="https://drive.google.com/file/d/' + encodeURIComponent(fileId) + '/view" target="_blank" rel="noopener noreferrer">' + esc(label || "PDF") + "</a>";
  }
  function tarikh(iso) { return iso ? formatDate(iso) : ""; }

  function htmlLog(logs) {
    if (!logs.length) return "";
    return "<details><summary>Sejarah tindakan ejen (" + logs.length + ")</summary>" + logs.map(function (l) {
      return '<div class="log' + (l.ralat ? " err" : "") + '"><code>' + esc(l.alat) + "</code> langkah " + esc(l.langkah) +
        " • " + esc(l.sebab || "") + (l.ralat ? "<br>Ditolak: " + esc(l.ralat) : "") + '<div class="meta">' + tarikh(l.at) + "</div></div>";
    }).join("") + "</details>";
  }

  function paparPanel(folder) {
    var p = pastikanPanel();
    if (FOLDER_PANEL.indexOf(folder) < 0) { p.classList.add("hidden"); hentiPoll(); return; }
    p.classList.remove("hidden");
    lukis();
    muatPanel();
  }

  function lukis() {
    var p = pastikanPanel(), d = dataPanel;
    var bar = '<div class="panelHead"><h3>Susulan Mesyuarat</h3>' +
      (mod === "DEMO" ? '<span class="badge warn">MOD DEMO</span>' : '<span class="badge">' + esc(currentSubject) + "</span>") + "</div>" +
      '<div class="ejenBar">' +
      '<select id="ejenMode" class="control"><option value="LIVE">Data sebenar</option><option value="DEMO">DEMO (data rekaan)</option></select>' +
      '<button class="btn small" id="ejenKeyBtn">' + (kunci ? "Tukar kunci akses" : "Masukkan kunci akses") + "</button>" +
      '<button class="btn small" id="ejenRefresh">Muat semula</button>' +
      '<button class="btn primary small" id="ejenRunNow">Proses sekarang</button>' +
      '<span class="meta" id="ejenInfo"></span></div>';

    var demo = "";
    if (mod === "DEMO") {
      demo = '<div class="ejenDemo"><b>MOD DEMO</b> — data rekaan untuk pertandingan. PDF disimpan dalam folder DEMO ejen dan rekod ditanda DEMO; tidak bercampur dengan e-Fail sebenar.' +
        '<div class="ejenBar" style="margin-top:8px">' +
        '<select id="ejenDemoAliran" class="control"><option value="MINIT">Minit Mesyuarat</option><option value="EVIDENS">Evidens / Laporan Program</option></select>' +
        '<input id="ejenDemoKelas" class="control" placeholder="Kelas (cth. 2 Razi)">' +
        '<input id="ejenDemoFile" class="control" type="file" accept="application/pdf">' +
        '<button class="btn primary small" id="ejenDemoHantar">Hantar ke ejen</button>' +
        '<button class="btn small danger" id="ejenDemoReset">Reset data DEMO</button></div></div>';
    }

    var isi;
    if (!AGENT_URL) isi = '<div class="empty">Tetapkan AGENT_URL dalam config.js untuk mengaktifkan ejen.</div>';
    else if (!kunci) isi = '<div class="empty">Masukkan kunci akses ejen (AGENT_KEY) untuk melihat susulan.</div>';
    else if (!d) isi = '<div class="empty">Memuatkan…</div>';
    else isi = lukisIsi(d);

    p.innerHTML = bar + demo + isi;
    $("ejenMode").value = mod;
    pasangAcara();
  }

  function lukisIsi(d) {
    var logs = d.sejarah || [];
    var kesTerbuka = (d.kes || []).filter(function (k) { return k.status === "Menunggu Guru"; });
    var kesHtml = kesTerbuka.length ? kesTerbuka.map(function (k) {
      var job = (d.kerja || []).find(function (j) { return j.jobId === k.jobId; }) || {};
      return '<div class="listItem kes"><div class="listTitle">Semakan Guru: ' + esc(job.namaFail || job.tajuk || k.jobId) + "</div>" +
        '<div class="notes">' + esc(k.soalan) + "</div>" + (k.sebab ? '<div class="meta">Sebab ejen: ' + esc(k.sebab) + "</div>" : "") +
        '<div class="actions">' + (k.pilihan || []).map(function (op) {
          return '<button class="btn small ejenJawab" data-case="' + esc(k.caseId) + '" data-jawapan="' + esc(op) + '">' + esc(op) + "</button>";
        }).join("") +
        '<button class="btn small danger ejenJawab" data-case="' + esc(k.caseId) + '" data-jawapan="Guru menolak padanan ini. Jangan pautkan fail ini kepada tugasan tersebut.">Tolak padanan</button></div>' +
        '<textarea class="control" id="ejenTxt_' + esc(k.caseId) + '" placeholder="Atau tulis jawapan khusus…"></textarea>' +
        '<button class="btn primary small ejenJawabTeks" data-case="' + esc(k.caseId) + '">Hantar jawapan</button>' +
        htmlLog(logs.filter(function (l) { return l.jobId === k.jobId; })) + "</div>";
    }).join("") : '<div class="empty">Tiada kes menunggu guru.</div>';

    var tugasan = (d.tugasan || []).slice().sort(function (a, b) { return (a.status === "Lengkap") - (b.status === "Lengkap") || String(a.tarikhAkhir).localeCompare(String(b.tarikhAkhir)); });
    var tgsHtml = tugasan.length ? tugasan.map(function (t) {
      var items = (t.senaraiSemak || []).map(function (s) {
        var ev = (t.evidens || []).filter(function (e) { return e.itemId === s.itemId; });
        return '<div class="chk ' + (s.status === "Dipenuhi" ? "ok" : "no") + '">' + (s.status === "Dipenuhi" ? "✔ " : "○ ") + esc(s.item) +
          (ev.length ? " — " + ev.map(function (e) { return pautanDrive(e.fileId, e.namaFail) + (e.halaman ? " (hlm. " + esc(e.halaman) + ")" : ""); }).join(", ") : "") + "</div>" +
          ev.filter(function (e) { return e.petikan; }).map(function (e) { return '<div class="quote">“' + esc(e.petikan) + "”</div>"; }).join("");
      }).join("");
      return '<div class="listItem"><div class="listTitle">' + esc(t.program) + (t.kelas ? " • " + esc(t.kelas) : "") + "</div>" +
        '<div class="meta">Pemilik: ' + esc(t.pemilik) + " • Tarikh akhir: " + esc(t.tarikhAkhir) + " • " + esc(t.tahun) + "</div>" +
        '<div class="statusRow">' + badge(t.status) + "</div>" +
        (t.petikan ? '<div class="quote">Minit' + (t.halaman ? " hlm. " + esc(t.halaman) : "") + ": “" + esc(t.petikan) + "”</div>" : "") +
        '<div style="margin-top:6px">' + (items || '<div class="meta">Tiada senarai semak.</div>') + "</div>" +
        htmlLog(logs.filter(function (l) { return l.taskId === t.taskId; })) + "</div>";
    }).join("") : '<div class="empty">Belum ada tugasan susulan.</div>';

    var kerjaHtml = (d.kerja || []).length ? d.kerja.map(function (j) {
      return '<div class="listItem"><div class="listTitle">' + esc(j.namaFail || j.tajuk) + "</div>" +
        '<div class="meta">' + esc(j.aliran === "MINIT" ? "Minit mesyuarat" : "Evidens") + (j.kelas ? " • " + esc(j.kelas) : "") +
        " • diproses " + esc(j.kaliProses || 0) + "x • " + tarikh(j.updatedAt) + "</div>" +
        '<div class="statusRow">' + badge(j.status) + "</div>" +
        (j.ringkasan ? '<div class="notes">' + esc(j.ringkasan) + "</div>" : "") +
        (j.lastError ? '<div class="notes" style="color:var(--danger)">' + esc(j.lastError) + "</div>" : "") +
        '<div class="actions">' + pautanDrive(j.fileId, "Buka PDF", "btn small") +
        (j.status !== "Diproses" ? ' <button class="btn small ejenSemula" data-job="' + esc(j.jobId) + '">Proses semula</button>' : "") + "</div>" +
        htmlLog(logs.filter(function (l) { return l.jobId === j.jobId; })) + "</div>";
    }).join("") : '<div class="empty">Tiada fail dalam giliran.</div>';

    return "<h4>Semakan Guru</h4><div class=\"list\">" + kesHtml + "</div>" +
      '<div class="ejenGrid"><div><h4>Tugasan susulan</h4><div class="list">' + tgsHtml + "</div></div>" +
      '<div><h4>Giliran & tindakan ejen</h4><div class="list">' + kerjaHtml + "</div></div></div>";
  }

  function pasangAcara() {
    $("ejenMode").onchange = function (e) { mod = e.target.value === "DEMO" ? "DEMO" : "LIVE"; simpan("ejenMode", mod); kemaskiniTeraAir(); dataPanel = null; lukis(); muatPanel(); };
    $("ejenKeyBtn").onclick = function () {
      var k = prompt("Masukkan kunci akses ejen (AGENT_KEY daripada Script Properties):", "");
      if (k === null) return;
      kunci = k.trim(); simpan("ejenKey", kunci); dataPanel = null; lukis(); muatPanel();
    };
    $("ejenRefresh").onclick = function () { muatPanel(); };
    $("ejenRunNow").onclick = async function (e) {
      var b = e.target; b.disabled = true; b.textContent = "Ejen sedang memproses…";
      try { dataPanel = await ejen({ action: "processNow", panitiaId: currentSubject, mode: mod }); lukis(); jadualPoll(); }
      catch (err) { toast(err.message); } finally { b.disabled = false; b.textContent = "Proses sekarang"; }
    };
    document.querySelectorAll("#ejenPanel .ejenJawab").forEach(function (b) {
      b.onclick = function () { jawab(b.getAttribute("data-case"), b.getAttribute("data-jawapan")); };
    });
    document.querySelectorAll("#ejenPanel .ejenJawabTeks").forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute("data-case"), t = document.getElementById("ejenTxt_" + id);
        if (!t || !t.value.trim()) return toast("Tulis jawapan dahulu.");
        jawab(id, t.value.trim());
      };
    });
    document.querySelectorAll("#ejenPanel .ejenSemula").forEach(function (b) {
      b.onclick = async function () {
        try { dataPanel = await ejen({ action: "reprocess", jobId: b.getAttribute("data-job"), panitiaId: currentSubject, mode: mod }); lukis(); toast("Fail dimasukkan semula ke giliran."); jadualPoll(); }
        catch (err) { toast(err.message); }
      };
    });
    if (mod === "DEMO") {
      $("ejenDemoHantar").onclick = hantarDemo;
      $("ejenDemoReset").onclick = async function () {
        if (!confirm("Padam SEMUA rekod DEMO bagi panitia " + currentSubject + "? Data sebenar tidak terjejas.")) return;
        try { dataPanel = await ejen({ action: "resetDemo", panitiaId: currentSubject }); lukis(); toast("Data DEMO direset."); }
        catch (err) { toast(err.message); }
      };
    }
  }

  async function jawab(caseId, jawapan) {
    try { dataPanel = await ejen({ action: "answerCase", caseId: caseId, jawapan: jawapan, panitiaId: currentSubject, mode: mod }); lukis(); toast("Jawapan disimpan. Ejen akan menyambung kes ini."); jadualPoll(); }
    catch (err) { toast(err.message); }
  }

  async function hantarDemo() {
    var f = $("ejenDemoFile").files[0];
    if (!f) return toast("Pilih PDF DEMO.");
    if (f.size > 10 * 1024 * 1024) return toast("Maksimum 10 MB.");
    var b = $("ejenDemoHantar"); b.disabled = true; b.textContent = "Menghantar…";
    try {
      var base64 = await fileToBase64(f);
      await ejen({ action: "demoUpload", panitiaId: currentSubject, aliran: $("ejenDemoAliran").value,
        className: $("ejenDemoKelas").value.trim(), fileName: f.name, title: f.name.replace(/\.pdf$/i, ""), base64: base64 });
      toast("DEMO: fail masuk giliran — Menunggu semakan.");
      await muatPanel(); jadualPoll();
    } catch (err) { toast(err.message); } finally { b.disabled = false; b.textContent = "Hantar ke ejen"; }
  }

  async function muatPanel() {
    if (!AGENT_URL || !kunci || sedangMuat) return;
    var p = document.getElementById("ejenPanel");
    if (!p || p.classList.contains("hidden")) return;
    sedangMuat = true;
    try { dataPanel = await ejen({ action: "list", panitiaId: currentSubject, mode: mod }); lukis(); jadualPoll(); }
    catch (err) { var i = $("ejenInfo"); if (i) i.textContent = err.message; }
    finally { sedangMuat = false; }
  }

  function hentiPoll() { if (pemasaPoll) { clearTimeout(pemasaPoll); pemasaPoll = null; } }
  function jadualPoll() {
    hentiPoll();
    var aktif = dataPanel && (dataPanel.kerja || []).some(function (j) { return j.status === "Menunggu semakan" || j.status === "Diproses"; });
    if (aktif) pemasaPoll = setTimeout(function () {
      var vis = document.getElementById("ejenPanel");
      if (vis && !vis.classList.contains("hidden") && !$("folderView").classList.contains("hidden")) muatPanel();
    }, 20000);
  }
})();
