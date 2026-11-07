/**
 * Ejen Susulan — Setup (selamat dijalankan berulang kali)
 * 1. setupEjen()          -> cipta/lengkapkan Sheet, helaian, panitia lalai, folder DEMO, AGENT_KEY
 * 2. pasangTrigger()      -> trigger processQueue setiap 1 minit (tiada trigger berganda)
 * 3. ujiSambunganClaude() -> semak API key & model
 */

function setupEjen() {
  var props = PropertiesService.getScriptProperties();
  var log = [];

  // Spreadsheet data ejen
  var ssId = props.getProperty('SHEET_ID');
  var ss = null;
  if (ssId) { try { ss = SpreadsheetApp.openById(ssId); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('Ejen Susulan Dokumen Panitia – Data');
    props.setProperty('SHEET_ID', ss.getId());
    log.push('Sheet baharu dicipta: ' + ss.getUrl());
  } else {
    log.push('Sheet sedia ada: ' + ss.getUrl());
  }
  _ssCache = ss;

  Object.keys(JADUAL).forEach(function (nama) {
    var sh = ss.getSheetByName(nama) || ss.insertSheet(nama);
    var mahu = JADUAL[nama];
    var lastCol = Math.max(sh.getLastColumn(), 1);
    var ada = sh.getRange(1, 1, 1, lastCol).getValues()[0].filter(String);
    if (!ada.length) {
      sh.getRange(1, 1, 1, mahu.length).setNumberFormat('@').setValues([mahu]).setFontWeight('bold');
      sh.setFrozenRows(1);
      log.push('Helaian ' + nama + ' disediakan.');
    } else {
      // Tambah lajur yang tiada di hujung sahaja; tidak memadam atau menyusun semula data.
      for (var i = 0; i < mahu.length; i++) {
        if (ada[i] !== mahu[i]) {
          if (ada.indexOf(mahu[i]) >= 0) throw new Error('Susunan lajur helaian ' + nama + ' telah diubah. Pulihkan susunan: ' + mahu.join(', '));
          if (i < ada.length) throw new Error('Lajur "' + ada[i] + '" dalam helaian ' + nama + ' tidak dijangka.');
          sh.getRange(1, i + 1).setNumberFormat('@').setValue(mahu[i]).setFontWeight('bold');
          ada.push(mahu[i]);
          log.push('Lajur ' + mahu[i] + ' ditambah ke ' + nama + '.');
        }
      }
    }
  });
  var lalai = ss.getSheetByName('Sheet1') || ss.getSheetByName('Helaian1');
  if (lalai && ss.getSheets().length > 1 && lalai.getLastRow() === 0) ss.deleteSheet(lalai);

  // Panitia lalai (ID mesti sama dengan data-subject dalam index.html)
  var adaPanitia = readAll_('Panitia').map(function (p) { return p.panitiaId; });
  [['RBT', 'Reka Bentuk dan Teknologi'], ['ASK', 'Asas Sains Komputer'], ['T&D', 'T&D']]
    .forEach(function (p) {
      if (adaPanitia.indexOf(p[0]) < 0) { appendRow_('Panitia', { panitiaId: p[0], nama: p[1], aktif: 'YA' }); log.push('Panitia ' + p[0] + ' ditambah.'); }
    });

  // Folder DEMO (berasingan daripada folder e-Fail sebenar)
  var demoId = props.getProperty('DEMO_FOLDER_ID');
  var demoOk = false;
  if (demoId) { try { DriveApp.getFolderById(demoId); demoOk = true; } catch (e) {} }
  if (!demoOk) {
    var f = DriveApp.createFolder('Ejen Susulan – DEMO (data rekaan)');
    props.setProperty('DEMO_FOLDER_ID', f.getId());
    log.push('Folder DEMO dicipta: ' + f.getUrl());
  }

  if (!props.getProperty('AGENT_KEY')) {
    var key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    props.setProperty('AGENT_KEY', key);
    log.push('AGENT_KEY dijana: ' + key + '  (salin ke panel Susulan Dokumen)');
  } else {
    log.push('AGENT_KEY sedia ada (lihat Script Properties).');
  }
  if (!props.getProperty('CLAUDE_MODEL')) { props.setProperty('CLAUDE_MODEL', EJEN.MODEL_LALAI); log.push('CLAUDE_MODEL = ' + EJEN.MODEL_LALAI); }
  if (!props.getProperty('CLAUDE_API_KEY')) log.push('PERHATIAN: tetapkan CLAUDE_API_KEY dalam Project Settings > Script Properties.');
  var rootId = props.getProperty('ROOT_FOLDER_ID') || ROOT_FOLDER_ID_LALAI;
  try { log.push('Folder induk e-Fail: ' + DriveApp.getFolderById(rootId).getName()); }
  catch (e) { log.push('PERHATIAN: folder induk e-Fail (' + rootId + ') tidak dapat dibuka oleh akaun ini.'); }

  Logger.log(log.join('\n'));
  return log;
}

function pasangTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processQueue') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processQueue').timeBased().everyMinutes(1).create();
  Logger.log('Trigger processQueue dipasang (setiap 1 minit).');
}

function ujiSambunganClaude() {
  var res = panggilClaude_('Balas dengan satu perkataan.', [{ role: 'user', content: 'Balas: OK' }], [
    { name: 'selesai', description: 'Tamat', input_schema: { type: 'object', properties: { ringkasan: { type: 'string' } }, required: ['ringkasan'] } }
  ]);
  Logger.log('Model: ' + res.model + ' | stop_reason: ' + res.stop_reason + ' | ' + JSON.stringify(res.content).slice(0, 300));
}
