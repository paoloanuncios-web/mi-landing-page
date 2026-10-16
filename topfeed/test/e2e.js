// Prueba de punta a punta: carga la extensión real en Chromium sobre páginas simuladas
// de Instagram, TikTok y Facebook (con scroll infinito y la API interna falsa).
// Uso: NODE_PATH=$(npm root -g) node test/e2e.js [carpeta-de-capturas]
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');

const EXT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'topfeed-e2e'));
fs.mkdirSync(OUT, { recursive: true });

const PAGES = 5, PER = 12;
const rnd = (seed) => { let x = seed; return () => (x = (x * 16807) % 2147483647) / 2147483647; };
const r = rnd(42);
const T0 = 1717000000;
const HOOKS = ['3 errores que te hacen perder ventas', 'Así duplicamos pedidos en 30 días', 'Nadie te cuenta esto del delivery',
  'POV: llegó el finde', 'Probé la pizza más cara de Buenos Aires', 'El secreto de nuestra masa', 'Promo 2x1 solo hoy'];
const CDN = 'https://scontent.cdninstagram.com/mock.png';
const TTCDN = 'https://p16-sign.tiktokcdn.com/mock.png';

// Como en el Instagram real: la grilla del perfil NO trae las vistas de los reels; la API de reels sí.
function igNode(i, withViews) {
  const rr = rnd(1000 + i);
  const views = Math.round(2000 + rr() * 40000 * (i % 9 === 0 ? 8 : 1));
  const type = i % 4 === 0 ? 8 : i % 3 === 0 ? 1 : 2;
  return { code: 'IG' + i, pk: String(1000 + i), taken_at: T0 - i * 86400 * 2 - Math.round(rr() * 40000), media_type: type,
    product_type: type === 2 ? 'clips' : 'feed', play_count: type === 2 && withViews ? views : undefined,
    like_count: Math.round(views * (0.02 + rr() * 0.06)), comment_count: Math.round(rr() * 200),
    caption: { text: HOOKS[i % HOOKS.length] + '\nMás info en el link #pizza #promo' + (i % 2 ? ' #delivery' : '') },
    image_versions2: { candidates: [{ url: CDN }] }, video_versions: type === 2 ? [{ url: 'https://scontent.cdninstagram.com/v.mp4' }] : undefined, video_duration: type === 2 ? 8 + (i % 6) * 9 : undefined,
    user: { username: 'pizzeria_x', pk: '777' } };
}
function ttItem(i) {
  const views = Math.round(5000 + r() * 90000 * (i % 7 === 0 ? 10 : 1));
  return { id: String(7300000000000000000n + BigInt(i)), createTime: T0 - i * 86400, desc: HOOKS[i % HOOKS.length] + ' #fyp #cocina',
    author: { uniqueId: 'chef_ana' }, stats: { playCount: views, diggCount: Math.round(views * 0.07), commentCount: Math.round(r() * 300),
      shareCount: Math.round(r() * 900), collectCount: Math.round(r() * 1200) }, video: { duration: 10 + (i % 5) * 12, cover: TTCDN } };
}
function fbStory(i) {
  return { __typename: 'Story', id: 'S' + i, post_id: String(5000 + i), comet_sections: {
    content: { story: { message: { text: HOOKS[i % HOOKS.length] + ' #promo' } } },
    context_layout: { story: { comet_sections: { metadata: [{ story: { creation_time: T0 - i * 86400 * 3,
      url: 'https://www.facebook.com/pizzeriax/posts/pfbid' + i } }] } } },
    actor_photo: { story: { actors: [{ name: 'pizzeriax' }] } },
    feedback: { story: { feedback: { reaction_count: { count: Math.round(50 + r() * 900) }, share_count: { count: Math.round(r() * 40) },
      comment_rendering_instance: { comments: { total_count: Math.round(r() * 80) } } } } } } };
}

const page = (body, script) => '<!doctype html><html><head><meta charset="utf-8"><title>mock</title></head><body style="margin:0;background:#fff;font:14px sans-serif">' +
  '<div id="feed"></div>' + body + '<script>' + script + '</script></body></html>';
const feedScript = (fetcher) => `
  let p = 1, busy = false; const feed = document.getElementById('feed');
  function add(n){ for(let i=0;i<n;i++){ const d=document.createElement('div'); d.style.cssText='height:260px;margin:8px;background:#eee'; d.textContent='post'; feed.appendChild(d);} }
  add(${PER});
  addEventListener('scroll', async () => {
    if (busy || p >= ${PAGES}) return;
    if (innerHeight + scrollY < document.body.scrollHeight - 400) return;
    busy = true; await (${fetcher})(p); add(${PER}); p++; busy = false;
  });`;

