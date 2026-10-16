// Tests del extractor y del análisis: node test/run.js
'use strict';
const assert = require('node:assert/strict');
const X = require('../src/extract.js');
const A = require('../src/analytics.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('✔ ' + name); }
  catch (e) { console.error('✘ ' + name + '\n  ' + e.message); process.exitCode = 1; }
}

test('parseCount entiende formatos locales', () => {
  assert.equal(X.parseCount('1,2 mil'), 1200);
  assert.equal(X.parseCount('3.4K'), 3400);
  assert.equal(X.parseCount('12.345'), 12345);
  assert.equal(X.parseCount('2,5 M'), 2500000);
  assert.equal(X.parseCount('1 mil millones'), 1e9);
  assert.equal(X.parseCount({ count: 77 }), 77);
  assert.equal(X.parseCount(''), null);
  assert.equal(X.parseCount(null), null);
});

// --- Instagram: timeline GraphQL nuevo (xdt) + reels ---
const igTimeline = {
  data: {
    xdt_api__v1__feed__user_timeline_graphql_connection: {
      edges: [
        { node: { code: 'ABC123', pk: '111', taken_at: 1717000000, media_type: 2, product_type: 'clips',
          like_count: 5400, comment_count: 120, play_count: 98000, video_duration: 22.4,
          caption: { text: 'Cómo duplicar ventas 🚀\nTip 1... #marketing #ventas' },
          image_versions2: { candidates: [{ url: 'https://scontent.cdninstagram.com/a.jpg' }] },
          video_versions: [{ url: 'https://scontent.cdninstagram.com/a.mp4' }],
          user: { username: 'pizzeria_x', pk: '9' }, clips_tab_pinned_user_ids: ['9'] } },
        { node: { code: 'DEF456', pk: '222', taken_at: 1716000000, media_type: 8, carousel_media_count: 4,
          like_count: 800, comment_count: 30,
          caption: { text: '5 errores al vender por WhatsApp #ventas' },
          carousel_media: [{ image_versions2: { candidates: [{ url: 'https://scontent.cdninstagram.com/c.jpg' }] } }],
          user: { username: 'pizzeria_x' } } },
        { node: { code: 'GHI789', pk: '333', taken_at: 1715000000, media_type: 1,
          like_count: 300, comment_count: 4, caption: null, user: { username: 'pizzeria_x' } } }
      ]
    }
  }
};
const igProfile = { data: { user: { username: 'pizzeria_x', full_name: 'Pizzería X', follower_count: 25000,
  following_count: 300, media_count: 412, is_verified: false, profile_pic_url: 'https://scontent.cdninstagram.com/p.jpg' } } };
const igOldGraph = { graphql: { user: { username: 'viejo', edge_followed_by: { count: 1000 },
  edge_owner_to_timeline_media: { count: 1, edges: [{ node: { __typename: 'GraphVideo', shortcode: 'OLD1', id: '444',
    taken_at_timestamp: 1600000000, is_video: true, video_view_count: 5000, edge_liked_by: { count: 250 },
    edge_media_to_comment: { count: 12 }, display_url: 'https://scontent.cdninstagram.com/o.jpg',
    edge_media_to_caption: { edges: [{ node: { text: 'Viejo formato' } }] }, owner: { username: 'viejo' } } }] } } } };

test('Instagram: lee reels, carruseles, fotos y perfil', () => {
  const s = new X.Store();
  X.ingestText(JSON.stringify(igTimeline), s, 'instagram');
  X.ingestText(JSON.stringify(igProfile), s, 'instagram');
  assert.equal(s.items.size, 3);
  const reel = s.items.get('instagram:111');
  assert.equal(reel.type, 'reel');
  assert.equal(reel.views, 98000);
  assert.equal(reel.likes, 5400);
  assert.equal(reel.comments, 120);
  assert.equal(reel.url, 'https://www.instagram.com/reel/ABC123/');
  assert.equal(reel.author, 'pizzeria_x');
  assert.equal(reel.pinned, true);
  assert.equal(reel.date, 1717000000000);
  assert.deepEqual(reel.hashtags, ['#marketing', '#ventas']);
  assert.equal(s.items.get('instagram:222').type, 'carrusel');
  assert.equal(s.items.get('instagram:222').thumb, 'https://scontent.cdninstagram.com/c.jpg');
  assert.equal(s.items.get('instagram:333').type, 'foto');
  assert.equal(s.profileOf('instagram', 'Pizzeria_X').followers, 25000);
});

