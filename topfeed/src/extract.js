/*
 * TopFeed Pro — extractor de datos.
 * Lee las respuestas JSON internas de Instagram, TikTok y Facebook
 * y las convierte a un formato único de "post" con métricas.
 * Funciona en el navegador (content script) y en Node (tests).
 */
(function (root) {
  'use strict';

  // ---------- utilidades ----------

  // Convierte "1,2 mil", "3.4K", "12.345", 1200 → número. Devuelve null si no hay dato.
  function parseCount(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'object') {
      if ('count' in v) return parseCount(v.count);
      if ('total_count' in v) return parseCount(v.total_count);
      return null;
    }
    let s = String(v).trim().toLowerCase().replace(/ /g, ' ');
    if (!s) return null;
    let mult = 1;
    const suffixes = [
      [/\s*(mil millones|billones|bn|b)$/, 1e9],
      [/\s*(millones|millón|millon|mill|mln|m)$/, 1e6],
      [/\s*(mil|k)$/, 1e3]
    ];
    for (const [re, m] of suffixes) {
      if (re.test(s)) { mult = m; s = s.replace(re, ''); break; }
    }
    s = s.replace(/[^\d.,]/g, '');
    if (!s) return null;
    let n;
    if (mult > 1) {
      // Con sufijo, "1,2" o "1.2" es decimal.
      n = parseFloat(s.replace(',', '.'));
    } else {
      // Sin sufijo, puntos y comas son separadores de miles.
      n = parseInt(s.replace(/[.,]/g, ''), 10);
    }
    return Number.isFinite(n) ? Math.round(n * mult) : null;
  }

  function firstNum() {
    for (let i = 0; i < arguments.length; i++) {
      const n = parseCount(arguments[i]);
      if (n !== null) return n;
    }
    return null;
  }

  function toMs(t) {
    if (t === null || t === undefined || t === '') return null;
    const n = typeof t === 'number' ? t : Number(t);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n < 1e12 ? n * 1000 : n; // segundos → ms
  }

  function isObj(o) { return o !== null && typeof o === 'object' && !Array.isArray(o); }

  function hashtagsOf(text) {
    if (!text) return [];
    const m = text.match(/#[\p{L}\p{N}_]+/gu);
    return m ? Array.from(new Set(m.map(h => h.toLowerCase()))) : [];
  }

  // Recorre un árbol JSON sin recursión (evita desbordes con respuestas enormes).
  function walk(rootObj, visit) {
    const stack = [rootObj];
    const seen = new Set();
    while (stack.length) {
      const node = stack.pop();
      if (node === null || typeof node !== 'object' || seen.has(node)) continue;
      seen.add(node);
      if (!Array.isArray(node)) visit(node);
      const vals = Array.isArray(node) ? node : Object.values(node);
      for (let i = vals.length - 1; i >= 0; i--) {
        const v = vals[i];
        if (v !== null && typeof v === 'object') stack.push(v);
      }
    }
  }

  // Búsqueda en anchura acotada: devuelve el primer valor (el más "cercano") de cada clave pedida.
  function scanFields(rootObj, wanted, maxNodes) {
    const found = {};
    const queue = [rootObj];
    let head = 0;
    const seen = new Set();
    let left = Object.keys(wanted).length;
    while (head < queue.length && head < (maxNodes || 5000) && left > 0) {
      const node = queue[head++];
      if (node === null || typeof node !== 'object' || seen.has(node)) continue;
      seen.add(node);
      if (Array.isArray(node)) {
        for (const v of node) if (v && typeof v === 'object') queue.push(v);
        continue;
      }
      for (const k in node) {
        const v = node[k];
        for (const field in wanted) {
          if (field in found) continue;
          const getter = wanted[field][k];
          if (!getter) continue;
          const val = getter(v, node);
          if (val !== null && val !== undefined && val !== '') { found[field] = val; left--; }
        }
        if (v && typeof v === 'object') queue.push(v);
      }
    }
    return found;
  }

  // ---------- Instagram ----------

  // La pestaña Reels manda los reels sin fecha (taken_at): alcanza con código + ID + algún dato del post.
  function igIsMedia(o) {
    if (typeof o.code !== 'string' && typeof o.shortcode !== 'string') return false;
    const hasData = 'like_count' in o || 'edge_liked_by' in o || 'edge_media_preview_like' in o ||
      'play_count' in o || 'ig_play_count' in o || 'view_count' in o || 'comment_count' in o ||
      'edge_media_to_comment' in o || 'media_type' in o;
    if (!hasData) return false;
    return o.taken_at != null || o.taken_at_timestamp != null || o.pk != null || o.id != null;
  }

  function igMedia(o) {
    const code = o.code || o.shortcode;
    const isReel = o.product_type === 'clips' || o.product_type === 'igtv';
    let type = 'foto';
    if (o.media_type === 8 || o.carousel_media_count || o.__typename === 'GraphSidecar' || o.edge_sidecar_to_children) type = 'carrusel';
    else if (isReel) type = 'reel';
    else if (o.media_type === 2 || o.is_video) type = 'video';
    const user = o.user || o.owner || {};
    const caption = (o.caption && typeof o.caption === 'object' ? o.caption.text : o.caption) ||
      (o.edge_media_to_caption && o.edge_media_to_caption.edges && o.edge_media_to_caption.edges[0] &&
        o.edge_media_to_caption.edges[0].node.text) || '';
    const imgs = (o.image_versions2 && o.image_versions2.candidates) ||
      (o.carousel_media && o.carousel_media[0] && o.carousel_media[0].image_versions2 &&
        o.carousel_media[0].image_versions2.candidates) || [];
    const vids = o.video_versions || [];
    const pinned = (o.timeline_pinned_user_ids && o.timeline_pinned_user_ids.length > 0) ||
      (o.clips_tab_pinned_user_ids && o.clips_tab_pinned_user_ids.length > 0) || !!o.is_pinned;
    return {
      platform: 'instagram',
      id: String(o.pk || o.id || code).split('_')[0],
      url: 'https://www.instagram.com/' + (isReel ? 'reel' : 'p') + '/' + code + '/',
      author: user.username || null,
      ownerId: user.pk || user.id ? String(user.pk || user.id) : null,
      caption: caption,
      date: toMs(o.taken_at || o.taken_at_timestamp),
      type: type,
      views: firstNum(o.play_count, o.ig_play_count, o.view_count, o.video_view_count, o.video_play_count),
      likes: o.like_and_view_counts_disabled && !o.like_count ? null :
        firstNum(o.like_count, o.edge_liked_by, o.edge_media_preview_like),
      comments: firstNum(o.comment_count, o.edge_media_to_comment, o.edge_media_preview_comment),
      shares: firstNum(o.reshare_count, o.share_count, o.media_repost_count),
      saves: firstNum(o.save_count),
      duration: firstNum(o.video_duration),
      thumb: (imgs[0] && imgs[0].url) || o.display_url || o.thumbnail_src || o.thumbnail_url || null,
      video: (vids[0] && vids[0].url) || o.video_url || null,
      music: (o.clips_metadata && o.clips_metadata.music_info && o.clips_metadata.music_info.music_asset_info &&
        o.clips_metadata.music_info.music_asset_info.title) ||
        (o.clips_metadata && o.clips_metadata.original_sound_info && 'Audio original') || null,
      pinned: pinned,
      followers: firstNum(user.follower_count)
    };
  }

  function igIsProfile(o) {
    return typeof o.username === 'string' &&
      (o.follower_count != null || (o.edge_followed_by && o.edge_followed_by.count != null));
  }

  function igProfile(o) {
    return {
      platform: 'instagram',
      handle: o.username,
      id: o.pk || o.id ? String(o.pk || o.id) : null,
      name: o.full_name || null,
      followers: firstNum(o.follower_count, o.edge_followed_by),
      following: firstNum(o.following_count, o.edge_follow),
      posts: firstNum(o.media_count, o.edge_owner_to_timeline_media),
      avatar: o.profile_pic_url_hd || o.profile_pic_url || null,
      bio: o.biography || null,
      verified: !!o.is_verified
    };
  }

  // ---------- TikTok ----------

  function ttIsItem(o) {
    if (o.aweme_id && isObj(o.statistics)) return true;
    return o.id != null && o.createTime != null && isObj(o.stats) &&
      ('playCount' in o.stats || 'diggCount' in o.stats);
  }

  function ttItem(o) {
    if (o.aweme_id) {
      const st = o.statistics || {};
      const author = (o.author && (o.author.unique_id || o.author.uniqueId)) || null;
      const v = o.video || {};
      const cover = v.cover && v.cover.url_list && v.cover.url_list[0];
      const play = v.play_addr && v.play_addr.url_list && v.play_addr.url_list[0];
      return {
        platform: 'tiktok', id: String(o.aweme_id),
        url: 'https://www.tiktok.com/@' + (author || '_') + '/video/' + o.aweme_id,
        author: author, caption: o.desc || '', date: toMs(o.create_time),
        type: o.image_post_info ? 'carrusel' : 'video',
        views: firstNum(st.play_count), likes: firstNum(st.digg_count), comments: firstNum(st.comment_count),
        shares: firstNum(st.share_count), saves: firstNum(st.collect_count),
        duration: v.duration ? firstNum(v.duration > 1000 ? v.duration / 1000 : v.duration) : null,
        thumb: cover || null, video: play || null,
        music: (o.music && o.music.title) || null, pinned: !!o.is_top,
        followers: o.author ? firstNum(o.author.follower_count) : null
      };
    }
    const st = o.stats || {};
    const st2 = o.statsV2 || {};
    const author = typeof o.author === 'string' ? o.author : (o.author && o.author.uniqueId) || null;
    const v = o.video || {};
    const isPhoto = !!o.imagePost;
    return {
      platform: 'tiktok', id: String(o.id),
      url: 'https://www.tiktok.com/@' + (author || '_') + '/' + (isPhoto ? 'photo' : 'video') + '/' + o.id,
      author: author, caption: o.desc || '', date: toMs(o.createTime),
      type: isPhoto ? 'carrusel' : 'video',
      views: firstNum(st2.playCount, st.playCount), likes: firstNum(st2.diggCount, st.diggCount),
      comments: firstNum(st2.commentCount, st.commentCount), shares: firstNum(st2.shareCount, st.shareCount),
      saves: firstNum(st2.collectCount, st.collectCount),
      duration: firstNum(v.duration),
      thumb: v.cover || v.originCover || v.dynamicCover ||
        (isPhoto && o.imagePost.cover && o.imagePost.cover.imageURL && o.imagePost.cover.imageURL.urlList &&
          o.imagePost.cover.imageURL.urlList[0]) || null,
      video: v.playAddr || v.downloadAddr || null,
      music: (o.music && o.music.title) || null,
      pinned: !!o.isPinnedItem,
      followers: o.authorStats ? firstNum(o.authorStats.followerCount) : null
    };
  }

  function ttIsProfile(o) {
    return isObj(o.user) && typeof o.user.uniqueId === 'string' && isObj(o.stats) && o.stats.followerCount != null;
  }

  function ttProfile(o) {
    return {
      platform: 'tiktok', handle: o.user.uniqueId, name: o.user.nickname || null,
      followers: firstNum(o.stats.followerCount), following: firstNum(o.stats.followingCount),
      posts: firstNum(o.stats.videoCount), likesTotal: firstNum(o.stats.heartCount, o.stats.heart),
      avatar: o.user.avatarLarger || o.user.avatarMedium || null, bio: o.user.signature || null,
      verified: !!o.user.verified
    };
  }

  // ---------- Facebook ----------

  const fbUrlOk = (s) => typeof s === 'string' && /facebook\.com/.test(s) &&
    /(\/posts\/|\/videos\/|\/reel\/|story_fbid|\/permalink|\/photo|\/watch|pfbid)/.test(s);
  const uri = (v) => (isObj(v) ? (v.uri || (v.image && v.image.uri)) : null) || null;
  const fbcdn = (s) => (typeof s === 'string' && /fbcdn|scontent/.test(s) ? s : null);

  const FB_FIELDS = {
    reactions: {
      reaction_count: (v) => parseCount(v), reactors: (v) => parseCount(v),
      i18n_reaction_count: (v) => parseCount(v), unified_reactors: (v) => parseCount(v)
    },
    comments: {
      total_comment_count: (v) => parseCount(v),
      comments: (v) => (isObj(v) ? parseCount(v.total_count) : null),
      comment_count: (v) => parseCount(v), i18n_comment_count: (v) => parseCount(v)
    },
    shares: { share_count: (v) => parseCount(v), i18n_share_count: (v) => parseCount(v) },
    views: {
      play_count: (v) => parseCount(v), video_view_count: (v) => parseCount(v),
      post_view_count: (v) => parseCount(v), i18n_play_count: (v) => parseCount(v)
    },
    date: { creation_time: toMs, publish_time: toMs, created_time: toMs },
    url: {
      permalink_url: (v) => (fbUrlOk(v) ? v : null), url: (v) => (fbUrlOk(v) ? v : null),
      wwwURL: (v) => (fbUrlOk(v) ? v : null), shareable_url: (v) => (fbUrlOk(v) ? v : null),
      canonical_uri_with_fallback: (v) => (fbUrlOk(v) ? v : null)
    },
    caption: { message: (v) => (isObj(v) && typeof v.text === 'string' ? v.text : null) },
    title: {
      savable_title: (v) => (isObj(v) && typeof v.text === 'string' ? v.text : null),
      title: (v) => (isObj(v) && typeof v.text === 'string' ? v.text : null)
    },
    author: {
      actors: (v) => (Array.isArray(v) && v[0] && v[0].name) || null,
      owning_profile: (v) => (isObj(v) && v.name) || null,
      owner: (v) => (isObj(v) && v.name) || null
    },
    thumb: {
      preferred_thumbnail: (v) => uri(v), thumbnailImage: (v) => uri(v),
      first_frame_thumbnail: (v) => fbcdn(v), photo_image: (v) => uri(v),
      large_share_image: (v) => uri(v), image: (v) => fbcdn(uri(v))
    },
    video: {
      browser_native_hd_url: (v) => v || null, browser_native_sd_url: (v) => v || null,
      playable_url_quality_hd: (v) => v || null, playable_url: (v) => v || null
    },
    duration: {
      length_in_second: (v) => parseCount(v),
      playable_duration_in_ms: (v) => (v ? Math.round(v / 1000) : null),
      playable_duration: (v) => parseCount(v)
    },
    videoId: { __typename: (v, node) => (v === 'Video' && node.id ? String(node.id) : null) }
  };

  function fbIsStory(o) {
    return o.__typename === 'Story' && (o.post_id || o.id) &&
      ('comet_sections' in o || 'feedback' in o || 'attachments' in o);
  }

  function fbIsVideo(o) {
    return o.__typename === 'Video' && o.id &&
      (o.play_count != null || o.video_view_count != null || o.post_view_count != null);
  }

  function fbBuild(o, f, kind) {
    const isVideo = kind === 'video' || !!f.videoId || !!f.video;
    const url = f.url || (kind === 'video' ? 'https://www.facebook.com/reel/' + o.id : null) ||
      (o.post_id ? 'https://www.facebook.com/' + o.post_id : null);
    let type = 'texto';
    if (isVideo) type = url && /\/reel\//.test(url) ? 'reel' : 'video';
    else if (f.thumb) type = 'foto';
    return {
      platform: 'facebook',
      id: String(kind === 'video' ? o.id : (o.post_id || o.id)),
      url: url, author: f.author || null, caption: f.caption || f.title || '', date: f.date || null, type: type,
      views: f.views != null ? f.views : null, likes: f.reactions != null ? f.reactions : null,
      comments: f.comments != null ? f.comments : null, shares: f.shares != null ? f.shares : null,
      saves: null, duration: f.duration || null, thumb: f.thumb || null, video: f.video || null,
      music: null, pinned: false, followers: null, videoId: f.videoId || (kind === 'video' ? String(o.id) : null)
    };
  }


  // ---------- YouTube ----------

  // "hace 3 semanas", "2 days ago", "Transmitido hace 5 horas" → fecha aproximada (ms).
  const REL_UNITS = [
    [/seg|sec/, 1e3], [/min/, 6e4], [/hora|hour/, 36e5], [/d[ií]a|day/, 864e5],
    [/semana|week/, 6048e5], [/mes|month/, 2592e6], [/a[ñn]o|year/, 31536e6]
  ];
  function relDate(text, now) {
    if (!text) return null;
    const m = String(text).toLowerCase().match(/(\d+)\s*([a-záéíóúñ]+)/);
    if (!m) return null;
    for (const [re, ms] of REL_UNITS) if (re.test(m[2])) return (now || Date.now()) - Number(m[1]) * ms;
    return null;
  }

  // "249 k", "1,2 M de vistas", "45 mil vistas", "1.2M views" → número
  function ytCount(text) {
    if (!text) return null;
    const t = String(text).toLowerCase()
      .replace(/(visualizaciones|reproducciones|vistas|views|view|suscriptores|subscribers|videos|vídeos|de|of)/g, ' ')
      .replace(/\s+/g, ' ').trim();
    return parseCount(t);
  }

  function hms(text) {
    if (!text || !/^\d+(:\d+){1,2}$/.test(String(text).trim())) return null;
    return String(text).trim().split(':').reduce((acc, n) => acc * 60 + Number(n), 0);
  }

  function ytBest(sources) {
    if (!Array.isArray(sources) || !sources.length) return null;
    return sources.slice().sort((a, b) => (b.width || 0) - (a.width || 0))[0].url || null;
  }

  function ytIsLockup(o) {
    return isObj(o.lockupViewModel) && o.lockupViewModel.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO';
  }

  function ytLockup(o) {
    const l = o.lockupViewModel;
    const meta = (l.metadata && l.metadata.lockupMetadataViewModel) || {};
    const rows = (meta.metadata && meta.metadata.contentMetadataViewModel && meta.metadata.contentMetadataViewModel.metadataRows) || [];
    let views = null, date = null, author = null, live = false;
    rows.forEach((row) => (row.metadataParts || []).forEach((part) => {
      const txt = (part.text && part.text.content) || '';
      const label = (part.accessibilityLabel || txt).toLowerCase();
      if (/vista|view|visualiz|reproduc|watching|mirando/.test(label)) {
        views = ytCount(txt) != null ? ytCount(txt) : ytCount(label);
        if (/watching|mirando|espectador/.test(label)) live = true;
      } else if (/hace|ago|transmit|streamed|estrenado|premiered/.test(label)) {
        date = relDate(part.accessibilityLabel || txt);
      } else if (!author && txt && !/\d/.test(txt)) {
        author = txt.replace(/^@/, '');
      }
    }));
    const img = l.contentImage && l.contentImage.thumbnailViewModel;
    let duration = null;
    ((img && img.overlays) || []).forEach((ov) => {
      const badges = (ov.thumbnailBottomOverlayViewModel && ov.thumbnailBottomOverlayViewModel.badges) || [];
      badges.forEach((b) => {
        const t = b.thumbnailBadgeViewModel && b.thumbnailBadgeViewModel.text;
        if (hms(t) != null) duration = hms(t);
        else if (t && /vivo|live/i.test(t)) live = true;
      });
    });
    return {
      platform: 'youtube', id: String(l.contentId), url: 'https://www.youtube.com/watch?v=' + l.contentId,
      author: author, caption: (meta.title && meta.title.content) || '', date: date, approxDate: date != null,
      type: live ? 'vivo' : 'video', views: views, likes: null, comments: null, shares: null, saves: null,
      duration: duration, thumb: ytBest(img && img.image && img.image.sources), video: null,
      music: null, pinned: false, followers: null
    };
  }

  function ytIsShort(o) {
    return isObj(o.shortsLockupViewModel);
  }

  function ytShort(o) {
    const s = o.shortsLockupViewModel;
    const ep = s.onTap && s.onTap.innertubeCommand && s.onTap.innertubeCommand.reelWatchEndpoint;
    const id = (ep && ep.videoId) || String(s.entityId || '').replace(/^shorts-shelf-item-/, '');
    const om = s.overlayMetadata || {};
    const tv = s.thumbnailViewModel && s.thumbnailViewModel.thumbnailViewModel;
    return {
      platform: 'youtube', id: id, url: 'https://www.youtube.com/shorts/' + id, author: null,
      caption: (om.primaryText && om.primaryText.content) || '', date: null, type: 'short',
      views: ytCount(om.secondaryText && om.secondaryText.content), likes: null, comments: null, shares: null,
      saves: null, duration: null, thumb: ytBest(tv && tv.image && tv.image.sources), video: null,
      music: null, pinned: false, followers: null
    };
  }

  function ytIsVideoRenderer(o) {
    return isObj(o.videoRenderer) && o.videoRenderer.videoId;
  }

  function ytVideoRenderer(o) {
    const v = o.videoRenderer;
    const txt = (x) => (x ? x.simpleText || (x.runs || []).map((r) => r.text).join('') : '');
    const owner = v.ownerText || v.longBylineText;
    return {
      platform: 'youtube', id: v.videoId, url: 'https://www.youtube.com/watch?v=' + v.videoId,
      author: txt(owner) || null, caption: txt(v.title), date: relDate(txt(v.publishedTimeText)),
      approxDate: true, type: 'video', views: ytCount(txt(v.viewCountText)), likes: null, comments: null,
      shares: null, saves: null, duration: hms(txt(v.lengthText)),
      thumb: ytBest(v.thumbnail && v.thumbnail.thumbnails), video: null, music: null, pinned: false, followers: null
    };
  }

  // Respuesta de /youtubei/v1/player: datos exactos de un video (likes, fecha, vistas).
  function ytIsPlayer(o) {
    return isObj(o.videoDetails) && o.videoDetails.videoId && isObj(o.microformat) &&
      isObj(o.microformat.playerMicroformatRenderer);
  }

  function ytPlayer(o) {
    const vd = o.videoDetails, mf = o.microformat.playerMicroformatRenderer;
    const iso = mf.publishDate || mf.uploadDate || null;
    const handle = (String(mf.ownerProfileUrl || '').match(/@([^/?#]+)/) || [])[1];
    const desc = (mf.description && mf.description.simpleText) || vd.shortDescription || '';
    const title = vd.title || (mf.title && mf.title.simpleText) || '';
    return {
      platform: 'youtube', id: vd.videoId, url: 'https://www.youtube.com/watch?v=' + vd.videoId,
      author: handle ? decodeURIComponent(handle) : (mf.ownerChannelName || vd.author || null),
      caption: title + (desc ? '\n\n' + desc : ''), date: iso ? Date.parse(iso) : null, approxDate: false,
      type: vd.isLiveContent && mf.liveBroadcastDetails && mf.liveBroadcastDetails.isLiveNow ? 'vivo' : 'video',
      views: parseCount(mf.viewCount != null ? mf.viewCount : vd.viewCount), likes: parseCount(mf.likeCount),
      comments: null, shares: null, saves: null, duration: parseCount(mf.lengthSeconds || vd.lengthSeconds),
      thumb: ytBest(vd.thumbnail && vd.thumbnail.thumbnails), video: null, music: null, pinned: false,
      followers: null, exact: true
    };
  }

  function ytIsHeader(o) {
    return isObj(o.pageHeaderViewModel) && o.pageHeaderViewModel.metadata;
  }

  function ytHeader(o) {
    const h = o.pageHeaderViewModel;
    const rows = (h.metadata.contentMetadataViewModel && h.metadata.contentMetadataViewModel.metadataRows) || [];
    let handle = null, subs = null, videos = null;
    rows.forEach((row) => (row.metadataParts || []).forEach((part) => {
      const t = (part.text && part.text.content) || '';
      if (t[0] === '@') handle = t.slice(1);
      else if (/suscript|subscriber/i.test(t)) subs = ytCount(t);
      else if (/video/i.test(t)) videos = ytCount(t);
    }));
    const title = h.title && h.title.dynamicTextViewModel && h.title.dynamicTextViewModel.text;
    const av = h.image && h.image.decoratedAvatarViewModel && h.image.decoratedAvatarViewModel.avatar &&
      h.image.decoratedAvatarViewModel.avatar.avatarViewModel;
    return {
      platform: 'youtube', handle: handle, name: (title && title.content) || null, followers: subs, posts: videos,
      avatar: ytBest(av && av.image && av.image.sources), verified: false
    };
  }

  // ---------- Store ----------

  const NUM_FIELDS = ['views', 'likes', 'comments', 'shares', 'saves', 'duration', 'followers'];

  function Store() {
    this.items = new Map();
    this.profiles = new Map();
    this.fbVideoToKey = new Map();
    this.version = 0;
  }

  Store.prototype.add = function (it) {
    if (!it || !it.id) return;
    if (it.platform === 'facebook' && it.videoId && !it.url) return;
    const key = it.platform + ':' + it.id;
    const prev = this.items.get(key);
    it.key = key;
    if (!prev) {
      it.hashtags = hashtagsOf(it.caption);
      it.firstSeen = Date.now();
      this.items.set(key, it);
    } else {
      for (const k of NUM_FIELDS) {
        // Un dato exacto (ej. API de YouTube) reemplaza al redondeado ("1,2 M").
        if (it[k] != null && (prev[k] == null || it[k] > prev[k] || it.exact)) prev[k] = it[k];
      }
      for (const k of ['url', 'author', 'date', 'music']) if (prev[k] == null && it[k] != null) prev[k] = it[k];
      if (it.date && it.approxDate === false && prev.approxDate) { prev.date = it.date; prev.approxDate = false; }
      if (it.exact) prev.exact = true;
      for (const k of ['thumb', 'video']) if (it[k]) prev[k] = it[k]; // las URLs firmadas vencen: usar la más nueva
      if (it.caption && (!prev.caption || (it.exact && it.caption.length > prev.caption.length))) {
        prev.caption = it.caption; prev.hashtags = hashtagsOf(it.caption);
      }
      if (prev.type === 'texto' || (prev.type === 'foto' && it.type !== 'texto')) prev.type = it.type;
      prev.pinned = prev.pinned || it.pinned;
    }
    this.version++;
  };

  Store.prototype.addProfile = function (p) {
    if (!p || !p.handle) return;
    const key = p.platform + ':' + p.handle.toLowerCase();
    const prev = this.profiles.get(key) || {};
    for (const k in p) if (p[k] != null) prev[k] = p[k];
    this.profiles.set(key, prev);
    this.version++;
  };

  Store.prototype.profileOf = function (platform, handle) {
    if (!handle) return null;
    return this.profiles.get(platform + ':' + String(handle).toLowerCase()) || null;
  };

  Store.prototype.list = function () { return Array.from(this.items.values()); };

  Store.prototype.clear = function () {
    this.items.clear(); this.profiles.clear(); this.fbVideoToKey.clear(); this.version++;
  };

  // ---------- ingesta ----------

  function ingestJSON(obj, store, platform) {
    const before = store.items.size;
    walk(obj, function (o) {
      try {
        if (platform === 'instagram' || !platform) {
          if (igIsMedia(o)) store.add(igMedia(o));
          else if (igIsProfile(o)) store.addProfile(igProfile(o));
        }
        if (platform === 'tiktok' || !platform) {
          if (ttIsItem(o)) store.add(ttItem(o));
          else if (ttIsProfile(o)) store.addProfile(ttProfile(o));
        }
        if (platform === 'youtube' || !platform) {
          if (ytIsPlayer(o)) store.add(ytPlayer(o));
          else if (ytIsLockup(o)) store.add(ytLockup(o));
          else if (ytIsShort(o)) store.add(ytShort(o));
          else if (ytIsVideoRenderer(o)) store.add(ytVideoRenderer(o));
          else if (ytIsHeader(o)) store.addProfile(ytHeader(o));
        }
        if (platform === 'facebook' || !platform) {
          if (fbIsStory(o)) {
            const f = scanFields(o, FB_FIELDS, 6000);
            const it = fbBuild(o, f, 'story');
            store.add(it);
            if (it.videoId) store.fbVideoToKey.set(it.videoId, it.key);
          } else if (fbIsVideo(o)) {
            const f = scanFields(o, FB_FIELDS, 1500);
            const it = fbBuild(o, f, 'video');
            const storyKey = store.fbVideoToKey.get(String(o.id));
            if (storyKey) {
              const st = store.items.get(storyKey);
              for (const k of ['views', 'duration']) if (it[k] != null && (st[k] == null || it[k] > st[k])) st[k] = it[k];
              if (!st.video && it.video) st.video = it.video;
              if (!st.thumb && it.thumb) st.thumb = it.thumb;
              store.version++;
            } else {
              store.add(it);
            }
          }
        }
      } catch (e) { /* un nodo raro no debe frenar el resto */ }
    });
    return store.items.size - before;
  }

  // Acepta texto crudo: JSON normal, "for (;;);" de Facebook, o varios JSON por línea.
  function ingestText(text, store, platform) {
    if (!text || typeof text !== 'string') return 0;
    let t = text.trim();
    if (t.startsWith('for (;;);')) t = t.slice(9);
    if (t[0] !== '{' && t[0] !== '[') return 0;
    try {
      return ingestJSON(JSON.parse(t), store, platform);
    } catch (e) {
      let added = 0;
      for (const line of t.split(/\r?\n/)) {
        const l = line.trim();
        if (!l || (l[0] !== '{' && l[0] !== '[')) continue;
        try { added += ingestJSON(JSON.parse(l), store, platform); } catch (e2) { /* línea incompleta */ }
      }
      return added;
    }
  }

  function platformOf(host) {
    host = host || '';
    if (/instagram\.com$/.test(host)) return 'instagram';
    if (/tiktok\.com$/.test(host)) return 'tiktok';
    if (/facebook\.com$/.test(host)) return 'facebook';
    if (/youtube\.com$/.test(host)) return 'youtube';
    return null;
  }

  // Usuario dueño del perfil según la URL (para filtrar el ruido del feed).
  function profileFromUrl(platform, pathname) {
    const p = (pathname || '').split('/').filter(Boolean);
    if (platform === 'tiktok') {
      const at = p.find(s => s[0] === '@');
      return at ? decodeURIComponent(at.slice(1)) : null;
    }
    if (platform === 'youtube') {
      if (p[0] && p[0][0] === '@') return decodeURIComponent(p[0].slice(1));
      if (p[0] === 'c' || p[0] === 'user') return p[1] ? decodeURIComponent(p[1]) : null;
      return null;
    }
    if (platform === 'facebook') {
      const fbReserved = ['watch', 'reel', 'reels', 'groups', 'events', 'marketplace', 'gaming', 'profile.php', 'pages',
        'search', 'stories', 'photo', 'photo.php', 'story.php', 'permalink.php', 'login', 'friends', 'messages', 'notifications', 'share'];
      return p[0] && fbReserved.indexOf(p[0].toLowerCase()) === -1 ? decodeURIComponent(p[0]) : null;
    }
    if (platform === 'instagram') {
      const reserved = ['explore', 'reels', 'reel', 'p', 'stories', 'direct', 'accounts', 'tv', 'about', 'legal', 'web'];
      if (p[1] === 'saved' || p[1] === 'tagged') return null; // guardados y etiquetados son de otras cuentas
      return p[0] && reserved.indexOf(p[0]) === -1 ? decodeURIComponent(p[0]) : null;
    }
    return null;
  }

  const api = {
    parseCount, toMs, relDate, ytCount, hashtagsOf, walk, scanFields, Store, ingestJSON, ingestText, platformOf, profileFromUrl,
    _ig: { igIsMedia, igMedia, igIsProfile }, _tt: { ttIsItem, ttItem, ttIsProfile }, _fb: { fbIsStory, fbIsVideo }, _yt: { ytIsLockup, ytLockup, ytIsShort, ytShort, ytHeader, ytIsPlayer, ytPlayer }
  };
  root.TFExtract = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
