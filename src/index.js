// PAO Marketing Digital — landing de tráfico pago + CRM de leads.
// Rutas:
//   POST /api/leads                 → guarda un lead, lo califica (A/B/C) y devuelve el link de WhatsApp
//   /admin, /api/admin/*            → panel CRM (protegido con usuario y contraseña)
//   todo lo demás                   → archivos estáticos de /public

// Etapas del embudo, en orden
const STATUSES = [
  'nuevo', 'contactado', 'call_agendada', 'call_realizada', 'propuesta',
  'seguimiento', 'ganado', 'perdido', 'no_califica',
];
const GRADES = ['A', 'B', 'C'];

// Base inicial (primera versión)
const BASE_SCHEMA = [
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
  `CREATE TABLE IF NOT EXISTS lead_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    type TEXT NOT NULL,
    detail TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)`,
  `CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_events_lead ON lead_events(lead_id)`,
];

// Columnas agregadas en la versión CRM
const EXTRA_COLUMNS = {
  grade: 'TEXT',
  suggested_plan: 'TEXT',
  deal_value: 'INTEGER',
  next_followup_at: 'TEXT',
  call_at: 'TEXT',
  lost_reason: 'TEXT',
  stage_changed_at: 'TEXT',
  first_contact_at: 'TEXT',
};

// Campos que acepta el formulario y su largo máximo
const LEAD_FIELDS = {
  name: 120, whatsapp: 40, email: 160, business: 160, business_type: 80,
  ad_budget: 80, goal: 120, timeline: 80, message: 1000, source: 40,
  utm_source: 120, utm_medium: 120, utm_campaign: 200, utm_term: 200, utm_content: 200,
  gclid: 300, fbclid: 300, landing_url: 500, referrer: 500,
};

// ---------- Calificación A/B/C según los planes ----------
// Planes: Inicial $250.000 · Pyme $450.000 · Empresa $750.000 (ARS por mes)
const PLAN_VALUES = { Inicial: 250000, Pyme: 450000, Empresa: 750000 };

function budgetTier(budget = '') {
  if (budget.startsWith('Más de')) return 'alto';
  if (budget.startsWith('Entre')) return 'medio';
  if (budget.startsWith('Menos de')) return 'bajo';
  return 'sin_definir';
}

function urgencyTier(timeline = '') {
  if (timeline.startsWith('Quiero arrancar')) return 'ya';
  if (timeline.startsWith('Evaluando')) return 'semanas';
  return 'sin_apuro';
}

function qualify(lead) {
  const b = budgetTier(lead.ad_budget || '');
  const u = urgencyTier(lead.timeline || '');
  const ready = u === 'ya' || u === 'semanas';
  let grade = 'C';
  if (b === 'alto' && ready) grade = 'A';
  else if ((b === 'medio' && ready) || b === 'alto') grade = 'B';
  const plan = { alto: 'Pyme', medio: 'Inicial', bajo: 'Mentoría', sin_definir: 'A definir en la call' }[b];
  return { grade, suggested_plan: plan, deal_value: PLAN_VALUES[plan] || null };
}

// ---------- Utilidades ----------
let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch(BASE_SCHEMA.map((sql) => env.DB.prepare(sql)));
  const { results } = await env.DB.prepare('PRAGMA table_info(leads)').all();
  const existing = new Set(results.map((c) => c.name));
  const missing = Object.entries(EXTRA_COLUMNS).filter(([col]) => !existing.has(col));
  if (missing.length) {
    await env.DB.batch(missing.map(([col, type]) => env.DB.prepare(`ALTER TABLE leads ADD COLUMN ${col} ${type}`)));
  }
  // Etapas de la primera versión → etapas nuevas
  await env.DB.batch([
    env.DB.prepare("UPDATE leads SET status = 'call_agendada' WHERE status = 'reunion'"),
    env.DB.prepare("UPDATE leads SET status = 'ganado' WHERE status = 'cliente'"),
  ]);
  // Calificar los leads que todavía no tienen nota
  const { results: ungraded } = await env.DB.prepare('SELECT id, ad_budget, timeline FROM leads WHERE grade IS NULL').all();
  if (ungraded.length) {
    await env.DB.batch(ungraded.map((l) => {
      const q = qualify(l);
      return env.DB.prepare('UPDATE leads SET grade = ?, suggested_plan = ?, deal_value = COALESCE(deal_value, ?) WHERE id = ?')
        .bind(q.grade, q.suggested_plan, q.deal_value, l.id);
    }));
  }
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

const logEvent = (env, leadId, type, detail) =>
  env.DB.prepare('INSERT INTO lead_events (lead_id, type, detail) VALUES (?, ?, ?)').bind(leadId, type, detail);

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

// ---------- Alta de leads desde la landing ----------
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
  Object.assign(lead, qualify(lead));
  const cols = [...Object.keys(LEAD_FIELDS), 'grade', 'suggested_plan', 'deal_value'];
  const { meta } = await env.DB.prepare(
    `INSERT INTO leads (${cols.join(', ')}, stage_changed_at) VALUES (${cols.map(() => '?').join(', ')}, datetime('now'))`
  ).bind(...cols.map((c) => lead[c])).run();
  await logEvent(env, meta.last_row_id, 'creado', `Lead ${lead.grade} desde ${lead.source || 'la web'} · plan sugerido: ${lead.suggested_plan}`).run();

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