test('Instagram: formato GraphQL viejo (shortcode/edge_*)', () => {
  const s = new X.Store();
  X.ingestJSON(igOldGraph, s, 'instagram');
  const it = s.items.get('instagram:444');
  assert.equal(it.views, 5000);
  assert.equal(it.likes, 250);
  assert.equal(it.comments, 12);
  assert.equal(it.caption, 'Viejo formato');
  assert.equal(s.profileOf('instagram', 'viejo').followers, 1000);
});

test('Instagram: un mismo post repetido se fusiona y conserva el mayor valor', () => {
  const s = new X.Store();
  X.ingestJSON(igTimeline, s, 'instagram');
  const again = JSON.parse(JSON.stringify(igTimeline));
  again.data.xdt_api__v1__feed__user_timeline_graphql_connection.edges[0].node.play_count = 99000;
  again.data.xdt_api__v1__feed__user_timeline_graphql_connection.edges[0].node.like_count = 5000;
  X.ingestJSON(again, s, 'instagram');
  assert.equal(s.items.size, 3);
  assert.equal(s.items.get('instagram:111').views, 99000);
  assert.equal(s.items.get('instagram:111').likes, 5400);
});

// --- TikTok: API item_list (web) + datos iniciales de rehidratación ---
const ttList = { itemList: [
  { id: '7300000000000000001', createTime: 1717100000, desc: 'Receta en 30s #cocina',
    author: { uniqueId: 'chef_ana' }, authorStats: { followerCount: 50000 },
    stats: { playCount: 1200000, diggCount: 90000, commentCount: 800, shareCount: 4000, collectCount: 7000 },
    statsV2: { playCount: '1200345', diggCount: '90012', commentCount: '801', shareCount: '4001', collectCount: '7002' },
    video: { duration: 31, cover: 'https://p16-sign.tiktokcdn.com/c1.jpg', playAddr: 'https://v16.tiktokcdn.com/v1.mp4' },
    music: { title: 'sonido original' }, isPinnedItem: true },
  { id: '7300000000000000002', createTime: '1717000000', desc: 'Fotos del local',
    author: { uniqueId: 'chef_ana' }, imagePost: { cover: { imageURL: { urlList: ['https://p16.tiktokcdn.com/ph.jpg'] } } },
    stats: { playCount: 3000, diggCount: 100, commentCount: 2, shareCount: 1, collectCount: 5 }, video: {} }
], hasMore: true, cursor: '123' };
const ttUniversal = { __DEFAULT_SCOPE__: { 'webapp.user-detail': { userInfo: {
  user: { uniqueId: 'chef_ana', nickname: 'Ana', verified: true, avatarLarger: 'https://p16.tiktokcdn.com/av.jpg' },
  stats: { followerCount: 51000, followingCount: 10, heartCount: 2000000, videoCount: 300 } } } } };
const ttApp = { aweme_list: [{ aweme_id: '7300000000000000009', create_time: 1716000000, desc: 'app',
  author: { unique_id: 'chef_ana' }, statistics: { play_count: 500, digg_count: 50, comment_count: 5, share_count: 1, collect_count: 2 },
  video: { duration: 15000, cover: { url_list: ['https://p16.tiktokcdn.com/x.jpg'] } } }] };

test('TikTok: lee videos, fotos, statsV2 exactos y perfil', () => {
  const s = new X.Store();
  X.ingestText(JSON.stringify(ttList), s, 'tiktok');
  X.ingestText(JSON.stringify(ttUniversal), s, 'tiktok');
  X.ingestText(JSON.stringify(ttApp), s, 'tiktok');
  assert.equal(s.items.size, 3);
  const v = s.items.get('tiktok:7300000000000000001');
  assert.equal(v.views, 1200345);
  assert.equal(v.likes, 90012);
  assert.equal(v.shares, 4001);
  assert.equal(v.saves, 7002);
  assert.equal(v.duration, 31);
  assert.equal(v.pinned, true);
  assert.equal(v.url, 'https://www.tiktok.com/@chef_ana/video/7300000000000000001');
  const p = s.items.get('tiktok:7300000000000000002');
  assert.equal(p.type, 'carrusel');
  assert.equal(p.url, 'https://www.tiktok.com/@chef_ana/photo/7300000000000000002');
  assert.equal(p.date, 1717000000000);
  assert.equal(s.items.get('tiktok:7300000000000000009').duration, 15);
  const prof = s.profileOf('tiktok', 'chef_ana');
  assert.equal(prof.followers, 51000);
  assert.equal(prof.likesTotal, 2000000);
});

