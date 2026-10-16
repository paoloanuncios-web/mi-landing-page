/*
 * TopFeed Pro — service worker.
 * Descargas de video/imagen, transcripción (opcional, con clave propia)
 * e ideas de contenido con Claude (opcional, con clave propia).
 */
'use strict';

const CLAUDE_MODEL = 'claude-opus-5-5';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handlers = { download, transcribe, aiIdeas, openOptions, setBadge };
  const fn = handlers[msg && msg.type];
  if (!fn) return false;
  Promise.resolve(fn(msg, sender))
    .then((res) => sendResponse({ ok: true, data: res }))
    .catch((err) => sendResponse({ ok: false, error: String((err && err.message) || err) }));
  return true; // respuesta asíncrona
});

function setBadge(msg, sender) {
  if (!sender.tab) return;
  const n = msg.count || 0;
  chrome.action.setBadgeText({ tabId: sender.tab.id, text: n ? (n > 999 ? '999+' : String(n)) : '' });
  chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#7c3aed' });
}

function openOptions() { return chrome.runtime.openOptionsPage(); }

function safeName(s) {
  return String(s || 'archivo').replace(/[^\w.\-áéíóúñÁÉÍÓÚÑ]+/g, '_').slice(0, 120);
}

async function download(msg) {
  const ids = [];
  for (const f of msg.files || []) {
    if (!f.url) continue;
    const id = await chrome.downloads.download({
      url: f.url,
      filename: 'TopFeed/' + safeName(f.name),
      conflictAction: 'uniquify'
    });
    ids.push(id);
  }
  return ids;
}

async function getSettings() {
  return chrome.storage.local.get(['openaiKey', 'anthropicKey', 'transcribeModel']);
}

// Transcribe el audio de un video. Claude no procesa audio, así que este paso
// usa la API de transcripción de OpenAI con la clave que cargue el usuario.
async function transcribe(msg) {
  const s = await getSettings();
  if (!s.openaiKey) throw new Error('Cargá tu clave de OpenAI en Opciones para transcribir.');
  const res = await fetch(msg.url, { credentials: 'include' });
  if (!res.ok) throw new Error('No pude bajar el video (' + res.status + '). Abrí el post y probá de nuevo.');
  const blob = await res.blob();
  if (blob.size > 25 * 1024 * 1024) throw new Error('El video pesa más de 25 MB, límite de la transcripción.');
  const fd = new FormData();
  fd.append('file', new File([blob], 'video.mp4', { type: blob.type || 'video/mp4' }));
  fd.append('model', s.transcribeModel || 'whisper-1');
  fd.append('response_format', 'text');
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: 'Bearer ' + s.openaiKey }, body: fd
  });
  const text = await r.text();
  if (!r.ok) throw new Error('Error de transcripción: ' + text.slice(0, 300));
  return text.trim();
}

// Analiza los posts top y propone ganchos y guiones con Claude.
async function aiIdeas(msg) {
  const s = await getSettings();
  if (!s.anthropicKey) throw new Error('Cargá tu clave de Anthropic en Opciones para usar Ideas IA.');
  const posts = (msg.posts || []).slice(0, 25).map((p, i) =>
    (i + 1) + '. [' + p.type + '] vistas=' + (p.views ?? 's/d') + ' likes=' + (p.likes ?? 's/d') +
    ' coment=' + (p.comments ?? 's/d') + ' compart=' + (p.shares ?? 's/d') +
    ' outlier=' + (p.outlier != null ? p.outlier.toFixed(1) + 'x' : 's/d') +
    (p.duration ? ' dur=' + Math.round(p.duration) + 's' : '') +
    '\n   Texto: ' + String(p.caption || '').replace(/\s+/g, ' ').slice(0, 600)
  ).join('\n');

  const system = 'Sos estratega de contenido para redes sociales (Instagram, TikTok, Facebook) en Argentina. ' +
    'Escribís en español rioplatense, con frases cortas y al grano. Basás cada conclusión en los datos que te pasan ' +
    '(vistas, interacciones, outliers) y lo decís con números. No inventes métricas que no estén en los datos.';

  const user = 'Cuenta analizada: ' + (msg.author ? '@' + msg.author : 'desconocida') + ' (' + msg.platform + ').\n' +
    (msg.context ? 'Contexto del negocio / cliente: ' + msg.context + '\n' : '') +
    'Promedio de vistas del set: ' + (msg.avgViews != null ? Math.round(msg.avgViews) : 's/d') + '.\n\n' +
    'Posts ordenados por rendimiento:\n' + posts + '\n\n' +
    'Entregá, con títulos en markdown:\n' +
    '1. Patrones ganadores: qué tienen en común los 5 mejores (tema, formato, gancho, duración). Con datos.\n' +
    '2. Qué evitar: patrones de los que rindieron peor.\n' +
    '3. 10 ganchos nuevos listos para usar, inspirados en los que funcionaron.\n' +
    '4. 3 guiones de reel de 30-45 s (gancho 0-3 s, desarrollo, cierre con llamado a la acción).\n' +
    '5. 5 ideas de posts o carruseles.';

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': s.anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      fallbacks: 'default',
      system: system,
      messages: [{ role: 'user', content: user }]
    })
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    const m = data && data.error && data.error.message;
    throw new Error('Error de Claude (' + r.status + '): ' + (m || 'sin detalle'));
  }
  if (data.stop_reason === 'refusal') throw new Error('Claude no pudo responder este pedido. Probá cambiando el contexto.');
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  if (data.stop_reason === 'max_tokens') return text + '\n\n_(Respuesta cortada por largo.)_';
  return text;
}