const STATUS_LABELS = {
  nuevo: 'Nuevo', contactado: 'Contactado', call_agendada: 'Call agendada', call_realizada: 'Call realizada',
  propuesta: 'Propuesta enviada', seguimiento: 'Seguimiento', ganado: 'Cliente ganado', perdido: 'Perdido', no_califica: 'No califica',
};

// Datos editables desde el panel: [columna, largo máximo o tipo]
const EDITABLE = {
  notes: 4000, next_followup_at: 20, call_at: 20, lost_reason: 200, suggested_plan: 60,
};

async function updateLead(env, id, body) {
  const { results } = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(id).all();
  const lead = results[0];
  if (!lead) return json({ ok: false, error: 'Lead no encontrado' }, 404);

  const sets = [];
  const params = [];
  const events = [];

  if (body.status !== undefined && body.status !== lead.status) {
    if (!STATUSES.includes(body.status)) return json({ ok: false, error: 'Etapa inválida' }, 400);
    sets.push('status = ?', "stage_changed_at = datetime('now')");
    params.push(body.status);
    if (!lead.first_contact_at && lead.status === 'nuevo') sets.push("first_contact_at = datetime('now')");
    events.push(['etapa', `${STATUS_LABELS[lead.status] || lead.status} → ${STATUS_LABELS[body.status]}`]);
  }
  if (body.grade !== undefined && body.grade !== lead.grade) {
    if (!GRADES.includes(body.grade)) return json({ ok: false, error: 'Calificación inválida' }, 400);
    sets.push('grade = ?');
    params.push(body.grade);
    events.push(['calificacion', `Calificación cambiada de ${lead.grade || '—'} a ${body.grade}`]);
  }
  if (body.deal_value !== undefined) {
    const v = body.deal_value === '' || body.deal_value === null ? null : Math.max(0, Math.round(Number(body.deal_value)));
    if (v !== null && !Number.isFinite(v)) return json({ ok: false, error: 'Valor inválido' }, 400);
    if (v !== lead.deal_value) {
      sets.push('deal_value = ?');
      params.push(v);
      events.push(['valor', `Valor del negocio: ${v === null ? '—' : '$' + v.toLocaleString('es-AR')}`]);
    }
  }
  for (const [col, max] of Object.entries(EDITABLE)) {
    if (body[col] === undefined) continue;
    const v = clean(body[col], max);
    if (v === lead[col]) continue;
    sets.push(`${col} = ?`);
    params.push(v);
    if (col === 'call_at') events.push(['call', v ? `Call agendada para ${v.replace('T', ' ')}` : 'Call desagendada']);
    if (col === 'next_followup_at') events.push(['seguimiento', v ? `Próximo seguimiento: ${v.replace('T', ' ')}` : 'Seguimiento quitado']);
    if (col === 'lost_reason' && v) events.push(['perdida', `Motivo: ${v}`]);
    if (col === 'suggested_plan') events.push(['plan', `Plan: ${v || '—'}`]);
  }
  if (!sets.length) return json({ ok: true, unchanged: true });

  sets.push("updated_at = datetime('now')");
  await env.DB.batch([
    env.DB.prepare(`UPDATE leads SET ${sets.join(', ')} WHERE id = ?`).bind(...params, id),
    ...events.map(([type, detail]) => logEvent(env, id, type, detail)),
  ]);
  return json({ ok: true });
}

async function handleAdminApi(request, env, url) {
  await ensureSchema(env);
  const path = url.pathname.replace(/\/+$/, '');

  if (path === '/api/admin/leads' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM leads ORDER BY created_at DESC, id DESC LIMIT 5000').all();
    return json({ ok: true, leads: results, statuses: STATUSES, grades: GRADES });
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

  const match = path.match(/^\/api\/admin\/leads\/(\d+)(\/events)?$/);
  if (match) {
    const id = Number(match[1]);
    if (match[2]) {
      if (request.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM lead_events WHERE lead_id = ? ORDER BY created_at DESC, id DESC').bind(id).all();
        return json({ ok: true, events: results });
      }
      if (request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const detail = clean(body.detail, 2000);
        if (!detail) return json({ ok: false, error: 'Escribí la nota' }, 400);
        await env.DB.batch([
          logEvent(env, id, 'nota', detail),
          env.DB.prepare("UPDATE leads SET updated_at = datetime('now') WHERE id = ?").bind(id),
        ]);
        return json({ ok: true });
      }
    } else {
      if (request.method === 'PATCH') {
        const body = await request.json().catch(() => ({}));
        return updateLead(env, id, body);
      }
      if (request.method === 'DELETE') {
        await env.DB.batch([
          env.DB.prepare('DELETE FROM lead_events WHERE lead_id = ?').bind(id),
          env.DB.prepare('DELETE FROM leads WHERE id = ?').bind(id),
        ]);
        return json({ ok: true });
      }
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
        const isPage = url.pathname === '/admin' || url.pathname === '/admin/';
        const res = await env.ASSETS.fetch(isPage ? new Request(new URL('/admin/', url), request) : request);
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