async function routeAll(ctx) {
  const png = fs.readFileSync(path.join(EXT, 'icons', 'icon128.png'));
  for (const host of ['https://scontent.cdninstagram.com/**', 'https://p16-sign.tiktokcdn.com/**'])
    await ctx.route(host, (route) => route.fulfill({ contentType: 'image/png', body: png }));
  await ctx.route('https://www.instagram.com/**', async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.startsWith('/graphql') && u.searchParams.get('reels')) {
      // Pestaña Reels: como en el Instagram real con sesión, la API no trae las vistas; se ven en las miniaturas.
      const pg = Number(u.searchParams.get('p'));
      const edges = [];
      for (let i = pg * PER; i < (pg + 1) * PER; i++) { const n = igNode(i, false); if (n.media_type === 2) edges.push({ node: { media: n } }); }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { xdt_api__v1__clips__user__connection_v2: { edges } } }) });
    }
    if (u.pathname.startsWith('/graphql')) {
      const pg = Number(u.searchParams.get('p'));
      const edges = []; for (let i = pg * PER; i < (pg + 1) * PER; i++) edges.push({ node: igNode(i) });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { xdt_api__v1__feed__user_timeline_graphql_connection: { edges } } }) });
    }
    const first = []; for (let i = 0; i < PER; i++) first.push({ node: igNode(i) });
    const initial = { require: [{ data: { user: { username: 'pizzeria_x', id: '777', full_name: 'Pizzería X', follower_count: 48200, media_count: 60 },
      xdt_api__v1__feed__user_timeline_graphql_connection: { edges: first } } }] };
    // Link a la pestaña Reels con navegación interna (como el React Router de Instagram).
    const reelsTab = '<a id="reels-tab" href="/pizzeria_x/reels/">Reels</a>';
    const rl = []; for (let i = 0; i < PAGES * PER; i++) { const n = igNode(i, true); if (n.media_type === 2) rl.push([n.code, n.play_count]); }
    const spa = `
      window.__rl = ${JSON.stringify(rl)}; let ri = 0;
      const addPlain = add;
      add = (n) => { if (!window.__reels) return addPlain(n);
        for (let k = 0; k < n && ri < window.__rl.length; k++, ri++) {
          const [code, v] = window.__rl[ri]; const a = document.createElement('a');
          a.href = '/pizzeria_x/reel/' + code + '/'; a.style.cssText = 'display:block;height:260px;margin:8px;background:#ddd';
          a.innerHTML = '<span>' + v.toLocaleString('es-AR') + '</span>'; feed.appendChild(a); } };
      window.__reels = false;
      document.getElementById('reels-tab').addEventListener('click', (e) => {
        e.preventDefault(); history.pushState({}, '', '/pizzeria_x/reels/');
        window.__reels = true; p = 0; busy = false; feed.innerHTML = ''; add(${PER});
        fetch('/graphql/query?reels=1&p=0').then(r => r.text()); p = 1;
      });`;
    return route.fulfill({ contentType: 'text/html', body: page(reelsTab + '<script type="application/json">' + JSON.stringify(initial) + '</script>',
      feedScript('(p) => fetch("/graphql/query?p=" + p + (window.__reels ? "&reels=1" : "")).then(r => r.text())') + spa) });
  });
  await ctx.route('https://www.tiktok.com/**', async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.startsWith('/api/post/item_list')) {
      const pg = Number(u.searchParams.get('p'));
      const itemList = []; for (let i = pg * PER; i < (pg + 1) * PER; i++) itemList.push(ttItem(i));
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ itemList, hasMore: pg < PAGES - 1 }) });
    }
    const uni = { __DEFAULT_SCOPE__: { 'webapp.user-detail': { userInfo: { user: { uniqueId: 'chef_ana', nickname: 'Ana' },
      stats: { followerCount: 120000, videoCount: 300, heartCount: 3000000 } } } } };
    return route.fulfill({ contentType: 'text/html', body: page('<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">' + JSON.stringify(uni) + '</script>',
      feedScript(`(p) => new Promise(res => { const x = new XMLHttpRequest(); x.open('GET', '/api/post/item_list/?p=' + (p - 1)); x.onload = res; x.send(); })`)) });
  });
  await ctx.route('https://www.facebook.com/**', async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.startsWith('/api/graphql')) {
      const pg = Number(u.searchParams.get('p'));
      const lines = []; for (let i = pg * PER; i < (pg + 1) * PER; i++) lines.push(JSON.stringify({ data: { node: fbStory(i) } }));
      return route.fulfill({ contentType: 'text/html', body: 'for (;;);' + lines.join('\n') });
    }
    return route.fulfill({ contentType: 'text/html', body: page('', feedScript('(p) => fetch("/api/graphql/?p=" + (p - 1), {method:"POST"}).then(r => r.text())')) });
  });
}

