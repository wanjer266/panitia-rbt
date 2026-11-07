/**
 * Ejen Susulan — Panggilan Claude Messages API
 * Model lalai: claude-sonnet-5-5 (boleh ditukar melalui Script Property CLAUDE_MODEL).
 * PDF dihantar sebagai blok "document" base64; awalan (tools + system + PDF) di-cache
 * supaya setiap langkah gelung tidak membayar harga penuh untuk PDF.
 */

function panggilClaude_(system, messages, tools) {
  var apiKey = prop_('CLAUDE_API_KEY');
  if (!apiKey) { var e = new Error('CLAUDE_API_KEY belum ditetapkan dalam Script Properties.'); e.muktamad = true; throw e; }

  var body = {
    model: prop_('CLAUDE_MODEL') || EJEN.MODEL_LALAI,
    max_tokens: EJEN.MAX_TOKENS,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    tools: tools,
    tool_choice: { type: 'auto' },
    messages: messages
  };

  var ralatAkhir = '';
  for (var cubaan = 0; cubaan < EJEN.MAX_CUBAAN_API; cubaan++) {
    var res;
    try {
      res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        payload: JSON.stringify(body),
        muteHttpExceptions: true
      });
    } catch (netErr) {
      ralatAkhir = 'Rangkaian: ' + netErr.message;
      Utilities.sleep(2000 * Math.pow(2, cubaan));
      continue;
    }
    var code = res.getResponseCode();
    var text = res.getContentText();
    if (code === 200) return JSON.parse(text);

    var mesej = text;
    try { mesej = JSON.parse(text).error.message; } catch (x) {}
    ralatAkhir = 'Claude API ' + code + ': ' + clip_(mesej, 300);

    if (code === 429 || code === 529 || code >= 500) {
      Utilities.sleep(3000 * Math.pow(2, cubaan));
      continue;
    }
    // 400/401/403/404/413: tidak akan berjaya jika dicuba semula.
    var fatal = new Error(ralatAkhir);
    fatal.muktamad = true;
    throw fatal;
  }
  throw new Error(ralatAkhir || 'Claude API tidak memberi respons.');
}
