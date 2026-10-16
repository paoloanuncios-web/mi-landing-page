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
  const URL_RE = /(\/graphql|\/api\/|\/ajax\/bulk-route-definitions|\/ajax\/navigation)/;

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
})();