// --- Facebook: Story del feed (comet) + reel suelto, en JSON por líneas con prefijo ---
const fbStory = { data: { node: { timeline_list_feed_units: { edges: [{ node: {
  __typename: 'Story', id: 'UzpfS…', post_id: '1029384756',
  comet_sections: {
    content: { story: { message: { text: 'Promo 2x1 este finde 🍕 #promo' },
      attachments: [{ styles: { attachment: { media: { __typename: 'Video', id: '555', play_count: 15000,
        browser_native_sd_url: 'https://video.fbcdn.net/v.mp4', length_in_second: 40,
        preferred_thumbnail: { image: { uri: 'https://scontent.fbcdn.net/t.jpg' } } } } } }] } },
    context_layout: { story: { comet_sections: { metadata: [{ story: { creation_time: 1717200000,
      url: 'https://www.facebook.com/pizzeriax/posts/pfbid0abc' } }] } } },
    actor_photo: { story: { actors: [{ name: 'Pizzería X' }] } },
    feedback: { story: { feedback_context: { feedback_target_with_context: {
      comet_ufi_summary_and_actions_renderer: { feedback: {
        reaction_count: { count: 340 }, share_count: { count: 25 },
        comment_rendering_instance: { comments: { total_count: 48 } } } } } } } }
  } } }] } } } };
const fbReel = { data: { node: { __typename: 'Video', id: '777', play_count: 220000,
  permalink_url: 'https://www.facebook.com/reel/777', creation_time: 1717300000,
  owner: { name: 'Pizzería X' }, feedback: { reaction_count: { count: 9000 }, share_count: { count: 300 },
  total_comment_count: 150 }, first_frame_thumbnail: 'https://scontent.fbcdn.net/r.jpg' } } };

test('Facebook: Story con video, reacciones, comentarios y compartidos', () => {
  const s = new X.Store();
  const text = 'for (;;);' + JSON.stringify(fbStory) + '\n' + JSON.stringify(fbReel) + '\n{"incompleto":';
  X.ingestText(text, s, 'facebook');
  assert.equal(s.items.size, 2, 'el video dentro del Story no debe duplicarse');
  const st = s.items.get('facebook:1029384756');
  assert.equal(st.likes, 340);
  assert.equal(st.comments, 48);
  assert.equal(st.shares, 25);
  assert.equal(st.views, 15000);
  assert.equal(st.caption, 'Promo 2x1 este finde 🍕 #promo');
  assert.equal(st.author, 'Pizzería X');
  assert.equal(st.date, 1717200000000);
  assert.equal(st.url, 'https://www.facebook.com/pizzeriax/posts/pfbid0abc');
  assert.equal(st.type, 'video');
  assert.equal(st.duration, 40);
  const r = s.items.get('facebook:777');
  assert.equal(r.type, 'reel');
  assert.equal(r.views, 220000);
  assert.equal(r.likes, 9000);
  assert.equal(r.comments, 150);
  assert.equal(r.thumb, 'https://scontent.fbcdn.net/r.jpg');
});

