(() => {
  'use strict';

  // ---------- Configuración ----------
  const STAGES = [
    { id: 'nuevo', label: 'Nuevo', color: '#5aa6ff' },
    { id: 'contactado', label: 'Contactado', color: '#b28cff' },
    { id: 'call_agendada', label: 'Call agendada', color: '#ffc857' },
    { id: 'call_realizada', label: 'Call realizada', color: '#ffa95c' },
    { id: 'propuesta', label: 'Propuesta enviada', color: '#ff8a2a' },
    { id: 'seguimiento', label: 'Seguimiento', color: '#f472b6' },
    { id: 'ganado', label: 'Cliente ganado', color: '#25d366' },
    { id: 'perdido', label: 'Perdido', color: '#ff6b6b', closed: true },
    { id: 'no_califica', label: 'No califica', color: '#6c7a96', closed: true },
  ];
  const STAGE = Object.fromEntries(STAGES.map((s) => [s.id, s]));
  const ACTIVE = ['nuevo', 'contactado', 'call_agendada', 'call_realizada', 'propuesta', 'seguimiento'];
  const PLANS = ['Inicial', 'Pyme', 'Empresa', 'Mentoría', 'A definir en la call'];
  const PLAN_VALUES = { Inicial: 250000, Pyme: 450000, Empresa: 750000 };
  const LOST_REASONS = ['Sin presupuesto', 'No respondió', 'No era el momento', 'Eligió otra opción', 'No es su perfil', 'Otro'];
  const PRIORITY = {
    A: 'Prioridad máxima: escribile en menos de 1 hora y ofrecé agendar la call.',
    B: 'Prioridad media: contactalo hoy y calificá bien el presupuesto en la call.',
    C: 'Prioridad baja: enviale un mensaje y dejalo en seguimiento a largo plazo.',
  };

  // Mensajes de WhatsApp por etapa ({nombre}, {negocio}, {plan}, {call})
  const TEMPLATES = [
    { stage: 'nuevo', title: 'Primer contacto', text: '¡Hola {nombre}! Soy Paolo, de PAO Marketing Digital. Recibí tu consulta para {negocio}. ¿Tenés 20 minutos esta semana para una llamada? Te muestro cómo podemos conseguir más clientes con anuncios.' },
    { stage: 'contactado', title: 'Proponer la call', text: '{nombre}, ¿te queda bien una llamada de 20 minutos mañana o pasado? Decime día y horario y te mando el enlace.' },
    { stage: 'call_agendada', title: 'Confirmar la call', text: '¡Hola {nombre}! Te confirmo nuestra llamada para el {call}. Ahí te muestro la presentación con la estrategia para {negocio}. ¡Nos vemos!' },
    { stage: 'call_realizada', title: 'Gracias por la call', text: '¡Gracias por tu tiempo hoy, {nombre}! Como hablamos, preparo la propuesta para {negocio} y te la envío en breve.' },
    { stage: 'propuesta', title: 'Propuesta enviada', text: '{nombre}, te envié la propuesta del plan {plan}. ¿Pudiste verla? Cualquier duda la charlamos por acá.' },
    { stage: 'seguimiento', title: 'Seguimiento', text: '¡Hola {nombre}! ¿Cómo venís con la decisión sobre los anuncios para {negocio}? Si querés, ajustamos la propuesta a tu momento.' },
    { stage: 'ganado', title: 'Bienvenida', text: '¡Qué bueno que arrancamos, {nombre}! Te paso los próximos pasos para configurar las cuentas de anuncios de {negocio}.' },
    { stage: 'perdido', title: 'Dejar la puerta abierta', text: '¡Hola {nombre}! Quedo a disposición si más adelante querés retomar los anuncios para {negocio}. ¡Éxitos!' },
  ];

  // ---------- Estado ----------
  let leads = [];
  let gradeFilter = '';
  let focus = '';
  let query = '';
  let sort = { key: 'created_at', dir: -1 };
  let openId = null;

  // ---------- Utilidades ----------
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => (n || n === 0) ? '$' + Number(n).toLocaleString('es-AR') : '—';
  const utc = (s) => s ? new Date(s.replace(' ', 'T') + 'Z') : null; // fechas del servidor (UTC)
  const local = (s) => s ? new Date(s) : null; // fechas cargadas en el panel (hora local)
  const fmt = (d, withTime = true) => d ? d.toLocaleString('es-AR', withTime ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  function ago(d) {
    if (!d) return '';
    const m = Math.round((Date.now() - d.getTime()) / 60000);
    if (m < 60) return `hace ${Math.max(m, 1)} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `hace ${h} h`;
    return `hace ${Math.round(h / 24)} d`;
  }
  function waNumber(n) {
    let d = String(n || '').replace(/\D/g, '').replace(/^0+/, '');
    if (d.length === 10) d = '549' + d;                         // 11 2345 6789 → 549112345 6789
    else if (d.length === 12 && d.startsWith('54') && d[2] !== '9') d = '549' + d.slice(2);
    return d;
  }
  const waLink = (lead, text) => `https://wa.me/${waNumber(lead.whatsapp)}${text ? '?text=' + encodeURIComponent(text) : ''}`;
  const fill = (tpl, l) => tpl
    .replace(/\{nombre\}/g, (l.name || '').split(' ')[0])
    .replace(/\{negocio\}/g, l.business || 'tu negocio')
    .replace(/\{plan\}/g, l.suggested_plan || '')
    .replace(/\{call\}/g, l.call_at ? fmt(local(l.call_at)) : '[día y hora]');
  const origin = (l) => [l.utm_source, l.utm_campaign].filter(Boolean).join(' / ') || (l.gclid ? 'Google Ads' : l.fbclid ? 'Meta Ads' : 'Directo / orgánico');
  const isOverdue = (l) => l.next_followup_at && local(l.next_followup_at) < new Date() && ACTIVE.includes(l.status);
  const isToday = (s) => s && sameDay(local(s), new Date());
  const urgent = (l) => l.grade === 'A' && l.status === 'nuevo';

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  async function api(path, opts = {}) {
    const r = await fetch(path, { headers: { 'content-type': 'application/json' }, ...opts });
    const j = await r.json().catch(() => ({ ok: false, error: 'Respuesta inválida del servidor' }));
    if (!r.ok || !j.ok) throw new Error(j.error || 'Error');
    return j;
  }

  // ---------- Datos ----------
  async function load() {
    const data = await api('/api/admin/leads');
    leads = data.leads;
    render();
    if (openId) renderDrawer();
  }

  async function patch(id, changes, msg) {
    const lead = leads.find((l) => l.id === id);
    const before = { ...lead };
    Object.assign(lead, changes);
    render();
    try {
      await api('/api/admin/leads/' + id, { method: 'PATCH', body: JSON.stringify(changes) });
      if (msg) toast(msg);
      if (openId === id) renderDrawer();
    } catch (err) {
      Object.assign(lead, before);
      render();
      toast('No se pudo guardar: ' + err.message);
    }
  }

  function visible() {
    const q = query.toLowerCase();
    return leads.filter((l) => {
      if (gradeFilter && l.grade !== gradeFilter) return false;
      if (q && ![l.name, l.whatsapp, l.email, l.business, l.notes].some((v) => (v || '').toLowerCase().includes(q))) return false;
      if (focus === 'hot' && !urgent(l)) return false;
      if (focus === 'late' && !isOverdue(l)) return false;
      if (focus === 'calls' && !(isToday(l.call_at) && l.status === 'call_agendada')) return false;
      if (focus === 'new' && !(utc(l.created_at) > Date.now() - 86400000)) return false;
      return true;
    });
  }

  // ---------- Prioridades de hoy ----------
  function renderToday() {
    const n = {
      hot: leads.filter(urgent).length,
      late: leads.filter(isOverdue).length,
      calls: leads.filter((l) => isToday(l.call_at) && l.status === 'call_agendada').length,
      new: leads.filter((l) => utc(l.created_at) > Date.now() - 86400000).length,
    };
    const chip = (key, cls, label, sub) => `<button class="chip ${cls} ${focus === key ? 'on' : ''}" data-focus="${key}"><strong>${n[key]}</strong><span>${label}<small>${sub}</small></span></button>`;
    $('#today').innerHTML =
      chip('hot', 'chip--hot', 'Leads A sin contactar', 'atender en menos de 1 h') +
      chip('late', 'chip--late', 'Seguimientos vencidos', 'contactar hoy') +
      chip('calls', 'chip--call', 'Calls de hoy', 'agendadas para hoy') +
      chip('new', 'chip--new', 'Leads nuevos', 'últimas 24 horas');
    $('#clear-focus').hidden = !focus;
  }

  // ---------- Tablero ----------
  function cardHTML(l) {
    const pills = [];
    if (urgent(l)) pills.push('<span class="pill pill--hot">Atender ya</span>');
    if (l.next_followup_at && ACTIVE.includes(l.status)) {
      const late = isOverdue(l);
      pills.push(`<span class="pill ${late ? 'pill--late' : isToday(l.next_followup_at) ? 'pill--today' : ''}">⏰ ${late ? 'Vencido · ' : ''}${fmt(local(l.next_followup_at))}</span>`);
    }
    if (l.call_at && l.status === 'call_agendada') pills.push(`<span class="pill pill--call">📞 ${fmt(local(l.call_at))}</span>`);
    if (l.suggested_plan) pills.push(`<span class="pill">${esc(l.suggested_plan)}</span>`);
    if (l.lost_reason && STAGE[l.status]?.closed) pills.push(`<span class="pill">${esc(l.lost_reason)}</span>`);
    return `<article class="lcard ${urgent(l) ? 'lcard--urgent' : ''}" draggable="true" data-id="${l.id}" tabindex="0" aria-label="Abrir ficha de ${esc(l.name)}">
      <div class="lcard__top"><span class="grade grade--${esc(l.grade || 'C')}">${esc(l.grade || '?')}</span><span class="lcard__name">${esc(l.name)}</span></div>
      <div class="lcard__biz">${esc(l.business || '—')} · ${esc(l.ad_budget || 'sin presupuesto')}</div>
      <div class="lcard__meta">${pills.join('')}<span class="pill">${ago(utc(l.created_at))}</span></div>
    </article>`;
  }

  function renderBoard() {
    const rows = visible();
    const gOrder = { A: 0, B: 1, C: 2 };
    $('#board').innerHTML = STAGES.map((s) => {
      const items = rows.filter((l) => l.status === s.id)
        .sort((a, b) => (gOrder[a.grade] ?? 3) - (gOrder[b.grade] ?? 3) || utc(b.created_at) - utc(a.created_at));
      const sum = items.reduce((t, l) => t + (l.deal_value || 0), 0);
      return `<section class="col ${s.closed ? 'col--closed' : ''}" data-stage="${s.id}" style="--c:${s.color}">
        <header class="col__head"><div><h2>${s.label}</h2>${sum ? `<div class="col__sum">${money(sum)}</div>` : ''}</div><span class="count">${items.length}</span></header>
        <div class="col__body">${items.length ? items.map(cardHTML).join('') : '<p class="empty-col">Arrastrá un lead acá</p>'}</div>
      </section>`;
    }).join('');
  }

  // ---------- Lista ----------
  const COLS = [
    ['grade', 'Calif.'], ['name', 'Nombre'], ['business', 'Negocio'], ['status', 'Etapa'], ['suggested_plan', 'Plan'],
    ['ad_budget', 'Inversión'], ['next_followup_at', 'Próx. seguimiento'], ['origin', 'Origen'], ['created_at', 'Fecha'],
  ];
  function renderTable() {
    const rows = visible().slice().sort((a, b) => {
      const k = sort.key;
      const va = k === 'origin' ? origin(a) : a[k] ?? '';
      const vb = k === 'origin' ? origin(b) : b[k] ?? '';
      return (va > vb ? 1 : va < vb ? -1 : 0) * sort.dir;
    });
    $('#table').innerHTML = `<thead><tr>${COLS.map(([k, t]) => `<th data-sort="${k}">${t}${sort.key === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((l) => `<tr data-id="${l.id}">
        <td><span class="grade grade--${esc(l.grade || 'C')}">${esc(l.grade || '?')}</span></td>
        <td>${esc(l.name)}</td><td>${esc(l.business || '—')}</td>
        <td><span class="pill" style="border-color:${STAGE[l.status]?.color}">${STAGE[l.status]?.label || esc(l.status)}</span></td>
        <td>${esc(l.suggested_plan || '—')}</td><td>${esc(l.ad_budget || '—')}</td>
        <td>${l.next_followup_at ? `<span class="pill ${isOverdue(l) ? 'pill--late' : ''}">${fmt(local(l.next_followup_at))}</span>` : '—'}</td>
        <td>${esc(origin(l))}</td><td>${fmt(utc(l.created_at))}</td>
      </tr>`).join('') || `<tr><td colspan="${COLS.length}" class="empty">No hay leads con estos filtros.</td></tr>`}</tbody>`;
  }

  // ---------- Métricas ----------
  function bars(entries, total) {
    return `<div class="bars">${entries.map(([label, n, color]) => `<div class="bar" style="--c:${color || 'var(--blue)'}">
      <span>${esc(label)}</span><div class="bar__track"><div class="bar__fill" style="width:${total ? (n / total) * 100 : 0}%"></div></div><b>${n}</b></div>`).join('')}</div>`;
  }
  function renderMetrics() {
    const rows = visible();
    const total = rows.length;
    const by = (fn) => rows.reduce((m, l) => { const k = fn(l); m[k] = (m[k] || 0) + 1; return m; }, {});
    const won = rows.filter((l) => l.status === 'ganado');
    const closedLost = rows.filter((l) => STAGE[l.status]?.closed);
    const winRate = won.length + closedLost.length ? Math.round((won.length / (won.length + closedLost.length)) * 100) : null;
    const pipeline = rows.filter((l) => ACTIVE.includes(l.status)).reduce((t, l) => t + (l.deal_value || 0), 0);
    const wonValue = won.reduce((t, l) => t + (l.deal_value || 0), 0);
    const contacted = rows.filter((l) => l.first_contact_at);
    const avgMin = contacted.length ? Math.round(contacted.reduce((t, l) => t + (utc(l.first_contact_at) - utc(l.created_at)) / 60000, 0) / contacted.length) : null;
    const avgTxt = avgMin === null ? '—' : avgMin < 60 ? `${avgMin} min` : avgMin < 1440 ? `${(avgMin / 60).toFixed(1)} h` : `${(avgMin / 1440).toFixed(1)} d`;
    const reachedCall = rows.filter((l) => ['call_realizada', 'propuesta', 'seguimiento', 'ganado'].includes(l.status)).length;

    const grades = by((l) => l.grade || '?');
    const stages = by((l) => l.status);
    const reasons = by((l) => (STAGE[l.status]?.closed ? l.lost_reason || 'Sin motivo' : null));
    delete reasons.null;

    const origins = {};
    rows.forEach((l) => {
      const k = origin(l);
      const o = origins[k] || (origins[k] = { n: 0, A: 0, won: 0, value: 0 });
      o.n++;
      if (l.grade === 'A') o.A++;
      if (l.status === 'ganado') { o.won++; o.value += l.deal_value || 0; }
    });

    $('#metrics').innerHTML = `
      <div class="kpis">
        <div class="kpi"><small>Leads</small><strong>${total}</strong><span>con los filtros actuales</span></div>
        <div class="kpi"><small>Leads A</small><strong>${total ? Math.round(((grades.A || 0) / total) * 100) : 0}%</strong><span>${grades.A || 0} de ${total}</span></div>
        <div class="kpi"><small>Llegaron a la call</small><strong>${total ? Math.round((reachedCall / total) * 100) : 0}%</strong><span>${reachedCall} leads</span></div>
        <div class="kpi"><small>Tasa de cierre</small><strong>${winRate === null ? '—' : winRate + '%'}</strong><span>ganados sobre cerrados</span></div>
        <div class="kpi"><small>Valor en curso</small><strong>${money(pipeline)}</strong><span>por mes, etapas abiertas</span></div>
        <div class="kpi"><small>Valor ganado</small><strong>${money(wonValue)}</strong><span>por mes</span></div>
        <div class="kpi"><small>Primer contacto</small><strong>${avgTxt}</strong><span>tiempo promedio de respuesta</span></div>
      </div>
      <div class="panels">
        <div class="panel"><h3>Leads por etapa</h3>${bars(STAGES.map((s) => [s.label, stages[s.id] || 0, s.color]), total)}</div>
        <div class="panel"><h3>Leads por calificación</h3>${bars([['A · prioridad máxima', grades.A || 0, 'var(--gA)'], ['B · prioridad media', grades.B || 0, 'var(--gB)'], ['C · prioridad baja', grades.C || 0, 'var(--gC)']], total)}</div>
        <div class="panel"><h3>Motivos de pérdida</h3>${Object.keys(reasons).length ? bars(Object.entries(reasons).sort((a, b) => b[1] - a[1]), closedLost.length) : '<p class="empty">Todavía no hay leads perdidos.</p>'}</div>
        <div class="panel"><h3>Resultados por origen o campaña</h3>
          <table class="mini"><thead><tr><th>Origen</th><th class="n">Leads</th><th class="n">A</th><th class="n">Ganados</th><th class="n">Valor</th></tr></thead>
          <tbody>${Object.entries(origins).sort((a, b) => b[1].n - a[1].n).map(([k, o]) => `<tr><td>${esc(k)}</td><td class="n">${o.n}</td><td class="n">${o.A}</td><td class="n">${o.won}</td><td class="n">${money(o.value)}</td></tr>`).join('') || '<tr><td colspan="5">Sin datos</td></tr>'}</tbody></table>
        </div>
      </div>`;
  }

  function render() {
    renderToday();
    renderBoard();
    renderTable();
    renderMetrics();
  }

  // ---------- Ficha del lead ----------
  const toLocalInput = (s) => s || '';
  async function renderDrawer() {
    const l = leads.find((x) => x.id === openId);
    if (!l) return closeDrawer();
    const sugTpl = TEMPLATES.find((t) => t.stage === l.status) || TEMPLATES[0];
    const closed = STAGE[l.status]?.closed;
    $('#drawer-body').innerHTML = `
      <div class="d-head">
        <span class="grade grade--lg grade--${esc(l.grade || 'C')}">${esc(l.grade || '?')}</span>
        <div><h2 id="d-name">${esc(l.name)}</h2><p>${esc(l.business || '—')} · ingresó ${fmt(utc(l.created_at))} (${ago(utc(l.created_at))})</p></div>
        <button class="close" data-close aria-label="Cerrar">×</button>
      </div>
      <div class="d-body">
        <div class="prio prio--${esc(l.grade || 'C')}"><b>Lead ${esc(l.grade || '?')} · plan sugerido: ${esc(l.suggested_plan || '—')}.</b> ${PRIORITY[l.grade] || ''}</div>

        <div class="d-sec contact">
          <a class="btn btn--wa" target="_blank" rel="noopener" href="${waLink(l)}">WhatsApp ${esc(l.whatsapp)}</a>
          ${l.email ? `<a class="btn" href="mailto:${esc(l.email)}">✉️ ${esc(l.email)}</a>` : ''}
        </div>

        <div class="d-sec">
          <h3>Gestión</h3>
          <div class="grid2">
            <div class="f"><label for="d-status">Etapa</label><select id="d-status">${STAGES.map((s) => `<option value="${s.id}" ${s.id === l.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div>
            <div class="f"><label for="d-grade">Calificación</label><select id="d-grade">${['A', 'B', 'C'].map((g) => `<option ${g === l.grade ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
            <div class="f"><label for="d-plan">Plan</label><select id="d-plan">${PLANS.map((p) => `<option ${p === l.suggested_plan ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
            <div class="f"><label for="d-value">Valor mensual (ARS)</label><input id="d-value" type="number" min="0" step="1000" value="${l.deal_value ?? ''}"></div>
            <div class="f"><label for="d-follow">Próximo seguimiento</label><input id="d-follow" type="datetime-local" value="${esc(toLocalInput(l.next_followup_at))}"></div>
            <div class="f"><label for="d-call">Fecha de la call</label><input id="d-call" type="datetime-local" value="${esc(toLocalInput(l.call_at))}"></div>
            ${closed ? `<div class="f"><label for="d-lost">Motivo de pérdida</label><select id="d-lost"><option value="">Elegí un motivo</option>${LOST_REASONS.map((r) => `<option ${r === l.lost_reason ? 'selected' : ''}>${r}</option>`).join('')}</select></div>` : ''}
          </div>
          <div class="f" style="margin-top:10px"><label for="d-notes">Notas generales</label><textarea id="d-notes" rows="3" placeholder="Resumen del lead, objeciones, acuerdos…">${esc(l.notes || '')}</textarea></div>
          <div style="display:flex;gap:8px;align-items:center;margin-top:8px"><button class="btn btn--primary btn--sm" data-save>Guardar cambios</button><span class="saved" id="d-saved"></span></div>
        </div>

        <div class="d-sec">
          <h3>Mensajes de WhatsApp</h3>
          <div class="tpls">${TEMPLATES.map((t) => `<div class="tpl ${t === sugTpl ? 'tpl--sug' : ''}"><div><b>${t.title}</b>${t === sugTpl ? ' · sugerido para esta etapa' : ''}<small>${esc(fill(t.text, l)).slice(0, 110)}…</small></div><a class="btn btn--wa btn--sm" target="_blank" rel="noopener" href="${waLink(l, fill(t.text, l))}">Enviar</a></div>`).join('')}</div>
        </div>

        <div class="d-sec">
          <h3>Respuestas del formulario</h3>
          <dl class="answers">
            <dt>Negocio o rubro</dt><dd>${esc(l.business || '—')}</dd>
            <dt>Objetivo</dt><dd>${esc(l.goal || '—')}</dd>
            <dt>Situación</dt><dd>${esc(l.timeline || '—')}</dd>
            <dt>Inversión pensada</dt><dd>${esc(l.ad_budget || '—')}</dd>
            ${l.message ? `<dt>Mensaje</dt><dd>${esc(l.message)}</dd>` : ''}
            <dt>Origen</dt><dd>${esc(origin(l))}${l.utm_medium ? ' · ' + esc(l.utm_medium) : ''}${l.utm_content ? ' · ' + esc(l.utm_content) : ''}</dd>
            <dt>Formulario</dt><dd>${esc(l.source || '—')}</dd>
          </dl>
        </div>

        <div class="d-sec">
          <h3>Historial</h3>
          <div class="addnote"><input id="d-note" placeholder="Agregar una nota al historial (ej.: no atendió, volver a llamar)"><button class="btn btn--sm" data-addnote>Agregar</button></div>
          <ul class="timeline" id="d-events" style="margin-top:12px"><li><span>Cargando…</span></li></ul>
        </div>

        <div class="d-sec"><button class="btn btn--danger btn--sm" data-delete>Eliminar lead</button></div>
      </div>`;
    loadEvents(l.id);
  }

  const EVENT_COLORS = { creado: '#5aa6ff', etapa: '#ff8a2a', nota: '#a3b0c8', call: '#ffc857', seguimiento: '#f472b6', perdida: '#ff6b6b', calificacion: '#b28cff', valor: '#25d366', plan: '#25d366' };
  async function loadEvents(id) {
    try {
      const { events } = await api(`/api/admin/leads/${id}/events`);
      if (openId !== id) return;
      $('#d-events').innerHTML = events.map((e) => `<li style="--c:${EVENT_COLORS[e.type] || '#5aa6ff'}"><div>${esc(e.detail)}<time>${fmt(utc(e.created_at))}</time></div></li>`).join('') || '<li><span>Sin movimientos todavía.</span></li>';
    } catch {
      $('#d-events').innerHTML = '<li><span>No se pudo cargar el historial.</span></li>';
    }
  }

  function openDrawer(id) {
    openId = id;
    renderDrawer();
    $('#drawer').classList.add('open');
    $('#drawer').setAttribute('aria-hidden', 'false');
  }
  function closeDrawer() {
    openId = null;
    $('#drawer').classList.remove('open');
    $('#drawer').setAttribute('aria-hidden', 'true');
  }

  $('#drawer').addEventListener('click', async (e) => {
    if (e.target === $('#drawer') || e.target.closest('[data-close]')) return closeDrawer();
    const l = leads.find((x) => x.id === openId);
    if (!l) return;
    if (e.target.closest('[data-save]')) {
      const changes = {
        grade: $('#d-grade').value,
        suggested_plan: $('#d-plan').value,
        deal_value: $('#d-value').value === '' ? null : Number($('#d-value').value),
        next_followup_at: $('#d-follow').value || null,
        call_at: $('#d-call').value || null,
        notes: $('#d-notes').value,
      };
      if ($('#d-lost')) changes.lost_reason = $('#d-lost').value || null;
      const newStatus = $('#d-status').value;
      if (newStatus !== l.status) {
        const extra = await askStage(l, newStatus);
        if (!extra) return;
        Object.assign(changes, extra, { status: newStatus });
      }
      await patch(l.id, changes, 'Cambios guardados');
    }
    if (e.target.closest('[data-addnote]')) addNote(l.id);
    if (e.target.closest('[data-delete]') && confirm(`¿Eliminar a ${l.name} y todo su historial? No se puede deshacer.`)) {
      try {
        await api('/api/admin/leads/' + l.id, { method: 'DELETE' });
        leads = leads.filter((x) => x.id !== l.id);
        closeDrawer();
        render();
        toast('Lead eliminado');
      } catch (err) { toast('No se pudo eliminar: ' + err.message); }
    }
  });
  $('#drawer').addEventListener('change', (e) => {
    // Al elegir otro plan, propone su valor
    if (e.target.id === 'd-plan' && PLAN_VALUES[e.target.value]) $('#d-value').value = PLAN_VALUES[e.target.value];
  });
  $('#drawer').addEventListener('keydown', (e) => {
    if (e.target.id === 'd-note' && e.key === 'Enter') { e.preventDefault(); addNote(openId); }
  });
  async function addNote(id) {
    const input = $('#d-note');
    const detail = input.value.trim();
    if (!detail) return;
    try {
      await api(`/api/admin/leads/${id}/events`, { method: 'POST', body: JSON.stringify({ detail }) });
      input.value = '';
      loadEvents(id);
      toast('Nota agregada');
    } catch (err) { toast('No se pudo guardar la nota: ' + err.message); }
  }

  // ---------- Diálogo al cambiar de etapa ----------
  // Pide los datos que corresponden a la etapa nueva. Devuelve los cambios extra o null si se cancela.
  function askStage(lead, stage) {
    const dlg = $('#stage-dlg');
    let fields = '';
    if (stage === 'call_agendada') fields = `<div class="f"><label for="s-call">¿Cuándo es la call?</label><input id="s-call" type="datetime-local" required value="${esc(lead.call_at || '')}"></div>`;
    else if (stage === 'seguimiento' || stage === 'propuesta' || stage === 'contactado') fields = `<div class="f"><label for="s-follow">Próximo seguimiento (opcional)</label><input id="s-follow" type="datetime-local" value="${esc(lead.next_followup_at || '')}"></div>`;
    else if (stage === 'perdido' || stage === 'no_califica') fields = `<div class="f"><label for="s-lost">Motivo</label><select id="s-lost" required><option value="">Elegí un motivo</option>${LOST_REASONS.map((r) => `<option ${r === lead.lost_reason ? 'selected' : ''}>${r}</option>`).join('')}</select></div>`;
    else if (stage === 'ganado') fields = `<div class="f"><label for="s-plan">Plan contratado</label><select id="s-plan">${PLANS.slice(0, 4).map((p) => `<option ${p === lead.suggested_plan ? 'selected' : ''}>${p}</option>`).join('')}</select></div><div class="f"><label for="s-value">Valor mensual (ARS)</label><input id="s-value" type="number" min="0" step="1000" value="${lead.deal_value ?? ''}"></div>`;
    if (!fields) return Promise.resolve({});

    $('#stage-title').textContent = `Mover a ${lead.name.split(' ')[0]} a "${STAGE[stage].label}"`;
    $('#stage-fields').innerHTML = fields;
    const plan = $('#s-plan');
    if (plan) plan.onchange = () => { if (PLAN_VALUES[plan.value]) $('#s-value').value = PLAN_VALUES[plan.value]; };
    dlg.showModal();
    return new Promise((resolve) => {
      dlg.addEventListener('close', function onClose() {
        dlg.removeEventListener('close', onClose);
        if (dlg.returnValue !== 'ok') return resolve(null);
        const extra = {};
        if ($('#s-call')) extra.call_at = $('#s-call').value || null;
        if ($('#s-follow')) extra.next_followup_at = $('#s-follow').value || null;
        if ($('#s-lost')) { extra.lost_reason = $('#s-lost').value || null; extra.next_followup_at = null; }
        if ($('#s-plan')) { extra.suggested_plan = $('#s-plan').value; extra.deal_value = $('#s-value').value === '' ? null : Number($('#s-value').value); extra.next_followup_at = null; }
        resolve(extra);
      });
    });
  }

  async function moveTo(id, stage) {
    const l = leads.find((x) => x.id === id);
    if (!l || l.status === stage) return;
    const extra = await askStage(l, stage);
    if (!extra) return;
    patch(id, { ...extra, status: stage }, `Movido a ${STAGE[stage].label}`);
  }

  // ---------- Eventos de la interfaz ----------
  const board = $('#board');
  board.addEventListener('click', (e) => { const c = e.target.closest('.lcard'); if (c) openDrawer(Number(c.dataset.id)); });
  board.addEventListener('keydown', (e) => { const c = e.target.closest('.lcard'); if (c && e.key === 'Enter') openDrawer(Number(c.dataset.id)); });
  board.addEventListener('dragstart', (e) => {
    const c = e.target.closest('.lcard');
    if (!c) return;
    e.dataTransfer.setData('text/plain', c.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
    c.classList.add('dragging');
  });
  board.addEventListener('dragend', (e) => e.target.closest('.lcard')?.classList.remove('dragging'));
  board.addEventListener('dragover', (e) => {
    const col = e.target.closest('.col');
    if (!col) return;
    e.preventDefault();
    board.querySelectorAll('.col.drop').forEach((c) => c !== col && c.classList.remove('drop'));
    col.classList.add('drop');
  });
  board.addEventListener('dragleave', (e) => { const col = e.target.closest('.col'); if (col && !col.contains(e.relatedTarget)) col.classList.remove('drop'); });
  board.addEventListener('drop', (e) => {
    const col = e.target.closest('.col');
    if (!col) return;
    e.preventDefault();
    col.classList.remove('drop');
    moveTo(Number(e.dataTransfer.getData('text/plain')), col.dataset.stage);
  });

  $('#table').addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort]');
    if (th) { sort = { key: th.dataset.sort, dir: sort.key === th.dataset.sort ? -sort.dir : 1 }; return renderTable(); }
    const tr = e.target.closest('tr[data-id]');
    if (tr) openDrawer(Number(tr.dataset.id));
  });

  document.querySelectorAll('.tabs [data-view]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.tabs [data-view]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('is-active', v.id === 'view-' + b.dataset.view));
    try { localStorage.setItem('pao_crm_view', b.dataset.view); } catch { /* sin almacenamiento */ }
  }));
  try { const v = localStorage.getItem('pao_crm_view'); if (v) document.querySelector(`.tabs [data-view="${v}"]`)?.click(); } catch { /* sin almacenamiento */ }

  $('#today').addEventListener('click', (e) => {
    const c = e.target.closest('[data-focus]');
    if (!c) return;
    focus = focus === c.dataset.focus ? '' : c.dataset.focus;
    render();
  });
  $('#clear-focus').addEventListener('click', () => { focus = ''; render(); });
  $('#grade-filter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-g]');
    if (!b) return;
    gradeFilter = b.dataset.g;
    $('#grade-filter').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    render();
  });
  let qt;
  $('#q').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => { query = e.target.value.trim(); render(); }, 200); });
  $('#reload').addEventListener('click', () => load().then(() => toast('Actualizado')));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openId && !$('#stage-dlg').open) closeDrawer(); });

  // Actualiza solo cada 60 segundos para ver leads nuevos
  setInterval(() => { if (!openId && !$('#stage-dlg').open) load().catch(() => {}); }, 60000);

  load().catch((err) => { $('#board').innerHTML = `<p class="empty">No se pudo cargar el CRM: ${esc(err.message)}</p>`; });
})();
