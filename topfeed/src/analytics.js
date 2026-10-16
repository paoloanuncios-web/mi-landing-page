/*
 * TopFeed Pro — métricas, análisis y exportación.
 */
(function (root) {
  'use strict';

  const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  function median(arr) {
    const a = arr.filter(n => n != null && Number.isFinite(n)).sort((x, y) => x - y);
    if (!a.length) return null;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  function avg(arr) {
    const a = arr.filter(n => n != null && Number.isFinite(n));
    return a.length ? a.reduce((s, n) => s + n, 0) / a.length : null;
  }

  function sum(arr) { return arr.reduce((s, n) => s + (n || 0), 0); }

  function interactions(it) {
    return (it.likes || 0) + (it.comments || 0) + (it.shares || 0) + (it.saves || 0);
  }

  // Agrega métricas derivadas a cada post: ER, outlier, interacciones, gancho.
  // followers: seguidores del perfil (si se conocen) para ER por seguidores.
  function enrich(items, followers) {
    const baseViews = median(items.map(i => i.views));
    const baseLikes = median(items.map(i => i.likes));
    for (const it of items) {
      it.interactions = interactions(it);
      // Sin likes/comentarios/compartidos/guardados (ej. listas de YouTube) no hay engagement que calcular.
      const hasEng = it.likes != null || it.comments != null || it.shares != null || it.saves != null;
      it.er = it.views && hasEng ? (it.interactions / it.views) * 100 : null;
      const f = followers || it.followers;
      it.erFollowers = f && (it.likes != null || it.comments != null) ? (((it.likes || 0) + (it.comments || 0)) / f) * 100 : null;
      if (it.views != null && baseViews) it.outlier = it.views / baseViews;
      else if (it.likes != null && baseLikes) it.outlier = it.likes / baseLikes;
      else it.outlier = null;
      it.viewsPerFollower = f && it.views != null ? it.views / f : null;
      it.hook = hookOf(it.caption);
      const ageDays = it.date ? Math.max((Date.now() - it.date) / 864e5, 1 / 24) : null;
      it.viewsPerDay = ageDays && it.views != null ? it.views / ageDays : null;
    }
    return items;
  }

  function hookOf(caption) {
    if (!caption) return '';
    const line = caption.split(/\n/).map(s => s.trim()).find(Boolean) || '';
    return line.length > 140 ? line.slice(0, 137) + '…' : line;
  }

  const SORTS = {
    views: (i) => i.views, likes: (i) => i.likes, comments: (i) => i.comments, shares: (i) => i.shares,
    saves: (i) => i.saves, er: (i) => i.er, erFollowers: (i) => i.erFollowers, outlier: (i) => i.outlier,
    interactions: (i) => i.interactions, viewsPerDay: (i) => i.viewsPerDay, date: (i) => i.date,
    duration: (i) => i.duration, growthViews: (i) => i.growthViews
  };

  function sortItems(items, by, dir) {
    const get = SORTS[by] || SORTS.views;
    const d = dir === 'asc' ? 1 : -1;
    return items.slice().sort((a, b) => {
      const x = get(a), y = get(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1; // sin dato siempre al final
      if (y == null) return -1;
      return (x - y) * d;
    });
  }

  function filterItems(items, f) {
    f = f || {};
    const q = (f.search || '').trim().toLowerCase();
    const from = f.from ? new Date(f.from + 'T00:00:00').getTime() : null;
    const to = f.to ? new Date(f.to + 'T23:59:59').getTime() : null;
    let out = items.filter(it => {
      if (f.author && (it.author || '').toLowerCase() !== f.author.toLowerCase()) return false;
      if (f.type && f.type !== 'todos' && it.type !== f.type) return false;
      if (from && (!it.date || it.date < from)) return false;
      if (to && (!it.date || it.date > to)) return false;
      if (f.minViews && (it.views || 0) < f.minViews) return false;
      if (f.minLikes && (it.likes || 0) < f.minLikes) return false;
      if (f.hidePinned && it.pinned) return false;
      if (q && (it.caption || '').toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    if (f.lastN) {
      out = out.slice().sort((a, b) => (b.date || 0) - (a.date || 0)).slice(0, f.lastN);
    }
    return out;
  }

  function summary(items, profile) {
    const dated = items.filter(i => i.date).sort((a, b) => a.date - b.date);
    let perWeek = null;
    if (dated.length > 1) {
      const weeks = (dated[dated.length - 1].date - dated[0].date) / (7 * 864e5);
      perWeek = weeks > 0 ? dated.length / weeks : null;
    }
    const views = items.map(i => i.views);
    const top = items.slice().sort((a, b) => (b.views || b.likes || 0) - (a.views || a.likes || 0))[0] || null;
    return {
      count: items.length,
      totalViews: sum(views),
      avgViews: avg(views), medianViews: median(views),
      avgLikes: avg(items.map(i => i.likes)), avgComments: avg(items.map(i => i.comments)),
      avgShares: avg(items.map(i => i.shares)),
      avgER: avg(items.map(i => i.er)), avgERFollowers: avg(items.map(i => i.erFollowers)),
      perWeek: perWeek,
      outliers: items.filter(i => i.outlier != null && i.outlier >= 2).length,
      followers: profile ? profile.followers : null,
      top: top,
      firstDate: dated.length ? dated[0].date : null,
      lastDate: dated.length ? dated[dated.length - 1].date : null
    };
  }

  // Promedio de una métrica agrupado por una clave.
  function groupAvg(items, keyFn, metric) {
    const g = new Map();
    for (const it of items) {
      const k = keyFn(it);
      if (k == null) continue;
      const v = metric(it);
      if (v == null) continue;
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(v);
    }
    return Array.from(g.entries()).map(([k, vals]) => ({ key: k, avg: avg(vals), count: vals.length }));
  }

  function mainMetric(items) {
    return items.some(i => i.views != null) ? (i) => i.views : (i) => i.likes;
  }

  // Las fechas relativas ("hace 2 semanas") no traen hora real: no sirven para día/horario.
  const exact = (items) => items.filter(i => !i.approxDate);

  function byWeekday(items) {
    items = exact(items);
    const m = mainMetric(items);
    const rows = groupAvg(items, i => (i.date ? new Date(i.date).getDay() : null), m);
    return DAYS.map((d, idx) => {
      const r = rows.find(x => x.key === idx);
      return { label: d, avg: r ? r.avg : 0, count: r ? r.count : 0 };
    });
  }

  function byHour(items) {
    items = exact(items);
    const m = mainMetric(items);
    const blocks = [[0, 6, '0-6 h'], [6, 9, '6-9 h'], [9, 12, '9-12 h'], [12, 15, '12-15 h'],
      [15, 18, '15-18 h'], [18, 21, '18-21 h'], [21, 24, '21-24 h']];
    const rows = groupAvg(items, i => {
      if (!i.date) return null;
      const h = new Date(i.date).getHours();
      return blocks.findIndex(b => h >= b[0] && h < b[1]);
    }, m);
    return blocks.map((b, idx) => {
      const r = rows.find(x => x.key === idx);
      return { label: b[2], avg: r ? r.avg : 0, count: r ? r.count : 0 };
    });
  }

  function byFormat(items) {
    const types = Array.from(new Set(items.map(i => i.type).filter(Boolean)));
    return types.map(t => {
      const g = items.filter(i => i.type === t);
      return { label: t, count: g.length, avgViews: avg(g.map(i => i.views)), avgLikes: avg(g.map(i => i.likes)),
        avgComments: avg(g.map(i => i.comments)), er: avg(g.map(i => i.er)) };
    }).sort((a, b) => (b.avgLikes || 0) - (a.avgLikes || 0));
  }

  function byDuration(items) {
    const m = mainMetric(items);
    const buckets = [[0, 8, '0-7 s'], [8, 16, '8-15 s'], [16, 31, '16-30 s'], [31, 61, '31-60 s'],
      [61, 181, '1-3 min'], [181, 1e9, '+3 min']];
    const rows = groupAvg(items.filter(i => i.duration), i => buckets.findIndex(b => i.duration >= b[0] && i.duration < b[1]), m);
    return buckets.map((b, idx) => {
      const r = rows.find(x => x.key === idx);
      return { label: b[2], avg: r ? r.avg : 0, count: r ? r.count : 0 };
    });
  }

  function topHashtags(items, limit) {
    const m = mainMetric(items);
    const g = new Map();
    for (const it of items) {
      const v = m(it);
      for (const h of it.hashtags || []) {
        if (!g.has(h)) g.set(h, { uses: 0, vals: [] });
        const e = g.get(h);
        e.uses++;
        if (v != null) e.vals.push(v);
      }
    }
    return Array.from(g.entries())
      .map(([tag, e]) => ({ tag, uses: e.uses, avg: avg(e.vals) }))
      .sort((a, b) => (b.uses >= 2) - (a.uses >= 2) || (b.avg || 0) - (a.avg || 0) || b.uses - a.uses)
      .slice(0, limit || 15);
  }

  function topHooks(items, limit) {
    const m = mainMetric(items);
    return items.filter(i => i.hook).sort((a, b) => (m(b) || 0) - (m(a) || 0)).slice(0, limit || 10);
  }

  // Compara contra un snapshot anterior: cuánto creció cada post.
  function compareSnapshot(items, snapshot) {
    if (!snapshot || !snapshot.items) return;
    const prev = new Map(snapshot.items.map(i => [i.key, i]));
    for (const it of items) {
      const p = prev.get(it.key);
      it.growthViews = p && it.views != null && p.views != null ? it.views - p.views : null;
      it.growthLikes = p && it.likes != null && p.likes != null ? it.likes - p.likes : null;
    }
  }

  // ---------- exportación ----------

  const COLUMNS = [
    ['Red', i => i.platform], ['Usuario', i => i.author], ['Tipo', i => i.type],
    ['Fecha', i => (i.date ? (i.approxDate ? '≈ ' + new Date(i.date).toISOString().slice(0, 10) : new Date(i.date).toISOString().slice(0, 16).replace('T', ' ')) : '')],
    ['Vistas', i => i.views], ['Likes', i => i.likes], ['Comentarios', i => i.comments],
    ['Compartidos', i => i.shares], ['Guardados', i => i.saves], ['Interacciones', i => i.interactions],
    ['ER % (vistas)', i => (i.er != null ? +i.er.toFixed(2) : null)],
    ['ER % (seguidores)', i => (i.erFollowers != null ? +i.erFollowers.toFixed(2) : null)],
    ['Outlier (x mediana)', i => (i.outlier != null ? +i.outlier.toFixed(2) : null)],
    ['Vistas por día', i => (i.viewsPerDay != null ? Math.round(i.viewsPerDay) : null)],
    ['Crecimiento vistas', i => i.growthViews],
    ['Duración (s)', i => i.duration], ['Fijado', i => (i.pinned ? 'sí' : '')], ['Audio', i => i.music],
    ['Hashtags', i => (i.hashtags || []).join(' ')], ['Gancho', i => i.hook], ['Texto', i => i.caption],
    ['Transcripción', i => i.transcript],
    ['URL', i => i.url], ['Miniatura', i => i.thumb], ['ID', i => i.id]
  ];

  function rows(items) {
    return items.map(it => COLUMNS.map(c => { const v = c[1](it); return v == null ? '' : v; }));
  }

  function toCSV(items) {
    const esc = (v) => {
      const s = String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [COLUMNS.map(c => esc(c[0])).join(',')];
    for (const r of rows(items)) lines.push(r.map(esc).join(','));
    return '﻿' + lines.join('\r\n');
  }

  function toTSV(items) {
    const esc = (v) => String(v).replace(/[\t\r\n]+/g, ' ');
    return [COLUMNS.map(c => c[0]).join('\t')].concat(rows(items).map(r => r.map(esc).join('\t'))).join('\n');
  }

  // Excel 2003 XML (SpreadsheetML): Excel lo abre nativo con números como números.
  function toXLS(items) {
    const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      // caracteres de control inválidos en XML
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
    const cell = (v, style) => {
      if (typeof v === 'number') return '<Cell' + (style ? ' ss:StyleID="' + style + '"' : '') + '><Data ss:Type="Number">' + v + '</Data></Cell>';
      return '<Cell><Data ss:Type="String">' + x(v) + '</Data></Cell>';
    };
    let out = '<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n' +
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
      '<Styles><Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#E8E2FF" ss:Pattern="Solid"/></Style>' +
      '<Style ss:ID="n"><NumberFormat ss:Format="#,##0"/></Style></Styles>' +
      '<Worksheet ss:Name="TopFeed"><Table>';
    out += '<Row>' + COLUMNS.map(c => '<Cell ss:StyleID="h"><Data ss:Type="String">' + x(c[0]) + '</Data></Cell>').join('') + '</Row>';
    for (const r of rows(items)) out += '<Row>' + r.map(v => cell(v, Number.isInteger(v) ? 'n' : null)).join('') + '</Row>';
    out += '</Table></Worksheet></Workbook>';
    return out;
  }

  function toJSON(items) {
    const keep = ['platform', 'id', 'url', 'author', 'type', 'date', 'views', 'likes', 'comments', 'shares', 'saves',
      'interactions', 'er', 'erFollowers', 'outlier', 'viewsPerDay', 'duration', 'pinned', 'music', 'hashtags', 'hook',
      'caption', 'transcript', 'thumb', 'video'];
    return JSON.stringify(items.map(it => {
      const o = {};
      for (const k of keep) o[k] = k === 'date' && it.date ? new Date(it.date).toISOString() : (it[k] === undefined ? null : it[k]);
      return o;
    }), null, 2);
  }

  function fmt(n, dec) {
    if (n == null || !Number.isFinite(n)) return '—';
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(1).replace('.', ',') + ' MM';
    if (a >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' M';
    if (a >= 1e4) return (n / 1e3).toFixed(1).replace('.', ',') + ' K';
    return dec ? n.toFixed(dec).replace('.', ',') : Math.round(n).toLocaleString('es-AR');
  }

  const api = {
    median, avg, enrich, hookOf, sortItems, filterItems, summary, byWeekday, byHour, byFormat, byDuration,
    topHashtags, topHooks, compareSnapshot, toCSV, toTSV, toXLS, toJSON, fmt, COLUMNS, SORTS
  };
  root.TFAnalytics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