test('TikTok: respuesta real de /api/post/item_list (capturada en octubre 2026)', () => {
  const real = require('./fixtures/tiktok_item_list_real.json');
  const s = new X.Store();
  X.ingestJSON(real, s, 'tiktok');
  assert.equal(s.items.size, 3);
  const items = s.list();
  for (const it of items) {
    assert.equal(it.author, 'google');
    assert.ok(it.views > 100000 && it.likes > 1000 && it.comments > 100 && it.shares > 100 && it.saves > 1000);
    assert.ok(it.date > Date.UTC(2026, 0, 1));
    assert.ok(/^https:\/\//.test(it.thumb));
    assert.ok(/^https:\/\/www\.tiktok\.com\/@google\/(video|photo)\/\d+$/.test(it.url));
  }
  const top = A.sortItems(A.enrich(items, null), 'views', 'desc')[0];
  assert.equal(top.views, 452000);
  assert.equal(top.likes, 75100);
});

test('Facebook: video real de la pestaña Videos de una página (capturado en octubre 2026)', () => {
  const real = require('./fixtures/facebook_video_real.json');
  const s = new X.Store();
  X.ingestJSON(real, s, 'facebook');
  assert.equal(s.items.size, 1);
  const it = s.list()[0];
  assert.equal(it.id, '452499129200583');
  assert.equal(it.views, 12484);
  assert.equal(it.likes, 833);
  assert.equal(it.duration, 253);
  assert.equal(it.date, 1616259726000);
  assert.equal(it.type, 'video');
  assert.ok(/facebook\.com\/NASA\/videos\//.test(it.url));
  assert.ok(it.caption.startsWith('This week'));
  assert.ok(/^https:\/\/scontent/.test(it.thumb));
  assert.ok(/^https:\/\/video/.test(it.video));
});

test('profileFromUrl detecta la cuenta del perfil abierto', () => {
  assert.equal(X.profileFromUrl('instagram', '/pizzeria_x/reels/'), 'pizzeria_x');
  assert.equal(X.profileFromUrl('instagram', '/reel/ABC/'), null);
  assert.equal(X.profileFromUrl('tiktok', '/@chef_ana'), 'chef_ana');
  assert.equal(X.profileFromUrl('tiktok', '/foryou'), null);
  assert.equal(X.profileFromUrl('facebook', '/NASA/videos'), 'NASA');
  assert.equal(X.profileFromUrl('facebook', '/watch/'), null);
});

// --- Análisis ---
function sample() {
  const s = new X.Store();
  X.ingestJSON(igTimeline, s, 'instagram');
  return s.list();
}

test('enrich calcula ER, outlier y gancho', () => {
  const items = A.enrich(sample(), 25000);
  const reel = items.find((i) => i.id === '111');
  assert.equal(reel.interactions, 5520);
  assert.ok(Math.abs(reel.er - 5.6327) < 0.01);
  assert.ok(Math.abs(reel.erFollowers - 22.08) < 0.01);
  assert.equal(reel.outlier, 1); // único con vistas → igual a la mediana
  assert.equal(reel.hook, 'Cómo duplicar ventas 🚀');
  const foto = items.find((i) => i.id === '333');
  assert.equal(foto.er, null);
  assert.equal(foto.outlier, 300 / 800); // sin vistas → likes contra la mediana de likes
});

test('sortItems ordena y deja los vacíos al final', () => {
  const items = A.enrich(sample(), null);
  const byViews = A.sortItems(items, 'views', 'desc');
  assert.equal(byViews[0].id, '111');
  const byLikesAsc = A.sortItems(items, 'likes', 'asc');
  assert.deepEqual(byLikesAsc.map((i) => i.id), ['333', '222', '111']);
  const byDate = A.sortItems(items, 'date', 'desc');
  assert.equal(byDate[0].id, '111');
});

test('filterItems por tipo, texto, fechas y últimos N', () => {
  const items = sample();
  assert.equal(A.filterItems(items, { type: 'reel' }).length, 1);
  assert.equal(A.filterItems(items, { search: 'whatsapp' }).length, 1);
  assert.equal(A.filterItems(items, { author: 'PIZZERIA_X' }).length, 3);
  assert.equal(A.filterItems(items, { lastN: 2 }).length, 2);
  assert.equal(A.filterItems(items, { hidePinned: true }).length, 2);
  assert.equal(A.filterItems(items, { from: '2024-05-25' }).length, 1);
});

test('summary, hashtags, horarios y formatos', () => {
  const items = A.enrich(sample(), 25000);
  const s = A.summary(items, { followers: 25000 });
  assert.equal(s.count, 3);
  assert.equal(s.totalViews, 98000);
  assert.equal(s.followers, 25000);
  const tags = A.topHashtags(items);
  assert.equal(tags[0].tag, '#ventas');
  assert.equal(tags[0].uses, 2);
  assert.equal(A.byWeekday(items).length, 7);
  assert.equal(A.byHour(items).reduce((n, r) => n + r.count, 0), 1);
  assert.ok(A.byFormat(items).length >= 1);
});

test('compareSnapshot calcula crecimiento', () => {
  const items = A.enrich(sample(), null);
  const snap = { items: items.map((i) => ({ key: i.key, views: i.views != null ? i.views - 1000 : null, likes: i.likes - 10 })) };
  A.compareSnapshot(items, snap);
  assert.equal(items.find((i) => i.id === '111').growthViews, 1000);
  assert.equal(items.find((i) => i.id === '222').growthLikes, 10);
});

test('exportaciones CSV, TSV, Excel y JSON', () => {
  const items = A.enrich(sample(), null);
  const csv = A.toCSV(items);
  assert.ok(csv.startsWith('﻿Red,Usuario,Tipo,Fecha,Vistas'));
  assert.equal(csv.split('\r\n').length, 4);
  assert.ok(csv.includes('"Cómo duplicar ventas 🚀\nTip 1... #marketing #ventas"'));
  const tsv = A.toTSV(items);
  assert.equal(tsv.split('\n').length, 4);
  const xls = A.toXLS(items);
  assert.ok(xls.includes('<Data ss:Type="Number">98000</Data>'));
  assert.ok(xls.includes('Worksheet'));
  const json = JSON.parse(A.toJSON(items));
  assert.equal(json.length, 3);
  assert.equal(typeof json[0].date, 'string');
});

test('fmt abrevia números en formato argentino', () => {
  assert.equal(A.fmt(1234567), '1,2 M');
  assert.equal(A.fmt(15300), '15,3 K');
  assert.equal(A.fmt(null), '—');
  assert.equal(A.fmt(2.345, 1), '2,3');
});

console.log('\n' + passed + ' tests OK');
