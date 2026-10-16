/*
 * TopFeed Pro — interceptor (mundo MAIN de la página).
 * Copia las respuestas de la API interna de cada red (las mismas que usa la web
 * para dibujar el feed) y se las pasa al content script. No modifica nada.
 */
(function () {
  'use strict';
  if (window.__topfeedInjected) return;
  window.__topfeedInjected = true;

  const TAG = '__topfeed_pro__';
  const MAX = 25 * 1024 * 1024;
  const URL_RE = /(\/graphql|\/api\/|\/youtubei\/|\/ajax\/bulk-route-definitions|\/ajax\/navigation)/;

  function wanted(url) {
    try { return URL_RE.test(new URL(url, location.href).pathname); } catch (e) { return false; }
  }

  function send(url, text) {
    if (!text || text.length > MAX) return;
    const c = text.charCodeAt(0);
    // Solo JSON ("{", "[" o el prefijo "for (;;);" de Facebook).
    if (c !== 123 && c !== 91 && text.indexOf('for (;;);') !== 0) return;
    window.postMessage({ source: TAG, url: String(url), text: text }, location.origin);
  }

  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      const p = origFetch.apply(this, arguments);
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (wanted(url)) {
          p.then(res => {
            try {
              const ct = res.headers.get('content-type') || '';
              if (/image|video|audio|octet/.test(ct)) return;
              res.clone().text().then(t => send(url, t)).catch(() => {});
            } catch (e) { /* ignorar */ }
          }).catch(() => {});
        }
      } catch (e) { /* ignorar */ }
      return p;
    };
  }

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    try {
      if (wanted(url)) {
        this.addEventListener('load', function () {
          try {
            if (this.responseType === '' || this.responseType === 'text') send(url, this.responseText);
            else if (this.responseType === 'json' && this.response) send(url, JSON.stringify(this.response));
          } catch (e) { /* ignorar */ }
        });
      }
    } catch (e) { /* ignorar */ }
    return origOpen.apply(this, arguments);
  };

  // YouTube: completar likes, fecha exacta y vistas exactas pidiendo cada video a la API interna
  // (/youtubei/v1/player). La respuesta pasa por el fetch de arriba y llega sola al content script.
  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data || e.data.source !== TAG + '_cmd' || e.data.cmd !== 'yt-enrich') return;
    const cfg = window.ytcfg;
    const ctx = cfg && cfg.get && cfg.get('INNERTUBE_CONTEXT');
    const key = cfg && cfg.get && cfg.get('INNERTUBE_API_KEY');
    const ids = (e.data.ids || []).slice(0, 1000);
    const report = (done, error) => window.postMessage({ source: TAG + '_progress', done, total: ids.length, error: error || null }, location.origin);
    if (!ctx) return report(0, 'No encontré la configuración de YouTube. Recargá la página.');
    let next = 0, done = 0;
    async function worker() {
      while (next < ids.length) {
        const id = ids[next++];
        try {
          await window.fetch('/youtubei/v1/player?prettyPrint=false' + (key ? '&key=' + encodeURIComponent(key) : ''), {
            method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ context: ctx, videoId: id, contentCheckOk: true, racyCheckOk: true })
          }).then((r) => r.text());
        } catch (err) { /* un video que falla no frena el resto */ }
        done++;
        if (done % 5 === 0 || done === ids.length) report(done);
        await new Promise((r) => setTimeout(r, 120 + Math.random() * 200));
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    report(ids.length);
  });
})();
