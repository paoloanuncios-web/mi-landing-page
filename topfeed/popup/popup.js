'use strict';
const app = document.getElementById('app');
document.getElementById('opts').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab || !/^https:\/\/([^/]+\.)?(instagram|tiktok|facebook)\.com\//.test(tab.url || '')) {
    app.innerHTML = '<p>Abrí <b>Instagram</b>, <b>TikTok</b> o <b>Facebook</b> en esta pestaña.</p>' +
      '<ul><li>Entrá a un perfil o a su pestaña Reels/Videos.</li><li>Tocá el botón <b>▲ TopFeed</b> abajo a la derecha.</li></ul>';
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: 'tf-status' }, (res) => {
    if (chrome.runtime.lastError || !res) {
      app.innerHTML = '<p>Recargá la página para activar TopFeed en esta pestaña.</p><button class="primary" id="reload">Recargar</button>';
      document.getElementById('reload').onclick = () => { chrome.tabs.reload(tab.id); window.close(); };
      return;
    }
    app.innerHTML =
      '<div class="muted">' + esc(res.platform) + (res.author ? ' · @' + esc(res.author) : '') + '</div>' +
      '<div class="big">' + res.forAuthor + ' posts</div>' +
      '<div class="muted">' + res.total + ' recolectados en total en esta pestaña</div>' +
      '<button class="primary" id="open">Abrir panel</button>' +
      '<select id="target"><option value="50">Cargar 50 posts</option><option value="100" selected>Cargar 100 posts</option>' +
      '<option value="200">Cargar 200 posts</option><option value="500">Cargar 500 posts</option><option value="0">Cargar todos</option></select>' +
      '<button id="auto">⚡ Auto-cargar y abrir</button>';
    document.getElementById('open').onclick = () => { chrome.tabs.sendMessage(tab.id, { type: 'tf-open' }); window.close(); };
    document.getElementById('auto').onclick = () => {
      chrome.tabs.sendMessage(tab.id, { type: 'tf-auto', target: Number(document.getElementById('target').value) });
      window.close();
    };
  });
});
