// PAO Marketing Digital — landing de tráfico pago + mini CRM de leads.
// Rutas:
//   POST /api/leads                 → guarda un lead y devuelve el link de WhatsApp
//   /admin, /api/admin/*            → panel CRM (protegido con usuario y contraseña)
//   todo lo demás                   → archivos estáticos de /public

const STATUSES = ['nuevo', 'contactado', 'reunion', 'propuesta', 'cliente', 'perdido'];

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    name TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    email TEXT,
    business TEXT,
    business_type TEXT,
    ad_budget TEXT,
    goal TEXT,
    timeline TEXT,
    message TEXT,
    source TEXT,
    utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_term TEXT, utm_content TEXT,
    gclid TEXT, fbclid TEXT,
    landing_url TEXT, referrer TEXT,
    status TEXT NOT NULL DEFAULT 'nuevo',
    notes TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)`,
  `CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at)`,
];

// Campos que acepta el formulario y su largo máximo
const LEAD_FIELDS = {
  name: 120, whatsapp: 40, email: 160, business: 160, business_type: 80,
  ad_budget: 80, goal: 120, timeline: 80, message: 1000, source: 40,
  utm_source: 120, utm_medium: 120, utm_campaign: 200, utm_term: 200, utm_content: 200,
  gclid: 300, fbclid: 300, landing_url: 500, referrer: 500,
};

let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch(SCHEMA.map((sql) => env.DB.prepare(sql)));
  schemaReady = true;
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

function clean(value, max) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim().slice(0, max);
  return s === '' ? null : s;
}

function buildWhatsAppUrl(env, lead) {
  const lines = [
    `¡Hola Paolo! Soy ${lead.name}.`,
    'Completé el formulario de la web y quiero mi diagnóstico gratis de tráfico pago.',
  ];
  if (lead.business) lines.push(`• Negocio o rubro: ${lead.business}`);
  if (lead.goal) lines.push(`• Objetivo: ${lead.goal}`);
  if (lead.timeline) lines.push(`• Situación: ${lead.timeline}`);
  if (lead.ad_budget) lines.push(`• Inversión mensual pensada: ${lead.ad_budget}`);
  return `https://wa.me/${env.WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`;
}

async function createLead(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Datos inválidos' }, 400);
  }
  // Campo trampa: los humanos no lo ven, los bots lo completan
  if (body.company_website) return json({ ok: true, whatsapp_url: buildWhatsAppUrl(env, { name: 'Hola' }) });

  const lead = {};
  for (const [field, max] of Object.entries(LEAD_FIELDS)) lead[field] = clean(body[field], max);

  if (!lead.name || lead.name.length < 2) return json({ ok: false, error: 'Ingresá tu nombre' }, 400);
  const digits = (lead.whatsapp || '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return json({ ok: false, error: 'Revisá tu número de WhatsApp' }, 400);
  if (!lead.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) return json({ ok: false, error: 'Revisá tu email' }, 400);

  await ensureSchema(env);
  const cols = Object.keys(LEAD_FIELDS);
  const { meta } = await env.DB.prepare(
    `INSERT INTO leads (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
  ).bind(...cols.map((c) => lead[c])).run();

  return json({ ok: true, id: meta.last_row_id, whatsapp_url: buildWhatsAppUrl(env, lead) });
}

// ---------- Panel CRM ----------

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function isAuthorized(request, env) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Basic ')) return false;
  let decoded;
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }
  const sep = decoded.indexOf(':');
  if (sep < 0) return false;
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  const hash = await sha256Hex(pass);
  return user === env.ADMIN_USER && timingSafeEqual(hash, env.ADMIN_PASSWORD_HASH);
}

const unauthorized = () =>
  new Response('Acceso restringido', {
    status: 401,
    headers: { 'www-authenticate': 'Basic realm="CRM PAO", charset="UTF-8"', 'cache-control': 'no-store' },
  });

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function handleAdminApi(request, env, url) {
  await ensureSchema(env);
  const path = url.pathname.replace(/\/+$/, '');

  if (path === '/api/admin/leads' && request.method === 'GET') {
    const status = url.searchParams.get('status');
    const q = url.searchParams.get('q');
    const where = [];
    const params = [];
    if (status && STATUSES.includes(status)) { where.push('status = ?'); params.push(status); }
    if (q) {
      where.push('(name LIKE ? OR whatsapp LIKE ? OR email LIKE ? OR business LIKE ? OR notes LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
    }
    const sql = `SELECT * FROM leads ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC, id DESC LIMIT 1000`;
    const { results } = await env.DB.prepare(sql).bind(...params).all();
    const { results: counts } = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM leads GROUP BY status').all();
    return json({ ok: true, leads: results, counts, statuses: STATUSES });
  }

  if (path === '/api/admin/leads.csv' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM leads ORDER BY created_at DESC, id DESC').all();
    const cols = results.length ? Object.keys(results[0]) : ['id'];
    const csv = '﻿' + [cols.join(','), ...results.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n');
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="leads-pao-${new Date().toISOString().slice(0, 10)}.csv"`,
        'cache-control': 'no-store',
      },
    });
  }

  const match = path.match(/^\/api\/admin\/leads\/(\d+)$/);
  if (match) {
    const id = Number(match[1]);
    if (request.method === 'PATCH') {
      const body = await request.json().catch(() => ({}));
      const sets = [];
      const params = [];
      if (body.status !== undefined) {
        if (!STATUSES.includes(body.status)) return json({ ok: false, error: 'Estado inválido' }, 400);
        sets.push('status = ?'); params.push(body.status);
      }
      if (body.notes !== undefined) { sets.push('notes = ?'); params.push(clean(body.notes, 4000)); }
      if (!sets.length) return json({ ok: false, error: 'Nada para actualizar' }, 400);
      sets.push("updated_at = datetime('now')");
      await env.DB.prepare(`UPDATE leads SET ${sets.join(', ')} WHERE id = ?`).bind(...params, id).run();
      return json({ ok: true });
    }
    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM leads WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
  }

  return json({ ok: false, error: 'No encontrado' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === '/api/leads') {
        if (request.method !== 'POST') return json({ ok: false, error: 'Método no permitido' }, 405);
        return await createLead(request, env);
      }

      if (url.pathname === '/admin' || url.pathname.startsWith('/admin/') || url.pathname.startsWith('/api/admin/')) {
        if (!(await isAuthorized(request, env))) return unauthorized();
        if (url.pathname.startsWith('/api/admin/')) return await handleAdminApi(request, env, url);
        const res = await env.ASSETS.fetch(new Request(new URL('/admin/', url), request));
        const headers = new Headers(res.headers);
        headers.set('cache-control', 'no-store');
        headers.set('x-robots-tag', 'noindex');
        return new Response(res.body, { status: res.status, headers });
      }

      if (url.pathname.startsWith('/api/')) return json({ ok: false, error: 'No encontrado' }, 404);
    } catch (err) {
      console.error(err);
      return json({ ok: false, error: 'Error del servidor, probá de nuevo' }, 500);
    }

    return env.ASSETS.fetch(request);
  },
};