async function run(ctx, url, name, expectAtLeast) {
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await pg.goto(url);
  await pg.waitForSelector('#topfeed-pro-root >> .launcher');
  await pg.click('#topfeed-pro-root >> .launcher');
  await pg.selectOption('#topfeed-pro-root >> select[data-set="autoTarget"]', '0');
  await pg.click('#topfeed-pro-root >> [data-act="auto"]');
  await pg.waitForSelector('#topfeed-pro-root >> [data-act="auto"]', { timeout: 120000 });
  if (name === 'instagram') {
    for (let i = 0; i < 120; i++) { const t = await pg.textContent('#topfeed-pro-root >> .status'); if (!/Leyendo la pestaña Reels|Abriendo la pestaña Reels/.test(t) && /Vistas cargadas|no trajo vistas/.test(t)) break; await pg.waitForTimeout(500); }
  }
  const status = await pg.textContent('#topfeed-pro-root >> .status');
  if (name === 'instagram' && /Vistas prom\.\s*—/.test(status)) throw new Error('instagram: no se completaron las vistas de los reels');
  const cards = await pg.locator('#topfeed-pro-root >> .card').count();
  console.log('  ' + name + ': ' + status.replace(/\s+/g, ' ').trim() + ' | tarjetas=' + cards);
  if (cards < expectAtLeast) throw new Error(name + ': se esperaban ' + expectAtLeast + ' posts y hay ' + cards);
  await pg.screenshot({ path: path.join(OUT, name + '-grilla.png') });
  // Ordenar por outlier y verificar el orden
  await pg.selectOption('#topfeed-pro-root >> select[data-set="sort"]', 'outlier');
  const chips = await pg.locator('#topfeed-pro-root >> .card .chip').allTextContents();
  const nums = chips.map((c) => parseFloat(c.replace(/[^\d,]/g, '').replace(',', '.')));
  for (let i = 1; i < nums.length; i++) if (nums[i] > nums[i - 1] + 0.05) throw new Error(name + ': orden por outlier incorrecto');
  await pg.click('#topfeed-pro-root >> [data-tab="table"]');
  await pg.screenshot({ path: path.join(OUT, name + '-tabla.png') });
  await pg.click('#topfeed-pro-root >> [data-tab="analytics"]');
  await pg.screenshot({ path: path.join(OUT, name + '-analisis.png'), fullPage: false });
  // Exportar CSV
  await pg.click('#topfeed-pro-root >> [data-menu-id="export"]');
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#topfeed-pro-root >> [data-fmt="csv"]')]);
  const csvPath = path.join(OUT, name + '.csv');
  await dl.saveAs(csvPath);
  const lines = fs.readFileSync(csvPath, 'utf8').trim().split(/\r\n/).length - 1;
  console.log('  ' + name + ': CSV con ' + lines + ' filas');
  if (lines !== cards) throw new Error(name + ': CSV con filas distintas a las tarjetas');
  // Guardar snapshot y ver historial
  await pg.click('#topfeed-pro-root >> [data-act="snapshot"]');
  await pg.waitForTimeout(400);
  await pg.click('#topfeed-pro-root >> [data-tab="history"]');
  await pg.waitForSelector('#topfeed-pro-root >> .hist .row');
  await pg.close();
}

