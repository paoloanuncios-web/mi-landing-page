/*
 * TopFeed Pro — content script: recolecta datos y dibuja el panel.
 */
(function () {
  'use strict';
  if (window.__tfContent) return;
  window.__tfContent = true;

  const X = globalThis.TFExtract;
  const A = globalThis.TFAnalytics;
  const platform = X.platformOf(location.hostname);
  if (!platform) return;

  const TAG = '__topfeed_pro__';
  const NAMES = { instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', youtube: 'YouTube' };
  const store = new X.Store();
  const fmt = A.fmt;

  // ---------- recolección ----------

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data) return;
    if (e.data.source === TAG + '_progress') return onEnrichProgress(e.data);
    if (e.data.source !== TAG) return;
    X.ingestText(e.data.text, store, platform);
    if (isBS) savePrivate(X.bsExtractText(e.data.text));
    if ((platform === 'instagram' || isBS) && e.data.text.length < 3e6) {
      rawLog.push({ url: String(e.data.url).slice(0, 160), text: e.data.text });
      if (rawLog.length > 25) rawLog.shift();
    }
    changed();
  });
  const rawLog = [];

  // ---------- Estadísticas privadas (Meta Business Suite → tabla de Instagram) ----------
  const isBS = location.hostname === 'business.facebook.com';
  let privateMap = {};
  function loadPrivate() {
    try {
      chrome.storage.local.get(['tf_private'], (r) => {
        privateMap = (r && r.tf_private) || {};
        st.bsCount = Object.keys(privateMap).length;
        lastVersion = -1; changed();
      });
    } catch (e) { /* sin contexto */ }
  }
  function savePrivate(found) {
    if (!found || !found.size) return;
    chrome.storage.local.get(['tf_private'], (r) => {
      const map = (r && r.tf_private) || {};
      found.forEach((m, code) => { map[code] = Object.assign(map[code] || {}, m, { updatedAt: Date.now() }); });
      chrome.storage.local.set({ tf_private: map });
    });
  }
  try {
    chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.tf_private) loadPrivate(); });
  } catch (e) { /* sin contexto */ }

  function bsDiagnostic() {
    const out = { pagina: location.pathname + location.search.slice(0, 80), estadisticasGuardadas: Object.keys(privateMap).length,
      respuestas: [], metricas: {}, ejemplo: null };
    const keyRe = /"([A-Za-z_]*(?:reach|impression|play|save|share|follow|profile|click|watch|view|alcance)[A-Za-z_]*)"\s*:/gi;
    for (const r of rawLog) {
      const links = (r.text.match(/instagram\.com\\?\/(?:[^\/"]+\\?\/)?(?:p|reel)\\?\/[A-Za-z0-9_-]+/g) || []).length;
      out.respuestas.push(r.url.replace(/[?].*/, '') + ' · ' + Math.round(r.text.length / 1024) + ' KB · ' + links + ' links IG');
      let m; while ((m = keyRe.exec(r.text))) out.metricas[m[1]] = (out.metricas[m[1]] || 0) + 1;
      if (!out.ejemplo && links) {
        const i = r.text.search(/instagram\.com\\?\/(?:[^\/"]+\\?\/)?(?:p|reel)\\?\//);
        out.ejemplo = r.text.slice(Math.max(0, i - 1500), i + 1500).replace(/https?:[^"]{60,}/g, '[url]');
      }
      // Ejemplos alrededor de las métricas (para ver cómo identifica Meta cada post).
      if (!out.ejemplosMetricas) out.ejemplosMetricas = [];
      let idx = r.text.indexOf('"reach"'), guard = 0;
      while (idx !== -1 && out.ejemplosMetricas.length < 2 && guard++ < 20) {
        const win = r.text.slice(Math.max(0, idx - 1800), idx + 700).replace(/https?:[^"]{60,}/g, '[url]').replace(/"[A-Za-z0-9+/=_-]{80,}"/g, '"[largo]"');
        out.ejemplosMetricas.push(win);
        idx = r.text.indexOf('"reach"', idx + 4000);
      }
    }
    // Filas de la tabla de Meta: qué celdas tiene cada una (para ver cómo identifica el post).
    out.filas = [];
    for (const r of rawLog) {
      if (out.filas.length >= 2 || r.text.indexOf('"reach"') === -1) continue;
      let t = r.text.trim(); if (t.startsWith('for (;;);')) t = t.slice(9);
      const parts = []; try { parts.push(JSON.parse(t)); } catch (e) { t.split(/\r?\n/).forEach((l) => { try { parts.push(JSON.parse(l)); } catch (e2) { /* nada */ } }); }
      parts.forEach((j) => X.walk(j, (o) => {
        if (out.filas.length >= 2 || !o.reach || typeof o.reach !== 'object' || !o.reach.renderer) return;
        const fila = {};
        for (const k in o) {
          if (k.indexOf('__') === 0) continue;
          const v = o[k];
          const num = v && v.renderer && v.renderer.result && v.renderer.result.value;
          fila[k] = num != null ? num : JSON.stringify(v).replace(/https?:[^"]{60,}/g, '[url]').replace(/"__[a-z_]+":"[^"]*",?/gi, '').slice(0, 350);
        }
        out.filas.push(fila);
      }));
    }
    delete out.ejemplosMetricas;
    return JSON.stringify(out, null, 1).slice(0, 9000);
  }

  // Instagram muestra las vistas en cada miniatura de la pestaña Reels. Si la API no las trae,
  // las leemos de la pantalla: <a href="/usuario/reel/CODIGO/"> con el número adentro.
  function igViewsFromDom() {
    if (platform !== 'instagram') return 0;
    const byCode = new Map();
    for (const it of store.items.values()) {
      const m = (it.url || '').match(/\/(?:reel|p)\/([^/]+)/);
      if (m) byCode.set(m[1], it);
    }
    let n = 0;
    document.querySelectorAll('a[href*="/reel/"]').forEach((a) => {
      const m = a.getAttribute('href').match(/\/reel\/([^/?#]+)/);
      const it = m && byCode.get(m[1]);
      if (!it || it.views != null) return;
      const tokens = (a.innerText || '').split(/\n+/).map((t) => t.trim()).filter((t) => /^\d[\d.,]*\s*(mil|k|m|mill|millones)?$/i.test(t));
      if (!tokens.length) return;
      const v = X.parseCount(tokens[0]);
      if (v != null) { it.views = v; it.viewsFromScreen = true; n++; }
    });
    if (n) store.version++;
    return n;
  }

  // Diagnóstico para pegar en el chat: qué respuestas llegaron, qué trae cada "post" y qué hay en pantalla.
  function igDiagnostic() {
    const out = { pagina: location.pathname, filtro: st.filters.author, posts: store.items.size,
      autores: {}, respuestas: [], ejemplos: [], miniaturas: [] };
    for (const it of store.list()) out.autores[it.author || '(sin cuenta)'] = (out.autores[it.author || '(sin cuenta)'] || 0) + 1;
    for (const r of rawLog) {
      const codes = (r.text.match(/"code":"[A-Za-z0-9_-]{8,}"/g) || []).length;
      out.respuestas.push(r.url.replace(/[?].*/, '') + ' · ' + Math.round(r.text.length / 1024) + ' KB · ' + codes + ' códigos');
    }
    for (const r of rawLog.slice().reverse()) {
      if (out.ejemplos.length >= 2) break;
      const m = r.text.match(/"code":"([A-Za-z0-9_-]{8,})"/);
      if (!m) continue;
      const i = r.text.indexOf(m[0]);
      const win = r.text.slice(Math.max(0, i - 2500), i + 2500);
      const campos = {};
      const re = /"([A-Za-z_]{2,40})":\s*("[^"]{0,24}"|-?[\d.]+|null|true|false)/g;
      let k;
      while ((k = re.exec(win))) if (/count|view|play|taken|code|pk|user|media|product|like|comment/i.test(k[1])) campos[k[1]] = k[2];
      out.ejemplos.push({ code: m[1], campos });
    }
    document.querySelectorAll('a[href*="/reel/"]').forEach((a, n) => {
      if (n < 4) out.miniaturas.push(a.getAttribute('href') + ' → ' + (a.innerText || '').replace(/\s+/g, ' ').slice(0, 60));
    });
    return JSON.stringify(out, null, 1).slice(0, 6000);
  }


  // Facebook, YouTube y la pestaña Reels de Instagram no repiten la cuenta en cada post del perfil:
  // la completamos con la cuenta de la URL abierta.
  function fillPageAuthor() {
    const page = X.profileFromUrl(platform, location.pathname);
    if (!page) return;
    for (const it of store.items.values()) if (!it.author) it.author = page;
  }

  const scanned = new WeakSet();
  const DATA_RE = /taken_at|createTime|creation_time|play_count|playCount|follower_count|followerCount/;
  function scanPage() {
    const sel = 'script[type="application/json"], script#__UNIVERSAL_DATA_FOR_REHYDRATION__, script#SIGI_STATE, script#__NEXT_DATA__';
    document.querySelectorAll(sel).forEach((s) => {
      if (scanned.has(s)) return;
      scanned.add(s);
      const t = s.textContent;
      if (t && t.length < 40e6 && DATA_RE.test(t)) X.ingestText(t, store, platform);
    });
    if (platform === 'youtube') {
      document.querySelectorAll('script:not([src])').forEach((s) => {
        if (scanned.has(s)) return;
        const t = s.textContent;
        const i = t.indexOf('ytInitialData = ');
        if (i === -1) return;
        scanned.add(s);
        const start = t.indexOf('{', i), end = t.lastIndexOf('};');
        if (start !== -1 && end > start) X.ingestText(t.slice(start, end + 1), store, platform);
      });
    }
    changed();
  }

  // ---------- estado ----------

  const st = {
    open: false, tab: 'grid', sort: 'views', dir: 'desc', limit: 120,
    filters: { author: '', type: 'todos', from: '', to: '', minViews: 0, search: '', lastN: 0, hidePinned: false },
    authorManual: false, selected: new Set(), auto: null, viewing: null, compare: null,
    aiText: '', aiBusy: false, aiContext: '', settings: {}
  };

  function loadSettings() {
    try {
      chrome.storage.local.get(['defaultSort', 'autoTarget', 'aiContext', 'lastSort', 'lastDir'], (s) => {
        st.settings = s || {};
        if (s && s.defaultSort) st.sort = s.defaultSort;
        if (s && s.lastSort) { st.sort = s.lastSort; st.dir = s.lastDir || 'desc'; }
        if (s && s.aiContext) st.aiContext = s.aiContext;
      });
    } catch (e) { /* contexto de extensión invalidado */ }
  }
  loadSettings();
  loadPrivate();

  function syncAuthorFromUrl() {
    if (st.authorManual) return;
    const u = platform === 'facebook' ? null : X.profileFromUrl(platform, location.pathname);
    if (u !== null && u !== st.filters.author) {
      st.filters.author = u;
      st.selected.clear();
      loadCompare();
    }
  }

  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      st.authorManual = false;
      syncAuthorFromUrl();
      scanPage();
    }
  }, 800);

  // ---------- datos derivados ----------

  function source() { return st.viewing ? st.viewing.items : store.list(); }

  function currentProfile() {
    if (st.viewing) return st.viewing.profile || null;
    return store.profileOf(platform, st.filters.author);
  }

  function view() {
    if (!st.viewing) fillPageAuthor();
    const all = source();
    if (platform === 'instagram') X.applyPrivate(all, privateMap);
    const items = A.filterItems(all, st.filters);
    const prof = currentProfile();
    A.enrich(items, prof && prof.followers);
    if (st.compare && !st.viewing) A.compareSnapshot(items, st.compare);
    else items.forEach((i) => { i.growthViews = null; i.growthLikes = null; });
    return { all, items, sorted: A.sortItems(items, st.sort, st.dir), profile: prof };
  }

  function authors() {
    const m = new Map();
    for (const it of source()) if (it.author) m.set(it.author, (m.get(it.author) || 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }

  function countForAuthor() {
    const a = (st.filters.author || '').toLowerCase();
    return a ? store.list().filter((i) => (i.author || '').toLowerCase() === a).length : store.items.size;
  }

  // ---------- UI base ----------

  let host, root, ui = {};
  function mount() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'topfeed-pro-root';
    root = host.attachShadow({ mode: 'open' });
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(globalThis.TF_CSS);
      root.adoptedStyleSheets = [sheet];
    } catch (e) {
      const s = document.createElement('style');
      s.textContent = globalThis.TF_CSS;
      root.appendChild(s);
    }
    const wrap = document.createElement('div');
    wrap.className = 'tf';
    wrap.innerHTML =
      '<button class="launcher" data-act="toggle" title="Abrir TopFeed Pro">▲ TopFeed <span class="count">0</span></button>' +
      '<div class="overlay"><div class="panel">' +
      '<div class="head"></div><div class="progress"><div></div></div><div class="bar"></div><div class="tabs"></div>' +
      '<div class="status"></div><div class="body"></div></div></div><div class="toast"></div>';
    root.appendChild(wrap);
    ui = {
      wrap, launcher: wrap.querySelector('.launcher'), count: wrap.querySelector('.launcher .count'),
      overlay: wrap.querySelector('.overlay'), panel: wrap.querySelector('.panel'), head: wrap.querySelector('.head'),
      progress: wrap.querySelector('.progress > div'), bar: wrap.querySelector('.bar'), tabs: wrap.querySelector('.tabs'),
      status: wrap.querySelector('.status'), body: wrap.querySelector('.body'), toast: wrap.querySelector('.toast')
    };
    wrap.addEventListener('click', onClick);
    wrap.addEventListener('change', onChange);
    wrap.addEventListener('input', onInput);
    root.addEventListener('error', (e) => {
      const t = e.target;
      if (t && t.tagName === 'IMG' && !t.dataset.failed) {
        t.dataset.failed = '1';
        const d = document.createElement('div');
        d.className = 'noimg';
        d.textContent = 'Sin vista previa';
        t.replaceWith(d);
      }
    }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && st.open) toggle(false); });
    (document.body || document.documentElement).appendChild(host);
    chrome.storage.local.get(['hideLauncher'], (s) => { if (s && s.hideLauncher) ui.launcher.classList.add('hidden'); });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function safeUrl(u) { return typeof u === 'string' && /^https:\/\//.test(u) ? u : ''; }

  function fdate(ms, withTime) {
    if (!ms) return '—';
    const d = new Date(ms);
    const s = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    return withTime ? s + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : s;
  }

  function pct(n) { return n == null ? '—' : n.toFixed(n < 10 ? 2 : 1).replace('.', ',') + '%'; }

  let toastTimer;
  function toast(msg, ms) {
    if (!ui.toast) return;
    ui.toast.textContent = msg;
    ui.toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('on'), ms || 3000);
  }

  function send(msg) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!res || !res.ok) return reject(new Error((res && res.error) || 'Error desconocido'));
          resolve(res.data);
        });
      } catch (e) { reject(new Error('Recargá la página: la extensión se actualizó.')); }
    });
  }

  // ---------- render ----------

  let changeTimer;
  function changed() {
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => {
      fillPageAuthor();
      igViewsFromDom();
      if (!host) return;
      const n = countForAuthor();
      ui.count.textContent = fmt(n);
      send({ type: 'setBadge', count: n }).catch(() => {});
      if (st.open && !st.viewing) renderLive();
    }, 350);
  }

  // Re-render "suave" cuando llegan datos nuevos: conserva el scroll.
  let lastVersion = -1;
  function renderLive() {
    if (store.version === lastVersion) return;
    lastVersion = store.version;
    if (st.tab === 'ai' || st.tab === 'history') { renderHead(); renderStatus(view()); return; }
    render();
  }

  function rememberSort() {
    try { chrome.storage.local.set({ lastSort: st.sort, lastDir: st.dir }); } catch (e) { /* sin contexto */ }
  }

  function render() {
    if (!host) return;
    rememberSort();
    const top = ui.body.scrollTop;
    const v = view();
    renderHead(v);
    renderBar();
    renderTabs();
    renderStatus(v);
    const fn = { grid: renderGrid, table: renderTable, analytics: renderAnalytics, accounts: renderAccounts, ai: renderAI, history: renderHistory }[st.tab];
    fn(v);
    ui.body.scrollTop = top;
  }

  function renderHead(v) {
    v = v || view();
    const p = v.profile;
    const handle = st.filters.author;
    const prof = handle
      ? '<div class="profile">' + (p && safeUrl(p.avatar) ? '<img src="' + esc(p.avatar) + '" alt="">' : '') +
        '<div><div class="h">@' + esc(handle) + (p && p.verified ? ' ✔' : '') + '</div><div class="s">' +
        (p && p.followers != null ? fmt(p.followers) + ' seguidores' : 'seguidores s/d') +
        (p && p.posts != null ? ' · ' + fmt(p.posts) + ' posts' : '') + '</div></div></div>'
      : '<div class="profile"><div><div class="h">' + NAMES[platform] + '</div><div class="s">Todas las cuentas</div></div></div>';
    const auto = st.auto;
    ui.head.innerHTML =
      '<div class="logo">▲ TopFeed Pro</div>' + prof +
      (st.viewing ? '<span class="btn sm" title="Estás viendo un snapshot guardado">📦 Snapshot ' + esc(fdate(st.viewing.savedAt, true)) + '</span>' +
        '<button class="btn sm" data-act="exit-snapshot">Volver a datos en vivo</button>' : '') +
      '<div class="spacer"></div>' +
      (!st.viewing ? (auto
        ? '<button class="btn danger" data-act="stop-auto">■ Frenar (' + fmt(countForAuthor()) + '/' + (auto.target === Infinity ? '∞' : fmt(auto.target)) + ')</button>'
        : '<select data-set="autoTarget" title="Cuántos posts cargar">' +
          [24, 50, 100, 200, 500, 1000, 0].map((n) => '<option value="' + n + '"' +
            (String(st.settings.autoTarget || 100) === String(n) ? ' selected' : '') + '>' + (n ? n + ' posts' : 'Todos') + '</option>').join('') +
          '</select> <button class="btn primary" data-act="auto">⚡ Auto-cargar</button>') : '') +
      '<div class="menu" data-menu="export"><button class="btn" data-act="menu" data-menu-id="export">⬇ Exportar</button><div class="items">' +
      '<button data-act="export" data-fmt="xls">Excel (.xls)</button>' +
      '<button data-act="export" data-fmt="csv">CSV</button>' +
      '<button data-act="export" data-fmt="json">JSON</button>' +
      '<button data-act="export" data-fmt="sheets">Google Sheets (copiar y abrir)</button>' +
      '<button data-act="export" data-fmt="tsv">Copiar tabla al portapapeles</button>' +
      '<button data-act="export" data-fmt="links">Copiar links</button>' +
      '</div></div>' +
      (!st.viewing ? '<button class="btn" data-act="snapshot" title="Guardar para comparar el crecimiento más adelante">💾 Guardar</button>' : '') +
      '<div class="menu" data-menu="more"><button class="btn" data-act="menu" data-menu-id="more">⋯</button><div class="items">' +
      '<button data-act="rescan">Volver a leer la página</button>' +
      '<button data-act="clear">Borrar datos recolectados</button>' +
      '<button data-act="options">Opciones y claves de IA</button>' +
      (platform === 'instagram' ? '<button data-act="ig-diag">Copiar diagnóstico de vistas</button>' : '') +
      '</div></div>' +
      '<button class="btn" data-act="toggle" title="Cerrar (Esc)">✕</button>';
  }

  function sel(name, opts, val) {
    return '<select data-set="' + name + '">' + opts.map((o) =>
      '<option value="' + esc(o[0]) + '"' + (String(val) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
  }

  const SORT_OPTS = [
    ['views', 'Vistas'], ['likes', 'Likes / reacciones'], ['comments', 'Comentarios'], ['shares', 'Compartidos'],
    ['saves', 'Guardados'], ['interactions', 'Interacciones totales'], ['er', 'Engagement % (vistas)'],
    ['erFollowers', 'Engagement % (seguidores)'], ['outlier', 'Outlier (x mediana)'], ['viewsPerDay', 'Vistas por día'],
    ['growthViews', 'Crecimiento desde snapshot'], ['date', 'Fecha'], ['duration', 'Duración'],
    ['reach', '🔒 Alcance'], ['follows', '🔒 Seguidores nuevos'], ['profileVisits', '🔒 Visitas al perfil'], ['linkClicks', '🔒 Clics al link']
  ];

  function renderBar() {
    const f = st.filters;
    const au = authors();
    const auOpts = [['', 'Todas (' + source().length + ')']].concat(au.slice(0, 200).map((a) => [a[0], '@' + a[0] + ' (' + a[1] + ')']));
    if (f.author && !au.find((a) => a[0].toLowerCase() === f.author.toLowerCase())) auOpts.splice(1, 0, [f.author, '@' + f.author + ' (0)']);
    ui.bar.innerHTML =
      '<label>Ordenar ' + sel('sort', SORT_OPTS, st.sort) + '</label>' +
      '<button class="btn sm" data-act="dir" title="Cambiar orden">' + (st.dir === 'desc' ? '↓ Mayor a menor' : '↑ Menor a mayor') + '</button>' +
      '<label>Cuenta ' + sel('author', auOpts, f.author) + '</label>' +
      '<label>Tipo ' + sel('type', [['todos', 'Todos'], ['reel', 'Reels'], ['video', 'Videos'], ['short', 'Shorts'], ['vivo', 'En vivo'], ['foto', 'Fotos'], ['carrusel', 'Carruseles'], ['texto', 'Texto']], f.type) + '</label>' +
      '<label>Desde <input type="date" data-set="from" value="' + esc(f.from) + '"></label>' +
      '<label>Hasta <input type="date" data-set="to" value="' + esc(f.to) + '"></label>' +
      '<label>Últimos ' + sel('lastN', [[0, 'todos'], [12, '12'], [24, '24'], [30, '30'], [50, '50'], [100, '100']], f.lastN) + '</label>' +
      '<label>Mín. vistas <input type="number" min="0" step="100" data-set="minViews" value="' + (f.minViews || '') + '"></label>' +
      '<label><input type="search" placeholder="Buscar en el texto…" data-set="search" value="' + esc(f.search) + '"></label>' +
      '<label><input type="checkbox" data-set="hidePinned"' + (f.hidePinned ? ' checked' : '') + '> Ocultar fijados</label>';
  }

  function renderTabs() {
    const tabs = [['grid', '▦ Grilla'], ['table', '☰ Tabla'], ['analytics', '📊 Análisis'], ['accounts', '👥 Cuentas'], ['ai', '✨ Ideas IA'], ['history', '🕓 Historial']];
    ui.tabs.innerHTML = tabs.map((t) => '<button class="tab' + (st.tab === t[0] ? ' on' : '') + '" data-act="tab" data-tab="' + t[0] + '">' + t[1] + '</button>').join('');
  }

  function renderStatus(v) {
    const s = A.summary(v.items, v.profile);
    const auto = st.auto;
    if (auto && auto.target !== Infinity) ui.progress.style.width = Math.min(100, (countForAuthor() / auto.target) * 100) + '%';
    else ui.progress.style.width = auto ? '100%' : '0';
    ui.status.innerHTML =
      '<span><b>' + fmt(v.items.length) + '</b> de ' + fmt(v.all.length) + ' posts</span>' +
      '<span>Vistas prom. <b>' + fmt(s.avgViews) + '</b></span>' +
      '<span>Mediana <b>' + fmt(s.medianViews) + '</b></span>' +
      '<span>ER prom. <b>' + pct(s.avgER) + '</b></span>' +
      '<span>🔥 Outliers (≥2x) <b>' + s.outliers + '</b></span>' +
      (st.selected.size ? '<span><b>' + st.selected.size + '</b> seleccionados · <a href="#" data-act="dl-selected">descargar</a> · <a href="#" data-act="tx-selected">transcribir</a> · <a href="#" data-act="sel-all">seleccionar todos</a> · <a href="#" data-act="sel-none">quitar selección</a></span>' : '') +
      (!st.selected.size && v.items.length ? '<span><a href="#" data-act="sel-all">Seleccionar todos</a></span>' : '') +
      (st.txBusy ? '<span>📝 Transcribiendo ' + st.txBusy + '…</span>' : '') +
      (st.enrich ? '<span>📈 ' + st.enrich.label + (st.enrich.total ? ' ' + st.enrich.done + '/' + st.enrich.total : '') + '…</span>' : '') +
      (!st.enrich && !st.viewing && igNeedsViews(v.items) ? '<span><a href="#" data-act="ig-reels">📈 Traer vistas de los reels</a></span>' : '') +
      (st.enrichNote && !st.enrich ? '<span>🔎 ' + esc(st.enrichNote) + '</span>' : '') +
      (platform === 'youtube' && !st.enrich && v.items.some((i) => !i.exact) ? '<span><a href="#" data-act="yt-enrich">📈 Completar likes y fechas exactas</a></span>' : '') +
      (st.compare && !st.viewing ? '<span>Comparando con snapshot del <b>' + esc(fdate(st.compare.savedAt, true)) + '</b></span>' : '') +
      (isBS ? '<span>🔒 Estadísticas privadas guardadas: <b>' + fmt(st.bsCount || 0) + '</b> posts de Instagram · <a href="#" data-act="bs-diag">📋 Copiar diagnóstico</a></span>' : '') +
      (platform === 'instagram' && v.items.some((i) => i.hasPrivate) ? '<span>🔒 Con estadísticas privadas: <b>' + v.items.filter((i) => i.hasPrivate).length + '</b></span>' : '') +
      (platform === 'instagram' && v.items.length && !v.items.some((i) => i.views != null) && /reels/.test(location.pathname) === false
        ? '<span>💡 Instagram no manda las vistas en la grilla del perfil: tocá <b>📈 Traer vistas de los reels</b> o abrí la pestaña <b>Reels</b>.</span>' : '') +
      (auto && auto.counter !== countForAuthor ? '<span>📈 Leyendo la pestaña Reels para traer las vistas…</span>' : '') +
      (auto ? '<span>⏳ Cargando posts… se frena solo al llegar al objetivo o al final del perfil</span>' : '');
  }

  function emptyState() {
    if (isBS) {
      return '<div class="empty"><h2>Estadísticas privadas de Instagram</h2><ol>' +
        '<li>En Meta Business Suite entrá a <b>Estadísticas → Contenido</b> (o <b>Contenido → Publicaciones</b>).</li>' +
        '<li>Elegí la cuenta de <b>Instagram</b> del cliente y el período más largo.</li>' +
        '<li>Bajá la lista o tocá ⚡ Auto-cargar. TopFeed guarda alcance, guardados, compartidos, seguidores nuevos y más.</li>' +
        '<li>Volvé al perfil de Instagram: esas columnas aparecen en la ☰ Tabla.</li></ol>' +
        '<p>Guardadas hasta ahora: <b>' + fmt(st.bsCount || 0) + '</b> posts.</p>' +
        '<p><button class="btn" data-act="bs-diag">📋 Copiar diagnóstico</button><br><span class="muted">Si el número no sube, tocá acá y pegá el texto en el chat con Claude.</span></p></div>';
    }
    const tips = {
      instagram: 'Abrí un perfil (o su pestaña Reels) y tocá ⚡ Auto-cargar.',
      tiktok: 'Abrí un perfil (tiktok.com/@usuario) y tocá ⚡ Auto-cargar.',
      facebook: 'Abrí una página, su pestaña Reels o Videos, y tocá ⚡ Auto-cargar.',
      youtube: 'Abrí un canal (pestaña Videos o Shorts) o una búsqueda y tocá ⚡ Auto-cargar.'
    };
    return '<div class="empty"><h2>Todavía no hay posts</h2><ol>' +
      '<li>' + tips[platform] + '</li><li>Mientras bajás, TopFeed lee las vistas, likes, comentarios y compartidos.</li>' +
      '<li>Ordená, filtrá, exportá o pedile ideas a la IA.</li></ol>' +
      (st.filters.author ? '<p>Filtrando por <b>@' + esc(st.filters.author) + '</b>. <a href="#" data-act="all-authors">Ver todas las cuentas</a></p>' : '') +
      (platform === 'instagram' ? '<p><button class="btn" data-act="ig-diag">📋 Copiar diagnóstico</button><br><span class="muted">Si no aparecen tus posts, tocá acá y pegá el texto en el chat con Claude.</span></p>' : '') +
      '</div>';
  }

  function metric(k, v, main) { return '<div class="m' + (main ? ' main' : '') + '"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>'; }

  function renderGrid(v) {
    if (!v.sorted.length) { ui.body.innerHTML = emptyState(); return; }
    const list = v.sorted.slice(0, st.limit);
    ui.body.innerHTML = '<div class="grid">' + list.map((it, idx) => {
      const hot = it.outlier != null && it.outlier >= 2;
      const thumb = safeUrl(it.thumb);
      return '<div class="card' + (st.selected.has(it.key) ? ' sel' : '') + '">' +
        '<a class="thumb" href="' + esc(safeUrl(it.url)) + '" target="_blank" rel="noopener">' +
        (thumb ? '<img loading="lazy" src="' + esc(thumb) + '" alt="">' : '<div class="noimg">' + esc((it.caption || 'Sin vista previa').slice(0, 90)) + '</div>') +
        '<span class="rank">#' + (idx + 1) + '</span>' +
        (it.outlier != null ? '<span class="chip' + (hot ? ' hot' : '') + '">' + (hot ? '🔥 ' : '') + fmt(it.outlier, 1) + 'x</span>' : '') +
        '<span class="typ">' + esc(it.type) + (it.duration ? ' · ' + Math.round(it.duration) + 's' : '') + '</span>' +
        (it.pinned ? '<span class="pin">📌 fijado</span>' : '') + '</a>' +
        '<input type="checkbox" class="selbox" data-act="select" data-key="' + esc(it.key) + '"' + (st.selected.has(it.key) ? ' checked' : '') + ' title="Seleccionar">' +
        '<div class="metrics">' +
        metric('Vistas', fmt(it.views), st.sort === 'views') + metric('Likes', fmt(it.likes), st.sort === 'likes') +
        metric('Coment.', fmt(it.comments), st.sort === 'comments') + metric('Compart.', fmt(it.shares), st.sort === 'shares') +
        metric('ER', pct(it.er), st.sort === 'er') +
        (it.growthViews != null ? metric('Creció', '<span class="grow">+' + fmt(it.growthViews) + '</span>', st.sort === 'growthViews')
          : metric('Guard.', fmt(it.saves), st.sort === 'saves')) +
        '</div>' +
        '<div class="cap" title="' + esc(it.caption) + '">' + esc(it.hook || '—') + '</div>' +
        '<div class="meta"><span>' + (it.author ? '@' + esc(it.author) : '') + '</span><span>' + fdate(it.date) + '</span></div>' +
        '<div class="actions">' +
        '<button class="btn sm" data-act="play" data-key="' + esc(it.key) + '">▶ Ver</button>' +
        '<button class="btn sm" data-act="dl" data-key="' + esc(it.key) + '">⬇ Bajar</button>' +
        (it.transcript ? '<button class="btn sm" data-act="show-tx" data-key="' + esc(it.key) + '">📝 Texto</button>' :
          it.video ? '<button class="btn sm" data-act="transcribe" data-key="' + esc(it.key) + '">Transcribir</button>' : '') +
        '<div class="menu"><button class="btn sm" data-act="menu">⋯</button><div class="items">' +
        '<button data-act="dl-thumb" data-key="' + esc(it.key) + '">Bajar miniatura</button>' +
        '<button data-act="copy-link" data-key="' + esc(it.key) + '">Copiar link</button>' +
        '<button data-act="copy-cap" data-key="' + esc(it.key) + '">Copiar texto</button>' +
        '<button data-act="copy-row" data-key="' + esc(it.key) + '">Copiar fila para planilla</button>' +
        (it.author ? '<button data-act="open-owner" data-key="' + esc(it.key) + '">Ver perfil de la cuenta</button>' : '') +
        '</div></div>' +
        '</div></div>';
    }).join('') + '</div>' +
      (v.sorted.length > st.limit ? '<p class="empty"><button class="btn" data-act="more">Mostrar más (' + (v.sorted.length - st.limit) + ' restantes)</button></p>' : '');
  }

  const TABLE_COLS = [
    ['#', null], ['', null], ['Cuenta', null, 'l'], ['Tipo', null, 'l'], ['Fecha', 'date'], ['Vistas', 'views'],
    ['Likes', 'likes'], ['Coment.', 'comments'], ['Compart.', 'shares'], ['Guard.', 'saves'], ['ER %', 'er'],
    ['ER seg. %', 'erFollowers'], ['Outlier', 'outlier'], ['Vistas/día', 'viewsPerDay'], ['Creció', 'growthViews'],
    ['Dur.', 'duration'], ['Texto', null, 'l']
  ];

  const PRIV_COLS = [['Alcance', 'reach'], ['Seg. +', 'follows'], ['Visitas perfil', 'profileVisits'], ['Clics link', 'linkClicks'], ['Visto prom.', null]];

  function renderTable(v) {
    if (!v.sorted.length) { ui.body.innerHTML = emptyState(); return; }
    const list = v.sorted.slice(0, Math.max(st.limit, 300));
    const priv = v.items.some((i) => i.hasPrivate);
    const cols = priv ? TABLE_COLS.slice(0, -1).concat(PRIV_COLS, TABLE_COLS.slice(-1)) : TABLE_COLS;
    const privCells = (it) => !priv ? '' : '<td>' + fmt(it.reach) + '</td><td>' + fmt(it.follows) + '</td><td>' + fmt(it.profileVisits) + '</td>' +
      '<td>' + fmt(it.linkClicks) + '</td><td>' + (it.avgWatch != null ? fmt(it.avgWatch, 1) + 's' : '—') + '</td>';
    ui.body.innerHTML = '<table><thead><tr>' + cols.map((c) =>
      '<th class="' + (c[2] || '') + (c[1] === st.sort ? ' on' : '') + '"' + (c[1] ? ' data-act="th" data-sort="' + c[1] + '"' : '') + '>' +
      esc(c[0]) + (c[1] === st.sort ? (st.dir === 'desc' ? ' ↓' : ' ↑') : '') + '</th>').join('') + '</tr></thead><tbody>' +
      list.map((it, i) => '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + (safeUrl(it.thumb) ? '<a href="' + esc(safeUrl(it.url)) + '" target="_blank" rel="noopener"><img loading="lazy" src="' + esc(it.thumb) + '" alt=""></a>' : '') + '</td>' +
        '<td class="l">' + esc(it.author ? '@' + it.author : '') + '</td><td class="l">' + esc(it.type) + (it.pinned ? ' 📌' : '') + '</td>' +
        '<td>' + (it.approxDate ? '≈ ' + fdate(it.date) : fdate(it.date, true)) + '</td><td>' + fmt(it.views) + '</td><td>' + fmt(it.likes) + '</td>' +
        '<td>' + fmt(it.comments) + '</td><td>' + fmt(it.shares) + '</td><td>' + fmt(it.saves) + '</td>' +
        '<td>' + pct(it.er) + '</td><td>' + pct(it.erFollowers) + '</td>' +
        '<td>' + (it.outlier != null ? (it.outlier >= 2 ? '🔥 ' : '') + fmt(it.outlier, 1) + 'x' : '—') + '</td>' +
        '<td>' + fmt(it.viewsPerDay) + '</td><td>' + (it.growthViews != null ? '<span class="grow">+' + fmt(it.growthViews) + '</span>' : '—') + '</td>' +
        '<td>' + (it.duration ? Math.round(it.duration) + 's' : '—') + '</td>' + privCells(it) +
        '<td class="cap2" title="' + esc(it.caption) + '"><a href="' + esc(safeUrl(it.url)) + '" target="_blank" rel="noopener">' + esc(it.hook || 'abrir') + '</a></td>' +
        '</tr>').join('') + '</tbody></table>' +
      (v.sorted.length > list.length ? '<div class="empty"><button class="btn" data-act="more">Mostrar más</button></div>' : '');
  }

  // Barras verticales en SVG (sin estilos inline, compatible con la CSP de cada red).
  function bars(rows, opts) {
    opts = opts || {};
    const W = opts.w || 560, H = opts.h || 180, pad = 26;
    const max = Math.max.apply(null, rows.map((r) => r.value || 0).concat([1]));
    const bw = (W - pad) / Math.max(rows.length, 1);
    let best = -1;
    rows.forEach((r, i) => { if (r.value && (best < 0 || r.value > rows[best].value)) best = i; });
    let out = '<svg viewBox="0 0 ' + W + ' ' + (H + 34) + '" width="100%" role="img">';
    rows.forEach((r, i) => {
      const h = r.value ? Math.max(2, (r.value / max) * (H - 16)) : 0;
      const x = pad / 2 + i * bw + bw * 0.15;
      const y = H - h;
      const color = opts.colorFn ? opts.colorFn(r, i) : (i === best ? '#ec4899' : '#8b5cf6');
      out += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (bw * 0.7).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3" fill="' + color + '"><title>' +
        esc(r.title || r.label + ': ' + fmt(r.value)) + '</title></rect>';
      if (!opts.noValues && r.value) out += '<text class="val" x="' + (x + bw * 0.35).toFixed(1) + '" y="' + (y - 4).toFixed(1) + '" text-anchor="middle">' + esc(fmt(r.value)) + '</text>';
      if (r.label && (!opts.sparseLabels || i % Math.ceil(rows.length / 12) === 0))
        out += '<text x="' + (x + bw * 0.35).toFixed(1) + '" y="' + (H + 14) + '" text-anchor="middle">' + esc(r.label) + '</text>';
      if (r.sub) out += '<text x="' + (x + bw * 0.35).toFixed(1) + '" y="' + (H + 27) + '" text-anchor="middle">' + esc(r.sub) + '</text>';
    });
    if (opts.avgLine) {
      const y = H - (opts.avgLine / max) * (H - 16);
      out += '<line x1="0" x2="' + W + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="#f59e0b" stroke-dasharray="4 4"/>' +
        '<text x="' + (W - 4) + '" y="' + (y - 4).toFixed(1) + '" text-anchor="end">mediana ' + esc(fmt(opts.avgLine)) + '</text>';
    }
    return out + '</svg>';
  }

  function kpi(k, v, s) { return '<div class="kpi"><div class="k">' + k + '</div><div class="v">' + v + '</div>' + (s ? '<div class="s">' + s + '</div>' : '') + '</div>'; }

  function renderAnalytics(v) {
    const items = v.items;
    if (!items.length) { ui.body.innerHTML = emptyState(); return; }
    const s = A.summary(items, v.profile);
    const metricName = items.some((i) => i.views != null) ? 'vistas' : 'likes';
    const chrono = items.filter((i) => i.date).sort((a, b) => a.date - b.date).slice(-60);
    const timeline = bars(chrono.map((i) => ({
      label: fdate(i.date), value: metricName === 'vistas' ? i.views : i.likes, outlier: i.outlier,
      title: fdate(i.date) + ' · ' + fmt(metricName === 'vistas' ? i.views : i.likes) + ' ' + metricName + ' · ' + (i.hook || '').slice(0, 60)
    })), { w: 900, h: 200, noValues: true, sparseLabels: true, avgLine: s.medianViews || A.median(items.map((i) => i.likes)),
      colorFn: (r) => (r.outlier >= 2 ? '#f97316' : '#8b5cf6') });
    const wd = A.byWeekday(items), hr = A.byHour(items), dur = A.byDuration(items), fm = A.byFormat(items);
    const tags = A.topHashtags(items, 15), hooks = A.topHooks(items, 10);
    const bestDay = wd.slice().sort((a, b) => b.avg - a.avg)[0];
    const bestHour = hr.slice().sort((a, b) => b.avg - a.avg)[0];
    ui.body.innerHTML =
      '<div class="kpis">' +
      kpi('Posts analizados', fmt(s.count), s.firstDate ? fdate(s.firstDate) + ' → ' + fdate(s.lastDate) : '') +
      kpi('Seguidores', fmt(s.followers), v.profile && v.profile.handle ? '@' + esc(v.profile.handle) : '') +
      kpi('Vistas totales', fmt(s.totalViews)) +
      kpi('Vistas promedio', fmt(s.avgViews), 'mediana ' + fmt(s.medianViews)) +
      kpi('Likes promedio', fmt(s.avgLikes)) +
      kpi('Comentarios prom.', fmt(s.avgComments)) +
      kpi('Compartidos prom.', fmt(s.avgShares)) +
      kpi('Engagement (vistas)', pct(s.avgER), '(likes+coment.+compart.+guard.) / vistas') +
      kpi('Engagement (seguid.)', pct(s.avgERFollowers), '(likes+coment.) / seguidores') +
      kpi('Frecuencia', s.perWeek != null ? fmt(s.perWeek, 1) + ' / semana' : '—') +
      kpi('Outliers 🔥', s.outliers, 'posts con 2x o más de la mediana') +
      kpi('Mejor día / horario', (bestDay && bestDay.count ? bestDay.label : '—') + ' · ' + (bestHour && bestHour.count ? bestHour.label : '—'), 'por ' + metricName + ' promedio') +
      '</div>' +
      '<div class="sec"><h3>Rendimiento en el tiempo</h3><div class="sub">Cada barra es un post (últimos 60). Naranja = outlier (2x o más de la mediana).</div>' + timeline + '</div>' +
      '<div class="cols">' +
      '<div class="sec"><h3>Por día de la semana</h3><div class="sub">' + metricName + ' promedio · cantidad de posts abajo</div>' +
      bars(wd.map((r) => ({ label: r.label, value: r.avg, sub: r.count + ' p' }))) + '</div>' +
      '<div class="sec"><h3>Por horario de publicación</h3><div class="sub">Hora local de tu compu</div>' +
      bars(hr.map((r) => ({ label: r.label, value: r.avg, sub: r.count + ' p' }))) + '</div>' +
      '<div class="sec"><h3>Por duración del video</h3><div class="sub">' + metricName + ' promedio por rango</div>' +
      bars(dur.map((r) => ({ label: r.label, value: r.avg, sub: r.count + ' p' }))) + '</div>' +
      '<div class="sec"><h3>Por formato</h3><div class="sub">¿Qué formato le conviene más a esta cuenta?</div><table><thead><tr><th class="l">Formato</th><th>Posts</th><th>Vistas prom.</th><th>Likes prom.</th><th>Coment. prom.</th><th>ER prom.</th></tr></thead><tbody>' +
      fm.map((r) => '<tr><td class="l">' + esc(r.label) + '</td><td>' + r.count + '</td><td>' + fmt(r.avgViews) + '</td><td>' + fmt(r.avgLikes) + '</td><td>' + fmt(r.avgComments) + '</td><td>' + pct(r.er) + '</td></tr>').join('') +
      '</tbody></table></div>' +
      '</div><div class="cols">' +
      '<div class="sec"><h3>Hashtags que mejor rinden</h3><div class="sub">Primero los usados 2+ veces</div><table><thead><tr><th class="l">Hashtag</th><th>Usos</th><th>' + metricName + ' prom.</th></tr></thead><tbody>' +
      (tags.length ? tags.map((t) => '<tr><td class="l">' + esc(t.tag) + '</td><td>' + t.uses + '</td><td>' + fmt(t.avg) + '</td></tr>').join('') : '<tr><td class="l muted" colspan="3">Sin hashtags</td></tr>') +
      '</tbody></table></div>' +
      '<div class="sec"><h3>Ganchos ganadores</h3><div class="sub">Primera línea de los 10 posts con más ' + metricName + '</div><ol class="hooks">' +
      (hooks.length ? hooks.map((h) => '<li><span class="n">' + fmt(metricName === 'vistas' ? h.views : h.likes) + '</span><a href="' + esc(safeUrl(h.url)) + '" target="_blank" rel="noopener">' + esc(h.hook) + '</a></li>').join('') : '<li class="muted">Sin textos</li>') +
      '</ol><button class="btn sm" data-act="copy-hooks">Copiar ganchos</button></div>' +
      '</div>';
  }

  // Cuentas vistas en la navegación: el perfil abierto, sugeridas por la red ("cuentas similares"),
  // autores de búsquedas y Explorar. Sirve para encontrar competidores y referentes.
  function renderAccounts() {
    const posts = new Map();
    for (const it of store.list()) if (it.author) {
      const k = it.author.toLowerCase();
      const e = posts.get(k) || { n: 0, views: [] };
      e.n++; if (it.views != null) e.views.push(it.views);
      posts.set(k, e);
    }
    const byHandle = new Map();
    for (const p of store.profiles.values()) if (p.platform === platform) byHandle.set(p.handle.toLowerCase(), Object.assign({}, p));
    // Autores de los posts leídos (búsquedas, Explorar): también son cuentas a analizar.
    for (const it of store.list()) {
      if (!it.author || it.platform !== platform) continue;
      const k = it.author.toLowerCase();
      const r = byHandle.get(k) || { platform, handle: it.author };
      if (it.followers != null && (r.followers == null || it.followers > r.followers)) r.followers = it.followers;
      byHandle.set(k, r);
    }
    const rows = Array.from(byHandle.values())
      .sort((a, b) => (b.followers || 0) - (a.followers || 0) || ((posts.get(b.handle.toLowerCase()) || {}).n || 0) - ((posts.get(a.handle.toLowerCase()) || {}).n || 0));
    if (!rows.length) {
      ui.body.innerHTML = '<div class="empty"><h2>Todavía no hay cuentas</h2><p>Abrí perfiles, búsquedas o Explorar: TopFeed guarda las cuentas que ' +
        'la red te muestra, incluidas las <b>sugeridas como similares</b>.</p></div>';
      return;
    }
    const cur = (st.filters.author || '').toLowerCase();
    ui.body.innerHTML = '<div class="sec"><h3>👥 Cuentas encontradas (' + rows.length + ')</h3><div class="sub">El perfil abierto, las cuentas que ' +
      NAMES[platform] + ' sugiere como similares y las que aparecen en búsquedas. Tocá una para analizarla.</div>' +
      '<table><thead><tr><th class="l"></th><th class="l">Cuenta</th><th>Seguidores</th><th>Posts</th><th>Likes totales</th><th>Posts leídos</th><th>Vistas prom.</th><th></th></tr></thead><tbody>' +
      rows.map((p) => {
        const e = posts.get(p.handle.toLowerCase()) || { n: 0, views: [] };
        const url = ownerUrl({ platform, author: p.handle });
        const tsv = ['@' + p.handle, p.name || '', p.followers || '', e.n, Math.round(A.avg(e.views) || 0), url].join('\t');
        return '<tr class="acc-row" data-tsv="' + esc(tsv) + '"><td class="l">' + (safeUrl(p.avatar) ? '<img src="' + esc(p.avatar) + '" alt="">' : '') + '</td>' +
          '<td class="l"><b>@' + esc(p.handle) + '</b>' + (p.verified ? ' ✔' : '') + (p.handle.toLowerCase() === cur ? ' <span class="muted">(abierta)</span>' : '') +
          '<div class="muted">' + esc(p.name || '') + '</div></td>' +
          '<td>' + fmt(p.followers) + '</td><td>' + fmt(p.posts) + '</td><td>' + fmt(p.likesTotal) + '</td><td>' + e.n + '</td>' +
          '<td>' + fmt(A.avg(e.views)) + '</td>' +
          '<td><a class="btn sm" href="' + esc(url) + '">Analizar</a></td></tr>';
      }).join('') + '</tbody></table>' +
      '<p><button class="btn sm" data-act="copy-accounts">Copiar lista</button></p></div>';
  }

  function md(text) {
    const lines = esc(text).split('\n');
    let html = '', list = null;
    const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\s)\*(.+?)\*/g, '$1<i>$2</i>');
    const close = () => { if (list) { html += '</' + list + '>'; list = null; } };
    for (const l of lines) {
      let m;
      if ((m = l.match(/^#{1,4}\s+(.*)/))) { close(); html += '<h3>' + inline(m[1]) + '</h3>'; }
      else if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (list !== 'ul') { close(); html += '<ul>'; list = 'ul'; } html += '<li>' + inline(m[1]) + '</li>'; }
      else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); html += '<ol>'; list = 'ol'; } html += '<li>' + inline(m[1]) + '</li>'; }
      else if (!l.trim()) { close(); }
      else { close(); html += '<p>' + inline(l) + '</p>'; }
    }
    close();
    return html;
  }

  function renderAI(v) {
    ui.body.innerHTML = '<div class="ai">' +
      '<div class="sec"><h3>✨ Ideas de contenido con IA</h3><div class="sub">Claude analiza los ' + Math.min(25, v.sorted.length) +
      ' posts que ves arriba (con el orden y filtros actuales) y te devuelve patrones ganadores, ganchos y guiones listos.</div>' +
      '<textarea data-set="aiContext" placeholder="Contexto opcional: rubro del cliente, objetivo, público, oferta… Ej: Pizzería en Palermo, quiero más pedidos por WhatsApp.">' + esc(st.aiContext) + '</textarea>' +
      '<p><button class="btn primary" data-act="ai-run"' + (st.aiBusy || !v.sorted.length ? ' disabled' : '') + '>' + (st.aiBusy ? 'Analizando… (puede tardar 1-2 min)' : 'Generar ideas') + '</button> ' +
      (st.aiText ? '<button class="btn" data-act="ai-copy">Copiar resultado</button> ' : '') +
      '<span class="muted">Usa tu clave de Anthropic (Opciones).</span></p></div>' +
      (st.aiText ? '<div class="sec md">' + md(st.aiText) + '</div>' : '') + '</div>';
  }

  function renderHistory() {
    ui.body.innerHTML = '<div class="empty">Cargando historial…</div>';
    getSnapshots().then((snaps) => {
      if (st.tab !== 'history') return;
      if (!snaps.length) {
        ui.body.innerHTML = '<div class="empty"><h2>Sin snapshots guardados</h2><p>Tocá 💾 Guardar para guardar los datos de esta cuenta.<br>' +
          'La próxima vez que la analices, TopFeed te muestra cuánto creció cada post.</p></div>';
        return;
      }
      ui.body.innerHTML = '<div class="hist">' + snaps.slice().reverse().map((s) =>
        '<div class="row"><div class="i"><b>' + esc(NAMES[s.platform] || s.platform) + ' · ' + (s.author ? '@' + esc(s.author) : 'todas las cuentas') + '</b>' +
        '<div class="muted">' + esc(fdate(s.savedAt, true)) + ' · ' + s.items.length + ' posts' + (s.profile && s.profile.followers != null ? ' · ' + fmt(s.profile.followers) + ' seguidores' : '') + '</div></div>' +
        '<button class="btn sm" data-act="snap-view" data-id="' + s.id + '">Ver</button>' +
        (s.platform === platform ? '<button class="btn sm" data-act="snap-compare" data-id="' + s.id + '">Comparar con hoy</button>' : '') +
        '<button class="btn sm danger" data-act="snap-del" data-id="' + s.id + '">Borrar</button></div>').join('') + '</div>';
    });
  }

  // ---------- snapshots ----------

  function getSnapshots() {
    return new Promise((r) => {
      try { chrome.storage.local.get(['tf_snapshots'], (s) => r((s && s.tf_snapshots) || [])); } catch (e) { r([]); }
    });
  }

  function setSnapshots(list) {
    return new Promise((r) => chrome.storage.local.set({ tf_snapshots: list }, r));
  }

  const SNAP_KEYS = ['key', 'platform', 'id', 'url', 'author', 'caption', 'date', 'type', 'views', 'likes', 'comments',
    'shares', 'saves', 'duration', 'thumb', 'music', 'pinned', 'hashtags', 'followers', 'transcript', 'approxDate'];

  async function saveSnapshot() {
    const v = view();
    if (!v.items.length) return toast('No hay posts para guardar.');
    const snap = {
      id: Date.now(), platform, author: st.filters.author || '', savedAt: Date.now(), profile: v.profile || null,
      items: v.items.map((i) => { const o = {}; for (const k of SNAP_KEYS) o[k] = i[k] === undefined ? null : i[k]; return o; })
    };
    const list = await getSnapshots();
    list.push(snap);
    while (list.length > 60) list.shift();
    await setSnapshots(list);
    toast('Guardado: ' + snap.items.length + ' posts. La próxima vez vas a ver el crecimiento.');
  }

  async function loadCompare() {
    const a = (st.filters.author || '').toLowerCase();
    const list = await getSnapshots();
    const match = list.filter((s) => s.platform === platform && (s.author || '').toLowerCase() === a && Date.now() - s.savedAt > 60 * 60 * 1000);
    st.compare = match.length ? match[match.length - 1] : null;
    if (st.open) render();
  }

  // ---------- acciones ----------

  function ownerUrl(it) {
    const a = encodeURIComponent(it.author || '');
    return { instagram: 'https://www.instagram.com/' + a + '/', tiktok: 'https://www.tiktok.com/@' + a,
      facebook: 'https://www.facebook.com/' + a, youtube: 'https://www.youtube.com/@' + a }[it.platform];
  }

  function rowTSV(it) { return A.toTSV([it]).split('\n')[1]; }

  function playItem(it) {
    const m = document.createElement('div');
    m.className = 'modal';
    let media;
    if (it.platform === 'youtube') {
      media = document.createElement('iframe');
      media.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(it.id) + '?autoplay=1';
      media.allow = 'autoplay; encrypted-media; picture-in-picture';
      media.allowFullscreen = true;
    } else if (it.video) {
      media = document.createElement('video');
      media.src = it.video; media.controls = true; media.autoplay = true; media.playsInline = true;
    } else {
      window.open(it.url, '_blank', 'noopener');
      return;
    }
    media.className = 'player';
    m.innerHTML = '<div class="box"><div class="t"><span>' + esc(it.hook || it.caption || 'Video') + '</span><span>' +
      '<a class="btn sm" href="' + esc(safeUrl(it.url)) + '" target="_blank" rel="noopener">Abrir en ' + esc(NAMES[it.platform]) + '</a> ' +
      '<button class="btn sm" data-act="modal-close">✕</button></span></div><div class="c pc"></div></div>';
    m.querySelector('.pc').appendChild(media);
    ui.panel.appendChild(m);
  }

  async function transcribeItems(list) {
    list = list.filter((i) => i.video && !i.transcript);
    if (!list.length) return toast('No hay videos para transcribir en la selección (YouTube no entrega el archivo).');
    let ok = 0;
    for (let n = 0; n < list.length; n++) {
      st.txBusy = (n + 1) + '/' + list.length;
      renderStatus(view());
      try { list[n].transcript = await send({ type: 'transcribe', url: list[n].video }); ok++; }
      catch (e) { toast(e.message, 6000); if (/clave/i.test(e.message)) break; }
    }
    st.txBusy = null;
    render();
    toast(ok + ' video(s) transcriptos. La transcripción ya está en las exportaciones.');
  }

  // YouTube: pide likes, fecha exacta y vistas exactas de los videos que todavía no los tienen.
  let enrichResolve = null;
  function enrichYouTube(list) {
    const ids = (list || view().items).filter((i) => i.platform === 'youtube' && !i.exact).map((i) => i.id);
    if (!ids.length) { toast('Los videos ya tienen likes y fecha exacta.'); return Promise.resolve(); }
    st.enrich = { done: 0, total: ids.length, label: 'Completando likes y fechas', okMsg: 'Listo: likes, fechas y vistas exactas de ' + ids.length + ' videos.' };
    renderStatus(view());
    window.postMessage({ source: TAG + '_cmd', cmd: 'yt-enrich', ids }, location.origin);
    return new Promise((r) => { enrichResolve = r; });
  }

  // Instagram: trae las vistas de los reels de la cuenta abierta (la grilla del perfil no las incluye).
  // Instagram solo manda las vistas de los reels en la pestaña Reels del perfil. Abrimos esa pestaña
  // (navegación interna de Instagram: no se pierde lo leído) y la recorremos para completar las vistas.
  async function enrichInstagram() {
    const u = st.filters.author;
    if (!u) return;
    const reelsPath = ('/' + u + '/reels').toLowerCase();
    const here = () => location.pathname.replace(/\/$/, '').toLowerCase() === reelsPath;
    const withViews = () => store.list().filter((i) => (i.author || '').toLowerCase() === u.toLowerCase() && i.views != null).length;
    const before = withViews();
    st.enrich = { done: 0, total: 0, label: 'Abriendo la pestaña Reels para traer las vistas', okMsg: '' };
    renderStatus(view());
    if (!here()) {
      const link = Array.from(document.querySelectorAll('a[href]')).find((a) => {
        try { return new URL(a.href, location.href).pathname.replace(/\/$/, '').toLowerCase() === reelsPath; } catch (e) { return false; }
      });
      if (!link) {
        st.enrich = null;
        st.enrichNote = 'No encontré la pestaña Reels en la página. Abrí instagram.com/' + u + '/reels/ y tocá ⚡ Auto-cargar.';
        render(); return;
      }
      link.click();
      for (let i = 0; i < 20 && !here(); i++) await sleep(300);
      await sleep(2500);
    }
    st.enrich = null;
    await autoLoad(0, { counter: withViews, quiet: true });
    const got = withViews() - before;
    st.enrichNote = got > 0 ? 'Vistas cargadas desde la pestaña Reels: ' + withViews() + ' posts con vistas.'
      : 'La pestaña Reels no trajo vistas nuevas. Si la cuenta no tiene reels, es normal.';
    toast(st.enrichNote, 8000);
    render();
  }

  function igNeedsViews(items) {
    return platform === 'instagram' && st.filters.author && items.some((i) => i.type === 'reel' && i.views == null);
  }

  function onEnrichProgress(d) {
    if (!st.enrich) return;
    st.enrich.done = d.done;
    st.enrich.total = d.total;
    if (d.info) st.enrichNote = d.info;
    if (d.error) { toast(d.error, 10000); st.enrichNote = d.error + (d.info ? ' ' + d.info : ''); }
    if (d.error || d.done >= d.total) {
      st.enrichOk = st.enrich.okMsg;
      st.enrich = null;
      lastVersion = -1;
      render();
      if (!d.error) toast((st.enrichOk || 'Listo.') + (d.info ? ' ' + d.info : ''), 10000);
      if (enrichResolve) { enrichResolve(); enrichResolve = null; }
    } else if (ui.status) renderStatus(view());
  }

  function byKey(key) { return store.items.get(key) || (st.viewing && st.viewing.items.find((i) => i.key === key)); }

  function fileFor(it) {
    const base = [it.platform, it.author || 'cuenta', it.id].join('_');
    if (it.video) return { url: it.video, name: base + '.mp4' };
    if (it.thumb) return { url: it.thumb, name: base + '.jpg' };
    return null;
  }

  async function downloadItems(list) {
    const files = list.map(fileFor).filter(Boolean);
    if (!files.length) return toast('Estos posts no tienen archivo para bajar todavía. Abrí el post y probá de nuevo.');
    try {
      await send({ type: 'download', files });
      toast('Descargando ' + files.length + ' archivo(s) a la carpeta TopFeed.');
    } catch (e) { toast('No se pudo descargar: ' + e.message, 5000); }
  }

  function saveFile(name, content, mime) {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    root.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  async function copy(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg || 'Copiado.'); }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; root.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast(okMsg || 'Copiado.'); } catch (e2) { toast('No pude copiar.'); }
      ta.remove();
    }
  }

  function exportAs(kind) {
    const v = view();
    if (!v.sorted.length) return toast('No hay posts para exportar.');
    const name = 'topfeed_' + platform + '_' + (st.filters.author || 'todas') + '_' + new Date().toISOString().slice(0, 10);
    if (kind === 'csv') saveFile(name + '.csv', A.toCSV(v.sorted), 'text/csv;charset=utf-8');
    else if (kind === 'xls') saveFile(name + '.xls', A.toXLS(v.sorted), 'application/vnd.ms-excel');
    else if (kind === 'json') saveFile(name + '.json', A.toJSON(v.sorted), 'application/json');
    else if (kind === 'tsv') copy(A.toTSV(v.sorted), 'Tabla copiada. Pegala en Excel o Sheets.');
    else if (kind === 'links') copy(v.sorted.map((i) => i.url).filter(Boolean).join('\n'), 'Links copiados.');
    else if (kind === 'sheets') {
      copy(A.toTSV(v.sorted), 'Tabla copiada. En la hoja nueva tocá la celda A1 y pegá (Ctrl+V).');
      window.open('https://sheets.new', '_blank', 'noopener');
    }
  }

  function findScroller() {
    const se = document.scrollingElement || document.documentElement;
    if (se.scrollHeight > window.innerHeight + 50) return null; // la ventana scrollea
    let best = null, bestH = 0;
    document.querySelectorAll('div, main, section').forEach((el) => {
      if (el.scrollHeight - el.clientHeight > 300 && el.clientHeight > 200) {
        const oy = getComputedStyle(el).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > bestH) { best = el; bestH = el.scrollHeight; }
      }
    });
    return best;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // counter: qué se cuenta para saber si sigue llegando info (por defecto, posts de la cuenta).
  async function autoLoad(target, opts) {
    if (st.auto) return;
    opts = opts || {};
    const counter = opts.counter || countForAuthor;
    st.auto = { target: target || Infinity, running: true, counter };
    render();
    const scroller = findScroller();
    let last = counter(), stale = 0;
    while (st.auto && st.auto.running) {
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
      else window.scrollTo(0, (document.scrollingElement || document.documentElement).scrollHeight);
      await sleep(1200 + Math.random() * 900);
      // pequeño rebote para destrabar cargas perezosas
      if (stale >= 2) { window.scrollBy(0, -600); await sleep(400); window.scrollTo(0, document.documentElement.scrollHeight); }
      igViewsFromDom();
      const n = counter();
      if (n >= st.auto.target) break;
      if (n === last) { if (++stale >= 9) break; } else { stale = 0; last = n; }
      renderHead(); renderStatus(view());
    }
    const reason = st.auto && st.auto.running ? (counter() >= (st.auto.target || Infinity) ? 'objetivo alcanzado' : 'no hay más posts') : 'frenado';
    st.auto = null;
    lastVersion = -1;
    render();
    if (opts.quiet) return;
    toast('Auto-carga terminada (' + reason + '): ' + countForAuthor() + ' posts.');
    if (platform === 'youtube') await enrichYouTube();
    else if (igNeedsViews(view().items)) await enrichInstagram();
  }

  async function runAI() {
    const v = view();
    st.aiBusy = true; st.aiText = ''; render();
    try {
      const s = A.summary(v.items, v.profile);
      st.aiText = await send({
        type: 'aiIdeas', platform: NAMES[platform], author: st.filters.author, context: st.aiContext, avgViews: s.avgViews,
        posts: v.sorted.slice(0, 25).map((i) => ({ type: i.type, views: i.views, likes: i.likes, comments: i.comments, shares: i.shares, outlier: i.outlier, duration: i.duration, caption: i.caption }))
      });
    } catch (e) {
      st.aiText = '**No se pudo generar:** ' + e.message;
    }
    st.aiBusy = false;
    if (st.tab === 'ai') render();
  }

  function toggle(force) {
    mount();
    st.open = force === undefined ? !st.open : force;
    ui.overlay.classList.toggle('open', st.open);
    if (st.open) { syncAuthorFromUrl(); scanPage(); lastVersion = -1; render(); }
  }

  function closeMenus(except) {
    root.querySelectorAll('.menu.open').forEach((m) => { if (m !== except) m.classList.remove('open'); });
  }

  async function onClick(e) {
    const t = e.target.closest('[data-act]');
    if (!e.target.closest('.menu')) closeMenus();
    if (!t) { if (e.target === ui.overlay) toggle(false); return; }
    const act = t.dataset.act;
    if (act !== 'select') e.preventDefault();
    const key = t.dataset.key;
    switch (act) {
      case 'toggle': toggle(); break;
      case 'menu': { const m = t.closest('.menu'); closeMenus(m); m.classList.toggle('open'); break; }
      case 'tab': st.tab = t.dataset.tab; render(); break;
      case 'dir': st.dir = st.dir === 'desc' ? 'asc' : 'desc'; render(); break;
      case 'th': if (st.sort === t.dataset.sort) st.dir = st.dir === 'desc' ? 'asc' : 'desc'; else { st.sort = t.dataset.sort; st.dir = 'desc'; } render(); break;
      case 'more': st.limit += 120; render(); break;
      case 'auto': {
        if (isBS) { autoLoad(0, { counter: () => st.bsCount || 0, quiet: true }); break; }
        const s = root.querySelector('[data-set="autoTarget"]'); autoLoad(Number(s && s.value) || 0); break;
      }
      case 'bs-diag': copy(bsDiagnostic(), 'Diagnóstico copiado. Pegalo en el chat con Claude.'); break;
      case 'stop-auto': if (st.auto) st.auto.running = false; break;
      case 'export': exportAs(t.dataset.fmt); break;
      case 'snapshot': saveSnapshot(); break;
      case 'rescan': scanPage(); lastVersion = -1; render(); toast('Página leída de nuevo.'); break;
      case 'clear': if (confirm('¿Borrar todos los posts recolectados en esta pestaña?')) { store.clear(); st.selected.clear(); render(); } break;
      case 'options': send({ type: 'openOptions' }).catch(() => {}); break;
      case 'ig-diag': copy(igDiagnostic(), 'Diagnóstico copiado. Pegalo en el chat con Claude.'); break;
      case 'all-authors': st.filters.author = ''; st.authorManual = true; render(); break;
      case 'select': if (t.checked) st.selected.add(key); else st.selected.delete(key); t.closest('.card') && t.closest('.card').classList.toggle('sel', t.checked); renderStatus(view()); break;
      case 'sel-none': st.selected.clear(); render(); break;
      case 'dl-selected': downloadItems(Array.from(st.selected).map(byKey).filter(Boolean)); break;
      case 'dl': downloadItems([byKey(key)].filter(Boolean)); break;
      case 'copy-cap': { const it = byKey(key); copy((it && it.caption) || '', 'Texto copiado.'); break; }
      case 'copy-hooks': copy(A.topHooks(view().items, 10).map((h) => h.hook).join('\n'), 'Ganchos copiados.'); break;
      case 'transcribe': {
        const it = byKey(key);
        toast('Transcribiendo… puede tardar un minuto.', 60000);
        try { it.transcript = await send({ type: 'transcribe', url: it.video }); toast('Listo.'); showModal('Transcripción', it.transcript); render(); }
        catch (err) { toast(err.message, 6000); }
        break;
      }
      case 'show-tx': { const it = byKey(key); showModal('Transcripción', it.transcript || ''); break; }
      case 'tx-selected': transcribeItems(Array.from(st.selected).map(byKey).filter(Boolean)); break;
      case 'sel-all': view().sorted.forEach((i) => st.selected.add(i.key)); render(); break;
      case 'play': playItem(byKey(key)); break;
      case 'yt-enrich': enrichYouTube(); break;
      case 'ig-reels': enrichInstagram(); break;
      case 'copy-accounts': copy(Array.from(root.querySelectorAll('.acc-row')).map((r) => r.dataset.tsv).join('\n'), 'Lista copiada.'); break;
      case 'dl-thumb': { const it = byKey(key); if (it && it.thumb) send({ type: 'download', files: [{ url: it.thumb, name: [it.platform, it.author || 'cuenta', it.id].join('_') + '.jpg' }] }).then(() => toast('Miniatura descargada.')).catch((e) => toast(e.message)); break; }
      case 'copy-link': copy((byKey(key) || {}).url || '', 'Link copiado.'); break;
      case 'copy-row': copy(rowTSV(byKey(key)), 'Fila copiada. Pegala en tu planilla.'); break;
      case 'open-owner': window.open(ownerUrl(byKey(key)), '_blank', 'noopener'); break;
      case 'ai-run': runAI(); break;
      case 'ai-copy': copy(st.aiText, 'Resultado copiado.'); break;
      case 'snap-view': { const s = (await getSnapshots()).find((x) => String(x.id) === t.dataset.id); if (s) { st.viewing = s; st.tab = 'grid'; render(); } break; }
      case 'snap-compare': { const s = (await getSnapshots()).find((x) => String(x.id) === t.dataset.id); if (s) { st.compare = s; st.viewing = null; st.filters.author = s.author || ''; st.authorManual = true; st.sort = 'growthViews'; st.tab = 'grid'; render(); } break; }
      case 'snap-del': { const list = (await getSnapshots()).filter((x) => String(x.id) !== t.dataset.id); await setSnapshots(list); renderHistory(); break; }
      case 'exit-snapshot': st.viewing = null; lastVersion = -1; render(); break;
      case 'modal-close': t.closest('.modal').remove(); break;
      case 'modal-copy': copy(t.closest('.modal').querySelector('.c').textContent, 'Copiado.'); break;
    }
  }

  function showModal(title, text) {
    const m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = '<div class="box"><div class="t"><span>' + esc(title) + '</span><span><button class="btn sm" data-act="modal-copy">Copiar</button> ' +
      '<button class="btn sm" data-act="modal-close">✕</button></span></div><div class="c">' + esc(text) + '</div></div>';
    ui.panel.appendChild(m);
  }

  function onChange(e) {
    const t = e.target, k = t.dataset && t.dataset.set;
    if (!k) return;
    if (k === 'sort') { st.sort = t.value; st.dir = 'desc'; }
    else if (k === 'author') { st.filters.author = t.value; st.authorManual = true; st.selected.clear(); loadCompare(); }
    else if (k === 'type' || k === 'from' || k === 'to') st.filters[k] = t.value;
    else if (k === 'lastN') st.filters.lastN = Number(t.value) || 0;
    else if (k === 'minViews') st.filters.minViews = Number(t.value) || 0;
    else if (k === 'hidePinned') st.filters.hidePinned = t.checked;
    else if (k === 'autoTarget') { st.settings.autoTarget = t.value; chrome.storage.local.set({ autoTarget: t.value }); return; }
    else return;
    st.limit = 120;
    render();
  }

  let searchTimer;
  function onInput(e) {
    const t = e.target, k = t.dataset && t.dataset.set;
    if (k === 'search') {
      st.filters.search = t.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        render();
        const s = root.querySelector('[data-set="search"]');
        if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
      }, 300);
    } else if (k === 'aiContext') {
      st.aiContext = t.value;
      chrome.storage.local.set({ aiContext: t.value });
    }
  }

  // Mensajes del popup.
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'tf-open') { toggle(true); sendResponse({ ok: true }); }
    else if (msg && msg.type === 'tf-status') {
      sendResponse({ ok: true, platform: NAMES[platform], total: store.items.size, author: st.filters.author, forAuthor: countForAuthor() });
    } else if (msg && msg.type === 'tf-auto') { toggle(true); autoLoad(msg.target || 0); sendResponse({ ok: true }); }
    return false;
  });

  function boot() {
    mount();
    syncAuthorFromUrl();
    scanPage();
    loadCompare();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  window.addEventListener('load', scanPage, { once: true });
})();