// IA y transcripción con las APIs de Anthropic y OpenAI simuladas.
async function aiAndTranscribe(ctx) {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  await sw.evaluate(() => chrome.storage.local.set({ anthropicKey: 'sk-ant-test', openaiKey: 'sk-test' }));
  let aiReq = null, sttReq = null;
  await ctx.route('https://api.anthropic.com/**', (route) => {
    aiReq = { headers: route.request().headers(), body: JSON.parse(route.request().postData()) };
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ stop_reason: 'end_turn',
      content: [{ type: 'text', text: '## Patrones ganadores\n- Ganchos con **números** rinden 2x\n1. Gancho uno' }] }) });
  });
  await ctx.route('https://api.openai.com/**', (route) => {
    sttReq = { headers: route.request().headers(), size: (route.request().postDataBuffer() || []).length };
    route.fulfill({ contentType: 'text/plain', body: 'hola mundo transcripto' });
  });
  const pg = await ctx.newPage();
  await pg.goto('https://www.instagram.com/pizzeria_x/');
  await pg.click('#topfeed-pro-root >> .launcher');
  await pg.click('#topfeed-pro-root >> [data-tab="ai"]');
  await pg.fill('#topfeed-pro-root >> textarea[data-set="aiContext"]', 'Pizzería en Palermo');
  await pg.click('#topfeed-pro-root >> [data-act="ai-run"]');
  await pg.waitForSelector('#topfeed-pro-root >> .md h3');
  const md = await pg.textContent('#topfeed-pro-root >> .md');
  if (!/Patrones ganadores/.test(md) || !aiReq) throw new Error('IA: no se mostró la respuesta');
  const b = aiReq.body;
  if (b.model !== 'claude-opus-5-5' || b.fallbacks !== 'default' || !b.output_config || b.output_config.effort !== 'medium') throw new Error('IA: pedido mal armado');
  if (aiReq.headers['x-api-key'] !== 'sk-ant-test' || aiReq.headers['anthropic-beta'] !== 'server-side-fallback-2026-07-01') throw new Error('IA: encabezados incorrectos');
  if (!/Pizzería en Palermo/.test(b.messages[0].content) || !/vistas=/.test(b.messages[0].content)) throw new Error('IA: faltan datos en el prompt');
  console.log('  IA: pedido OK (' + b.model + ', fallbacks=' + b.fallbacks + ') y respuesta dibujada');
  await pg.screenshot({ path: path.join(OUT, 'ia-respuesta.png') });
  await pg.click('#topfeed-pro-root >> [data-tab="grid"]');
  await pg.locator('#topfeed-pro-root >> [data-act="transcribe"]').first().click();
  await pg.waitForSelector('#topfeed-pro-root >> .modal .c');
  const tx = await pg.textContent('#topfeed-pro-root >> .modal .c');
  if (tx !== 'hola mundo transcripto' || !sttReq || sttReq.headers.authorization !== 'Bearer sk-test' || sttReq.size < 100) throw new Error('Transcripción: falló el circuito');
  console.log('  Transcripción: video bajado (' + sttReq.size + ' bytes enviados) y texto mostrado');
  await pg.click('#topfeed-pro-root >> [data-act="modal-close"]');
  if (!(await pg.locator('#topfeed-pro-root >> [data-act="show-tx"]').count())) throw new Error('Transcripción: la tarjeta no quedó marcada');
  await pg.click('#topfeed-pro-root >> [data-menu-id="export"]');
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#topfeed-pro-root >> [data-fmt="csv"]')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  if (!csv.includes('Transcripción') || !csv.includes('hola mundo transcripto')) throw new Error('Exportación: falta la transcripción');
  console.log('  Exportar + transcripciones: OK');
  await pg.locator('#topfeed-pro-root >> .card:has([data-act="show-tx"]) [data-act="play"]').first().click();
  await pg.waitForSelector('#topfeed-pro-root >> .modal video.player');
  await pg.click('#topfeed-pro-root >> [data-act="modal-close"]');
  await pg.click('#topfeed-pro-root >> .status [data-act="sel-all"]');
  const n = await pg.locator('#topfeed-pro-root >> .card.sel').count();
  if (n < 12) throw new Error('Seleccionar todos: ' + n);
  console.log('  Reproductor y seleccionar todos (' + n + '): OK');
  await pg.close();
}

(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-prof-')), {
    channel: 'chromium', headless: true, viewport: { width: 1400, height: 900 }, acceptDownloads: true,
    args: ['--disable-extensions-except=' + EXT, '--load-extension=' + EXT]
  });
  await routeAll(ctx);
  const total = PAGES * PER;
  try {
    await run(ctx, 'https://www.instagram.com/pizzeria_x/', 'instagram', total);
    await run(ctx, 'https://www.tiktok.com/@chef_ana', 'tiktok', total - PER); // el mock de TikTok solo trae el perfil en la carga inicial
    await run(ctx, 'https://www.facebook.com/pizzeriax', 'facebook', total - PER); // la carga inicial de FB no trae datos en el mock
    await aiAndTranscribe(ctx);
    console.log('\nE2E OK · capturas en ' + OUT);
  } catch (e) {
    console.error('E2E FALLÓ:', e.message);
    process.exitCode = 1;
  } finally {
    await ctx.close();
  }
})();
