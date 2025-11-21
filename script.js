/* script.js — Final implementation
   - Connects to Supabase REST (public reads) using env config in #env-config
   - Uses Cloudinary public_id / secure_url to render images
   - Implements floating nav, masonry gallery with tag-filter popup,
     lightbox, memories roll-film with auto-scroll + center highlight,
     event countdown, messages, motto pointer glow, plugin iframe mount
   - No demo fallback — expects Supabase & Cloudinary config available
   - Robust error handling and accessibility considerations
*/

/* global fetch, requestAnimationFrame, cancelAnimationFrame */
(function () {
  'use strict';

  //////////////////////
  // Configuration & Globals
  //////////////////////

  // DEBUG toggle
  const DEBUG = false;
  const log = (...args) => { if (DEBUG) console.log(...args); };

  // Helpers to query DOM
  const $ = (sel, root = document) => (root || document).querySelector(sel);
  const $$ = (sel, root = document) => Array.from((root || document).querySelectorAll(sel));

  // Read env-config block
  function readConfig() {
    try {
      const el = document.getElementById('env-config');
      if (el && el.textContent.trim()) {
        return JSON.parse(el.textContent);
      }
    } catch (e) {
      console.warn('Failed parse env-config', e);
    }
    return window.__CONFIG__ || {};
  }

  const CONFIG = readConfig();
  const SUPABASE_URL = (CONFIG.SUPABASE_URL || '').replace(/\/$/, '');
  const SUPABASE_ANON = CONFIG.SUPABASE_ANON_KEY || '';
  const CLOUD_NAME = CONFIG.CLOUDINARY_CLOUD_NAME || '';
  const CLOUD_PRESET = CONFIG.CLOUDINARY_UPLOAD_PRESET || '';

  // Validate config early
  function assertConfig() {
    const msgs = [];
    if (!SUPABASE_URL) msgs.push('SUPABASE_URL kosong — isi env di Netlify atau env-config.');
    if (!SUPABASE_ANON) msgs.push('SUPABASE_ANON_KEY kosong — isi env di Netlify atau env-config.');
    if (!CLOUD_NAME) msgs.push('CLOUDINARY_CLOUD_NAME kosong — isi env di Netlify atau env-config.');
    if (!CLOUD_PRESET) msgs.push('CLOUDINARY_UPLOAD_PRESET kosong — isi env di Netlify atau env-config (unsigned preset).');
    if (msgs.length) {
      console.error('CONFIG ERROR:', msgs.join(' | '));
      showGlobalNotice('Konfigurasi belum lengkap. Silakan isi environment variables di Netlify: SUPABASE_URL, SUPABASE_ANON_KEY, CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET.');
    }
    return msgs.length === 0;
  }

  function showGlobalNotice(msg) {
    // insert a visible banner at top if possible
    try {
      const existing = document.getElementById('global-notice');
      if (existing) { existing.textContent = msg; return; }
      const b = document.createElement('div');
      b.id = 'global-notice';
      b.style.position = 'fixed';
      b.style.left = '8px';
      b.style.right = '8px';
      b.style.top = '8px';
      b.style.zIndex = 99999;
      b.style.padding = '10px 14px';
      b.style.background = 'linear-gradient(90deg, rgba(255,170,170,0.12), rgba(255,230,200,0.06))';
      b.style.border = '1px solid rgba(255,255,255,0.06)';
      b.style.color = '#fff';
      b.style.borderRadius = '10px';
      b.style.fontWeight = '600';
      b.style.backdropFilter = 'blur(6px)';
      b.textContent = msg;
      document.body.appendChild(b);
      setTimeout(() => { if (b && b.parentNode) b.parentNode.removeChild(b); }, 12000);
    } catch (e) {
      console.warn('Could not show global notice', e);
    }
  }

  // Safe JSON parse
  function safeJSONParse(s, fallback = []) {
    try { return JSON.parse(s); } catch (e) { return fallback; }
  }

  // Cloudinary URL builder
  function cloudinaryURLPublic(public_id_or_url, opts = {}) {
    if (!public_id_or_url) return '';
    if (/^https?:\/\//.test(public_id_or_url)) return public_id_or_url;
    const cloud = CLOUD_NAME || '{CLOUD_NAME}';
    // default transforms
    const parts = [];
    const w = opts.w || 'auto';
    const h = opts.h ? `,h_${opts.h}` : '';
    const crop = opts.crop ? `,c_${opts.crop}` : '';
    const dpr = opts.dpr === 'auto' ? ',dpr_auto' : '';
    parts.push(`w_${w}${h}${crop}${dpr}`);
    parts.push('f_auto');
    parts.push('q_auto');
    const trans = parts.join(',');
    const pub = public_id_or_url.replace(/^\/+/, '');
    return `https://res.cloudinary.com/${cloud}/image/upload/${trans}/${pub}`;
  }

  // Supabase REST small wrapper (GET)
  async function supabaseGet(table, params = {}) {
    if (!SUPABASE_URL || !SUPABASE_ANON) {
      console.warn('supabaseGet aborted — missing config');
      return null;
    }
    try {
      const headers = {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`
      };
      let url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
      // params: filter, order, limit, offset
      if (params.filter) url += `&${params.filter}`;
      if (params.order) url += `&order=${encodeURIComponent(params.order)}`;
      if (params.limit) url += `&limit=${params.limit}`;
      if (params.offset) url += `&offset=${params.offset}`;
      // Request
      const r = await fetch(url, { headers });
      if (!r.ok) throw new Error(`Supabase request ${table} failed ${r.status}`);
      const json = await r.json();
      return json;
    } catch (err) {
      console.error('supabaseGet error', err);
      return null;
    }
  }

  // Utility: format date
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // clamp
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // Respect reduced motion
  const PREFERS_REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  //////////////////////
  // LIGHTBOX declaration (must be available early)
  //////////////////////
  let LIGHTBOX = {
    container: null,
    inner: null,
    img: null,
    meta: null,
    prevBtn: null,
    nextBtn: null,
    closeBtn: null,
    images: [],
    metaList: [],
    index: 0,
    open: false
  };

  //////////////////////
  // STATE objects
  //////////////////////
  const STATE = {
    profiles: [],
    photos: [], // all photos from Supabase
    photosById: new Map(),
    memories: [],
    events: [],
    messages: [],
    tags: new Set(),
    galleryFiltered: [],
    galleryPage: 1,
    galleryPerPage: 12,
    galleryTotalPages: 1,
    galleryObserver: null,
    memoriesObserver: null,
    autoScroll: false,
    autoScrollRAF: null,
    plugin: { enabled: false, url: '' }
  };

  //////////////////////
  // BOOTSTRAP
  //////////////////////
  async function initSite() {
    // feather icons (will replace icons in DOM)
    try { if (window.feather) window.feather.replace(); } catch (e) {}

    // Setup handlers that don't rely on data
    initHeaderFloating();
    initFloatingNavClicks();
    initFooterYear();
    initMottoPointer();
    initLightboxHandlers();
    initGalleryUIControls();
    initPluginSlotUI();
    // Validate config
    const ok = assertConfig();
    if (!ok) {
      // stop further tries to fetch; still allow UI to load but empty
      return;
    }

    // fetch all data needed in parallel
    const [siteConfig, profiles, photos, memories, events, messages] = await Promise.all([
      supabaseGet('site_config'),
      supabaseGet('profiles'),
      supabaseGet('photos'),
      supabaseGet('memories'),
      supabaseGet('events'),
      supabaseGet('messages')
    ]);

    // If any required dataset is null -> log & show notice
    if (!siteConfig || !profiles || !photos || !memories) {
      console.error('One or more required datasets returned null from Supabase. Ensure Supabase tables exist and anon key has read access.');
      showGlobalNotice('Data belum tersedia di Supabase — cek tabel & anon key.');
      // continue rendering what we can (we don't crash)
    }

    // Normalize & render
    STATE.siteConfig = normalizeSiteConfig(siteConfig || []);
    STATE.profiles = normalizeProfiles(profiles || []);
    STATE.photos = normalizePhotos(photos || []);
    STATE.memories = normalizeMemories(memories || []);
    STATE.events = normalizeEvents(events || []);
    STATE.messages = normalizeMessages(messages || []);

    // Build tag set
    STATE.tags = new Set();
    STATE.photos.forEach(p => (p.tags || []).forEach(t => STATE.tags.add(String(t).trim()).valueOf()));
    // render all sections
    renderSiteConfig(STATE.siteConfig);
    renderProfiles(STATE.profiles);
    renderGalleryInitial();
    renderMessages(STATE.messages);
    renderEventNearest(STATE.events);
    renderMemories(STATE.memories);

    // apply feather icons again after dynamic DOM
    try { if (window.feather) window.feather.replace(); } catch (e) {}

    // ensure handlers for new DOM wired
    attachGalleryLazyLoader();
    attachMemoriesObservers();
  }

  // DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSite);
  } else {
    initSite();
  }

  //////////////////////
  // Normalizers
  //////////////////////
  function normalizeSiteConfig(rows) {
    // site_config may be rows of {key, value} or single row
    if (!rows) return {};
    if (Array.isArray(rows)) {
      const obj = {};
      rows.forEach(r => {
        if (r.key) obj[r.key] = r.value;
      });
      return obj;
    }
    return rows;
  }

  function normalizeProfiles(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.map(r => ({
      id: r.id || (r.user_id || Math.random().toString(36).slice(2,8)),
      name: r.name || r.title || '',
      role: r.role || r.position || '',
      jumlah_siswa: r.jumlah_siswa || r.count || null,
      social: r.social ? (typeof r.social === 'string' ? safeJSONParse(r.social, {}) : r.social) : {},
      raw: r
    }));
  }

  function normalizePhotos(rows) {
    if (!Array.isArray(rows)) return [];
    const arr = rows.map(r => {
      const tags = r.tags ? (Array.isArray(r.tags) ? r.tags : safeJSONParse(r.tags, [])) : [];
      const public_id = r.public_id || r.public_id_cloudinary || (r.public_id_str || '');
      const secure_url = r.secure_url || r.url || '';
      const obj = {
        id: r.id || Math.random().toString(36).slice(2,8),
        caption: r.caption || r.title || r.alt_text || '',
        public_id,
        secure_url,
        tags,
        date_taken: r.date_taken || r.created_at || null,
        memory_id: r.memory_id || null,
        raw: r
      };
      return obj;
    });
    // index by id for quick lookup
    STATE.photosById = new Map(arr.map(i => [String(i.id), i]));
    return arr;
  }

  function normalizeMemories(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.map(r => {
      // photos may be stored as array of objects or array of public_ids or JSON string
      let photos = [];
      if (Array.isArray(r.photos)) photos = r.photos;
      else if (typeof r.photos === 'string') photos = safeJSONParse(r.photos, []);
      // unify to array of {public_id, secure_url}
      const normalizedPhotos = photos.map(p => {
        if (typeof p === 'string') return { public_id: p, secure_url: p };
        return { public_id: p.public_id || p.public_id_cloudinary || '', secure_url: p.secure_url || p.url || '' };
      });
      return {
        id: r.id || Math.random().toString(36).slice(2,8),
        title: r.title || '',
        date: r.date || r.date_taken || r.created_at || null,
        description: r.description || r.excerpt || '',
        thumbnail_public_id: r.thumbnail_public_id || (normalizedPhotos[0] ? (normalizedPhotos[0].public_id || normalizedPhotos[0].secure_url) : ''),
        photos: normalizedPhotos,
        raw: r
      };
    });
  }

  function normalizeEvents(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.map(r => ({
      id: r.id,
      title: r.title,
      start_datetime: r.start_datetime || r.start || r.date || null,
      description: r.description || r.desc || '',
      cover_public_id: r.cover_public_id || r.cover || '',
      raw: r
    }));
  }

  function normalizeMessages(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.map(r => ({
      id: r.id,
      title: r.title || r.headline || '',
      author_name: r.author_name || r.author || '',
      content: r.content || r.body || '',
      raw: r
    }));
  }

  //////////////////////
  // RENDER: Site config, profiles
  //////////////////////
  function renderSiteConfig(cfg = {}) {
    const title = cfg.site_title || cfg.title || document.title;
    const titleEl = $('#site-title');
    if (titleEl && title) titleEl.textContent = title;
    const mottoText = cfg.motto_text || cfg.motto || '';
    const motto = $('#motto-text');
    if (motto && mottoText) motto.textContent = mottoText;
    const heroImg = $('#hero-img');
    if (heroImg && (cfg.hero_public_id || cfg.hero_url)) {
      const url = cfg.hero_url || cloudinaryURLPublic(cfg.hero_public_id, { w: 1600, h: 900, crop: 'fill', dpr: 'auto' });
      heroImg.src = url;
    }
    // footer
    const f = $('#footer-text');
    if (f) {
      const ft = cfg.footer_text || `© {{year}} ${title}`;
      f.innerHTML = ft.replace('{{year}}', new Date().getFullYear());
    }
  }

  function renderProfiles(list = []) {
    const container = $('#profil-grid');
    if (!container) return;
    container.innerHTML = '';
    // we must show Ketua, Wakil, Wali, Jumlah, Asal — but data may vary
    // if list contains specific roles, map accordingly. Otherwise, render whatever exists.
    if (list.length === 0) {
      // empty placeholders
      const names = ['Ketua', 'Wakil Ketua', 'Jumlah Siswa', 'Wali Kelas', 'Asal Sekolah'];
      names.forEach((n,i) => {
        const card = buildProfileCard({ id: `p-${i}`, name: n, role: n, jumlah_siswa: ''});
        container.appendChild(card);
      });
      return;
    }
    // if roles present, keep grid order: Ketua, Wakil, Wali, Jumlah, Asal
    const orderKeys = ['ketua', 'wakil', 'wali', 'jumlah', 'asal'];
    const byRole = {};
    list.forEach(p => {
      const r = String(p.role || '').toLowerCase();
      byRole[r] = p;
    });
    // attempt to pick items by role names, else fallback to list
    if (byRole.ketua || byRole.wakil || byRole.wali) {
      const wanted = [
        byRole.ketua || list[0],
        byRole.wakil || list[1] || list[0],
        byRole.wali || list[2] || list[0],
        // jumlah siswa & asal may be stored in site_config, but try to create placeholder
        { id: 'p-jumlah', name: `Jumlah Siswa: ${list[0]?.jumlah_siswa || ''}`, role: 'Jumlah Siswa' },
        { id: 'p-asal', name: `Asal Sekolah`, role: 'Asal Sekolah' }
      ];
      wanted.forEach(p => container.appendChild(buildProfileCard(p)));
    } else {
      // generic mapping
      list.slice(0,5).forEach(p => container.appendChild(buildProfileCard(p)));
    }
  }

  function buildProfileCard(p) {
    const article = document.createElement('article');
    article.className = 'profil-card';
    article.setAttribute('data-person', (p.role || p.name || '').toLowerCase().replace(/\s+/g, '-'));
    article.setAttribute('data-id', p.id || '');
    const body = document.createElement('div');
    body.className = 'pc-body';
    const name = document.createElement('div'); name.className = 'pc-name'; name.textContent = p.name || p.role || '—';
    const role = document.createElement('div'); role.className = 'pc-role'; role.textContent = p.role || '';
    const meta = document.createElement('div'); meta.className = 'pc-meta';
    if (p.jumlah_siswa != null) meta.textContent = `Jumlah siswa: ${p.jumlah_siswa}`;
    else if (p.jumlah_siswa === undefined && p.role && p.role.toLowerCase().includes('jumlah')) meta.textContent = p.name || '';
    else meta.textContent = p.school || p.asal_sekolah || '';
    body.appendChild(name); body.appendChild(role); body.appendChild(meta);

    // socials (editable in admin). Render icons if exists
    const socials = document.createElement('div'); socials.className = 'pc-socials';
    const s = p.social || {};
    ['instagram','facebook','twitter','youtube','link'].forEach(key => {
      if (s && s[key]) {
        const a = document.createElement('a'); a.className = 'pc-social'; a.href = s[key]; a.target = '_blank'; a.rel = 'noopener';
        a.setAttribute('aria-label', `${p.name || ''} ${key}`);
        a.innerHTML = `<i data-feather="${key==='link'?'link':key}"></i>`;
        socials.appendChild(a);
      }
    });
    if (socials.children.length) body.appendChild(socials);
    article.appendChild(body);
    return article;
  }

  //////////////////////
  // GALLERY (masonry, pagination, tag filter popup)
  //////////////////////

  function initGalleryUIControls() {
    // Search
    const search = $('#gallery-search');
    if (search) {
      search.addEventListener('input', () => {
        STATE.galleryPage = 1;
        applyGalleryFilterAndRender();
      });
    }
    // perpage
    const perpage = $('#gallery-perpage');
    if (perpage) {
      perpage.addEventListener('change', () => {
        STATE.galleryPerPage = parseInt(perpage.value, 10) || 12;
        STATE.galleryPage = 1;
        applyGalleryFilterAndRender();
      });
    }
    // prev/next
    $('#gallery-prev')?.addEventListener('click', () => {
      if (STATE.galleryPage > 1) {
        STATE.galleryPage--;
        renderGalleryPage();
        scrollTo('#gallery');
      }
    });
    $('#gallery-next')?.addEventListener('click', () => {
      if (STATE.galleryPage < STATE.galleryTotalPages) {
        STATE.galleryPage++;
        renderGalleryPage();
        scrollTo('#gallery');
      }
    });

    // Tag filter button (create)
    createTagFilterButton();
  }

  function createTagFilterButton() {
    // insert a button near controls
    try {
      const controls = document.querySelector('.gallery-controls');
      if (!controls) return;
      let btn = document.getElementById('gallery-filter-btn');
      if (!btn) {
        btn = document.createElement('button');
        btn.id = 'gallery-filter-btn';
        btn.className = 'btn';
        btn.type = 'button';
        btn.textContent = 'Filter Tag';
        btn.style.marginLeft = '8px';
        controls.appendChild(btn);
        btn.addEventListener('click', openTagFilterPopup);
      }
    } catch (e) {
      console.warn('createTagFilterButton failed', e);
    }
  }

  function openTagFilterPopup() {
    // build popup overlay with checklist of STATE.tags
    const existing = document.getElementById('tag-filter-popup');
    if (existing) { existing.remove(); return; }

    const popup = document.createElement('div');
    popup.id = 'tag-filter-popup';
    popup.style.position = 'fixed';
    popup.style.zIndex = 20000;
    popup.style.left = '50%';
    popup.style.top = '50%';
    popup.style.transform = 'translate(-50%,-50%)';
    popup.style.background = 'rgba(6,8,12,0.9)';
    popup.style.border = '1px solid rgba(255,255,255,0.06)';
    popup.style.backdropFilter = 'blur(8px)';
    popup.style.padding = '18px';
    popup.style.borderRadius = '12px';
    popup.style.maxWidth = '420px';
    popup.style.width = '92%';
    popup.style.color = '#fff';
    popup.addEventListener('click', (e) => e.stopPropagation());

    const title = document.createElement('div');
    title.style.fontWeight = '700';
    title.style.marginBottom = '8px';
    title.textContent = 'Filter menurut tag';
    popup.appendChild(title);

    const tagList = document.createElement('div');
    tagList.style.display = 'grid';
    tagList.style.gridTemplateColumns = 'repeat(2,1fr)';
    tagList.style.gap = '8px';
    tagList.style.maxHeight = '250px';
    tagList.style.overflow = 'auto';
    // sort tags alphabetically
    const tagsArr = Array.from(STATE.tags).map(t => String(t).trim()).filter(Boolean).sort((a,b) => a.localeCompare(b));
    // build checkboxes
    tagsArr.forEach(t => {
      const id = `tagchk-${t.replace(/\s+/g,'_')}`;
      const wrap = document.createElement('label');
      wrap.style.display = 'flex';
      wrap.style.alignItems = 'center';
      wrap.style.gap = '8px';
      wrap.style.cursor = 'pointer';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = id;
      input.value = t;
      input.name = 'tagfilter';
      input.style.transform = 'scale(1.05)';
      const span = document.createElement('span');
      span.textContent = t;
      wrap.appendChild(input);
      wrap.appendChild(span);
      tagList.appendChild(wrap);
    });
    popup.appendChild(tagList);

    // actions
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '8px';
    actions.style.marginTop = '12px';
    const btnCancel = document.createElement('button');
    btnCancel.className = 'btn secondary';
    btnCancel.textContent = 'Batal';
    btnCancel.addEventListener('click', () => popup.remove());
    const btnApply = document.createElement('button');
    btnApply.className = 'btn primary';
    btnApply.textContent = 'Terapkan';
    btnApply.addEventListener('click', () => {
      const chosen = Array.from(popup.querySelectorAll('input[name="tagfilter"]:checked')).map(i => i.value);
      applyTagFilter(chosen);
      popup.remove();
    });
    actions.appendChild(btnCancel);
    actions.appendChild(btnApply);
    popup.appendChild(actions);

    // overlay close on click outside
    const overlay = document.createElement('div');
    overlay.id = 'tag-filter-overlay';
    overlay.style.position = 'fixed';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.zIndex = 19999;
    overlay.style.background = 'rgba(0,0,0,0.35)';
    overlay.addEventListener('click', () => { popup.remove(); overlay.remove(); });
    document.body.appendChild(overlay);
    document.body.appendChild(popup);
  }

  function applyTagFilter(tags = []) {
    // tags = [] means clear tag filter
    STATE.activeTagFilter = Array.isArray(tags) ? tags.map(t => String(t)) : [];
    STATE.galleryPage = 1;
    applyGalleryFilterAndRender();
  }

  function applyGalleryFilterAndRender() {
    const q = ($('#gallery-search')?.value || '').trim().toLowerCase();
    const selectedTags = STATE.activeTagFilter || [];
    // filter
    STATE.galleryFiltered = STATE.photos.filter(p => {
      // check tag filter first
      if (selectedTags.length) {
        const photoTags = (p.tags || []).map(t => String(t).toLowerCase());
        const ok = selectedTags.every(st => photoTags.includes(String(st).toLowerCase()));
        if (!ok) return false;
      }
      if (!q) return true;
      const inCaption = (p.caption || '').toLowerCase().includes(q);
      const inTags = (p.tags || []).some(t => String(t).toLowerCase().includes(q));
      return inCaption || inTags;
    });
    STATE.galleryPage = clamp(STATE.galleryPage, 1, Math.max(1, Math.ceil(STATE.galleryFiltered.length / STATE.galleryPerPage)));
    renderGalleryPage();
  }

  function renderGalleryInitial() {
    // initialize photos list
    STATE.galleryFiltered = STATE.photos.slice();
    STATE.galleryPage = 1;
    renderGalleryPage();
  }

  function renderGalleryPage() {
    const container = $('#gallery-masonry');
    if (!container) return;
    // compute pagination
    const per = STATE.galleryPerPage || 12;
    const total = STATE.galleryFiltered.length;
    STATE.galleryTotalPages = Math.max(1, Math.ceil(total / per));
    const start = (STATE.galleryPage - 1) * per;
    const end = start + per;
    const pageItems = STATE.galleryFiltered.slice(start, end);

    // clear container, then append items in column flow
    container.innerHTML = '';
    pageItems.forEach(item => {
      const fig = document.createElement('figure');
      fig.className = 'masonry-item';
      fig.setAttribute('data-id', item.id);
      fig.setAttribute('data-tags', JSON.stringify(item.tags || []));
      fig.style.opacity = '0';
      // image
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.alt = item.caption || '';
      img.dataset.src = item.secure_url || cloudinaryURLPublic(item.public_id || '', { w: 800, dpr: 'auto' });
      img.src = '/assets/thumb-placeholder.jpg';
      img.className = 'masonry-img';
      fig.appendChild(img);
      // caption overlay (show on hover)
      if (item.caption) {
        const cap = document.createElement('figcaption');
        cap.className = 'masonry-caption';
        cap.textContent = item.caption;
        fig.appendChild(cap);
      }
      // click opens lightbox for the filtered list at the right index
      fig.addEventListener('click', () => openLightboxFromGallery(item));
      container.appendChild(fig);
      // small reveal after image loads
      img.addEventListener('load', () => {
        fig.style.opacity = '1';
      });
    });

    $('#gallery-pageinfo').textContent = `Page ${STATE.galleryPage} / ${STATE.galleryTotalPages}`;
    // attach lazy loader
    attachGalleryLazyLoader();
  }

  function attachGalleryLazyLoader() {
    const container = $('#gallery-masonry');
    if (!container) return;
    // disconnect previous
    if (STATE.galleryObserver) {
      try { STATE.galleryObserver.disconnect(); } catch (e) {}
    }
    const imgs = Array.from(container.querySelectorAll('img[data-src]'));
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const img = en.target;
        const src = img.dataset.src;
        if (src) {
          img.src = src;
          img.removeAttribute('data-src');
        }
        obs.unobserve(img);
      });
    }, { root: null, rootMargin: '200px 0px', threshold: 0.01 });
    imgs.forEach(i => io.observe(i));
    STATE.galleryObserver = io;
  }

  function openLightboxFromGallery(item) {
    // create images list from current filtered set (STATE.galleryFiltered)
    const imgs = STATE.galleryFiltered.map(p => p.secure_url || cloudinaryURLPublic(p.public_id || '', { w: 1600, dpr: 'auto' }));
    const metaList = STATE.galleryFiltered.map(p => ({ caption: p.caption, date: p.date_taken }));
    const idx = STATE.galleryFiltered.findIndex(p => String(p.id) === String(item.id));
    openLightbox({ images: imgs, metaList, index: idx >= 0 ? idx : 0 });
  }

  //////////////////////
  // LIGHTBOX implementations
  //////////////////////

  function initLightboxHandlers() {
    // assign DOM references to LIGHTBOX
    LIGHTBOX.container = $('#lightbox');
    LIGHTBOX.inner = $('#lightbox-inner');
    LIGHTBOX.img = $('#lightbox-img');
    LIGHTBOX.meta = $('#lightbox-meta');
    LIGHTBOX.prevBtn = $('#lightbox-prev');
    LIGHTBOX.nextBtn = $('#lightbox-next');
    LIGHTBOX.closeBtn = $('#lightbox-close');

    if (!LIGHTBOX.container) {
      console.warn('Lightbox container missing in DOM');
      return;
    }

    // buttons
    LIGHTBOX.prevBtn?.addEventListener('click', () => lightboxPrev());
    LIGHTBOX.nextBtn?.addEventListener('click', () => lightboxNext());
    LIGHTBOX.closeBtn?.addEventListener('click', () => closeLightbox());

    // keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (!LIGHTBOX.open) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') lightboxPrev();
      if (e.key === 'ArrowRight') lightboxNext();
    });

    // click outside closes
    LIGHTBOX.container.addEventListener('click', (ev) => {
      if (ev.target === LIGHTBOX.container) closeLightbox();
    });
  }

  function openLightbox({ images = [], metaList = [], index = 0 } = {}) {
    if (!LIGHTBOX.container) return;
    LIGHTBOX.images = images || [];
    LIGHTBOX.metaList = metaList || [];
    LIGHTBOX.index = clamp(index || 0, 0, Math.max(0, LIGHTBOX.images.length - 1));
    renderLightbox();
    LIGHTBOX.container.setAttribute('aria-hidden', 'false');
    LIGHTBOX.open = true;
    LIGHTBOX.container.style.display = 'flex';
    // focus
    LIGHTBOX.inner?.focus();
  }

  function renderLightbox() {
    if (!LIGHTBOX.img) return;
    const src = LIGHTBOX.images[LIGHTBOX.index] || '';
    LIGHTBOX.img.src = src;
    LIGHTBOX.img.style.display = src ? '' : 'none';
    // update meta
    const meta = LIGHTBOX.metaList[LIGHTBOX.index] || {};
    LIGHTBOX.meta.innerHTML = `<div style="font-weight:700">${escapeHtml(meta.caption || '')}</div><div style="color:var(--muted);font-size:0.9rem">${escapeHtml(fmtDate(meta.date || ''))}</div>`;
  }

  function closeLightbox() {
    if (!LIGHTBOX.container) return;
    LIGHTBOX.open = false;
    LIGHTBOX.container.setAttribute('aria-hidden', 'true');
    LIGHTBOX.container.style.display = 'none';
    LIGHTBOX.img.src = '';
    LIGHTBOX.images = [];
    LIGHTBOX.metaList = [];
  }

  function lightboxPrev() {
    if (!LIGHTBOX.images.length) return;
    LIGHTBOX.index = (LIGHTBOX.index - 1 + LIGHTBOX.images.length) % LIGHTBOX.images.length;
    renderLightbox();
  }

  function lightboxNext() {
    if (!LIGHTBOX.images.length) return;
    LIGHTBOX.index = (LIGHTBOX.index + 1) % LIGHTBOX.images.length;
    renderLightbox();
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[m]);
  }

  //////////////////////
  // MEMORIES: render, observer center highlight, mini slideshow, auto-scroll
  //////////////////////

  function renderMemories(list = []) {
    const roll = document.querySelector('.memories-roll');
    if (!roll) return;
    roll.innerHTML = '';
    list.forEach(mem => {
      const art = document.createElement('article');
      art.className = 'memory-item';
      art.setAttribute('data-id', mem.id);
      art.setAttribute('data-photos', JSON.stringify(mem.photos.map(p => p.secure_url || p.public_id)));
      art.setAttribute('data-title', mem.title || '');
      art.setAttribute('data-date', mem.date || '');
      // film frame
      const frame = document.createElement('div'); frame.className = 'film-frame';
      const thumb = document.createElement('div'); thumb.className = 'film-thumb';
      const img = document.createElement('img');
      img.alt = mem.title || 'thumbnail';
      const thumbUrl = mem.thumbnail_public_id ? cloudinaryURLPublic(mem.thumbnail_public_id, { w: 360, h: 240, crop: 'fill' }) : (mem.photos[0] ? (mem.photos[0].secure_url || mem.photos[0].public_id) : '/assets/thumb-placeholder.jpg');
      img.src = thumbUrl;
      img.loading = 'lazy';
      thumb.appendChild(img);
      // indicators
      const indicator = document.createElement('div'); indicator.className = 'thumb-indicator';
      mem.photos.forEach((p, idx) => {
        const dot = document.createElement('div'); dot.className = 'thumb-dot' + (idx===0 ? ' active' : '');
        indicator.appendChild(dot);
      });
      thumb.appendChild(indicator);
      frame.appendChild(thumb);
      art.appendChild(frame);
      // info
      const info = document.createElement('div'); info.className = 'memory-info';
      const h3 = document.createElement('h3'); h3.className = 'memory-title'; h3.textContent = mem.title || '';
      const t = document.createElement('time'); t.className = 'memory-date'; t.textContent = fmtDate(mem.date);
      const p = document.createElement('p'); p.className = 'memory-excerpt'; p.textContent = mem.description || '';
      info.appendChild(h3); info.appendChild(t); info.appendChild(p);
      art.appendChild(info);
      // click -> lightbox for this memory
      art.addEventListener('click', (ev) => {
        // avoid interfering when clicking controls inside
        openMemoryLightbox(mem);
      });
      roll.appendChild(art);
    });
    // attach observer
    attachMemoriesObservers();
  }

  function attachMemoriesObservers() {
    const roll = document.querySelector('.memories-roll');
    if (!roll) return;
    // disconnect previous
    if (STATE.memoriesObserver) {
      try { STATE.memoriesObserver.disconnect(); } catch (e) {}
    }
    // thresholds for center detection: more granular
    const thresholds = [];
    for (let i=0;i<=1;i+=0.01) thresholds.push(i);
    STATE.memoriesObserver = new IntersectionObserver((entries) => {
      // find the item with largest intersection ratio in viewport area (entries possibly include items outside)
      let best = null;
      entries.forEach(en => {
        const el = en.target;
        const ratio = en.intersectionRatio || 0;
        if (!best || ratio > best.ratio) best = { el, ratio };
      });
      if (!best) return;
      // toggle classes
      const all = roll.querySelectorAll('.memory-item.is-center');
      all.forEach(x => { if (x !== best.el) { x.classList.remove('is-center'); stopMiniSlideshow(x); } });
      if (best.ratio > 0.25) {
        if (!best.el.classList.contains('is-center')) {
          best.el.classList.add('is-center');
          startMiniSlideshow(best.el);
        }
      } else {
        if (best.el.classList.contains('is-center')) {
          best.el.classList.remove('is-center');
          stopMiniSlideshow(best.el);
        }
      }
    }, { root: document.querySelector('.memories-viewport'), rootMargin: '0px', threshold: thresholds });
    // observe each item
    const items = Array.from(roll.querySelectorAll('.memory-item'));
    items.forEach(i => STATE.memoriesObserver.observe(i));
  }

  function startMiniSlideshow(el) {
    if (!el) return;
    const id = el.getAttribute('data-id');
    if (!id) return;
    if (el.__miniRunning) return;
    const photos = safeJSONParse(el.getAttribute('data-photos'), []);
    if (!photos || photos.length <= 1) return;
    el.__miniRunning = true;
    let idx = 0;
    const img = el.querySelector('.film-thumb img');
    const dots = Array.from(el.querySelectorAll('.thumb-dot'));
    const tick = () => {
      idx = (idx + 1) % photos.length;
      const url = photos[idx];
      img.src = cloudifyMaybe(url, { w: 360, h: 240, crop: 'fill' });
      dots.forEach((d,i) => d.classList.toggle('active', i === idx));
    };
    el.__miniTimer = setInterval(tick, 2000);
  }

  function stopMiniSlideshow(el) {
    if (!el) return;
    if (!el.__miniRunning) return;
    clearInterval(el.__miniTimer);
    el.__miniTimer = null;
    el.__miniRunning = false;
    // reset to first photo
    const photos = safeJSONParse(el.getAttribute('data-photos'), []);
    const img = el.querySelector('.film-thumb img');
    const dots = Array.from(el.querySelectorAll('.thumb-dot'));
    if (photos && photos[0]) img.src = cloudifyMaybe(photos[0], { w: 360, h: 240, crop: 'fill' });
    dots.forEach((d,i) => d.classList.toggle('active', i === 0));
  }

  function cloudifyMaybe(input, opts = {}) {
    if (!input) return '/assets/thumb-placeholder.jpg';
    if (/^https?:\/\//.test(input)) return input;
    return cloudinaryURLPublic(input, opts);
  }

  // Memory auto-scroll
  function initMemoriesAutoScroll() {
    const btn = $('#mem-auto-toggle');
    const viewport = $('#memories-viewport');
    if (!btn || !viewport) return;
    // read localStorage
    const saved = localStorage.getItem('memories_auto') === 'true';
    STATE.autoScroll = saved && !PREFERS_REDUCED_MOTION;
    updateAutoScrollButton();
    if (STATE.autoScroll) startMemoriesAutoScroll();
    btn.addEventListener('click', () => {
      STATE.autoScroll = !STATE.autoScroll;
      localStorage.setItem('memories_auto', STATE.autoScroll ? 'true' : 'false');
      updateAutoScrollButton();
      if (STATE.autoScroll) startMemoriesAutoScroll(); else stopMemoriesAutoScroll();
    });
    // pause when user interacts
    ['wheel', 'touchstart', 'pointerdown'].forEach(ev => viewport.addEventListener(ev, () => {
      if (STATE.autoScroll) { stopMemoriesAutoScroll(); STATE.autoScroll = false; updateAutoScrollButton(); localStorage.setItem('memories_auto', 'false'); }
    }, { passive: true }));
  }

  function updateAutoScrollButton() {
    const btn = $('#mem-auto-toggle');
    if (!btn) return;
    btn.textContent = STATE.autoScroll ? 'Pause Auto-Scroll' : 'Start Auto-Scroll';
    btn.setAttribute('aria-pressed', STATE.autoScroll ? 'true' : 'false');
  }

  function startMemoriesAutoScroll() {
    const viewport = $('#memories-viewport');
    if (!viewport) return;
    if (PREFERS_REDUCED_MOTION) return;
    // continuous upward scroll with wrap-around
    const stepPx = 0.45; // speed — px per frame
    function frame() {
      if (!STATE.autoScroll) { STATE.autoScrollRAF = null; return; }
      const max = viewport.scrollHeight - viewport.clientHeight;
      let next = viewport.scrollTop - stepPx;
      if (next <= 0) next = max; // loop
      viewport.scrollTop = next;
      STATE.autoScrollRAF = requestAnimationFrame(frame);
    }
    if (!STATE.autoScrollRAF) STATE.autoScrollRAF = requestAnimationFrame(frame);
  }

  function stopMemoriesAutoScroll() {
    if (STATE.autoScrollRAF) {
      cancelAnimationFrame(STATE.autoScrollRAF);
      STATE.autoScrollRAF = null;
    }
  }

  //////////////////////
  // EVENT: nearest + countdown
  //////////////////////
  let EVENT_TIMER = null;
  function renderEventNearest(events = []) {
    const box = $('#event-box');
    if (!box) return;
    if (!Array.isArray(events) || events.length === 0) {
      box.setAttribute('data-has-event', 'false');
      $('#event-title').textContent = 'Tidak ada event';
      $('#event-datetime').textContent = '';
      $('#event-desc').textContent = '';
      return;
    }
    // find next future event
    const now = new Date();
    const fut = events.map(ev => ({ ...ev, start: new Date(ev.start_datetime || ev.start || ev.date) }))
      .filter(ev => ev.start instanceof Date && !isNaN(ev.start.getTime()) && ev.start > now)
      .sort((a,b) => a.start - b.start);
    const nearest = fut[0] || null;
    if (!nearest) {
      box.setAttribute('data-has-event', 'false');
      $('#event-title').textContent = 'Tidak ada event';
      $('#event-datetime').textContent = '';
      $('#event-desc').textContent = '';
      return;
    }
    box.setAttribute('data-has-event', 'true');
    $('#event-title').textContent = nearest.title || 'Event';
    $('#event-datetime').textContent = fmtDate(nearest.start);
    $('#event-desc').textContent = nearest.description || '';
    startEventCountdown(nearest.start);
  }

  function startEventCountdown(targetDate) {
    if (EVENT_TIMER) { clearInterval(EVENT_TIMER); EVENT_TIMER = null; }
    const target = new Date(targetDate);
    if (isNaN(target)) return;
    function tick() {
      const now = new Date();
      let diff = Math.max(0, Math.floor((target - now) / 1000));
      if (diff <= 0) {
        // clear and hide
        $('#event-box')?.setAttribute('data-has-event', 'false');
        clearInterval(EVENT_TIMER);
        EVENT_TIMER = null;
        return;
      }
      const days = Math.floor(diff / 86400); diff -= days * 86400;
      const hours = Math.floor(diff / 3600); diff -= hours * 3600;
      const mins = Math.floor(diff / 60); diff -= mins * 60;
      const secs = diff;
      $('#cd-days').textContent = String(days).padStart(2,'0');
      $('#cd-hours').textContent = String(hours).padStart(2,'0');
      $('#cd-mins').textContent = String(mins).padStart(2,'0');
      $('#cd-secs').textContent = String(secs).padStart(2,'0');
    }
    tick();
    EVENT_TIMER = setInterval(tick, 1000);
  }

  //////////////////////
  // MESSAGES
  //////////////////////
  function renderMessages(list = []) {
    const container = $('#messages-list');
    if (!container) return;
    container.innerHTML = '';
    list.forEach(m => {
      const art = document.createElement('article');
      art.className = 'message-card';
      art.setAttribute('data-id', m.id);
      const h = document.createElement('h3'); h.className = 'msg-title'; h.textContent = m.title || '';
      const auth = document.createElement('div'); auth.className = 'msg-author'; auth.textContent = m.author_name || '';
      const body = document.createElement('div'); body.className = 'msg-body'; body.textContent = m.content || '';
      art.appendChild(h); art.appendChild(auth); art.appendChild(body);
      art.addEventListener('click', () => openMessageModal(m));
      container.appendChild(art);
    });
  }

  function openMessageModal(m) {
    openLightbox({ images: [], metaList: [], index: 0 });
    const meta = $('#lightbox-meta');
    if (meta) {
      meta.innerHTML = `<div style="font-weight:700">${escapeHtml(m.title || '')}</div><div style="color:var(--muted);margin-bottom:8px">oleh: ${escapeHtml(m.author_name || '')}</div><div>${escapeHtml(m.content || '')}</div>`;
    }
    $('#lightbox-img').style.display = 'none';
  }

  //////////////////////
  // PLUGIN SLOT (iframe)
  //////////////////////
  function initPluginSlotUI() {
    const slot = $('#plugin-slot');
    if (!slot) return;
    const enabled = slot.getAttribute('data-enabled') === 'true';
    const url = slot.getAttribute('data-plugin-url') || '';
    if (enabled && url) mountPlugin(url);
  }

  function mountPlugin(url) {
    const slot = $('#plugin-slot');
    if (!slot) return;
    unmountPlugin();
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.width = '100%';
    iframe.height = '640';
    iframe.loading = 'lazy';
    iframe.style.border = '0';
    iframe.style.borderRadius = '12px';
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
    slot.innerHTML = '';
    slot.appendChild(iframe);
    slot.setAttribute('aria-hidden', 'false');
    STATE.plugin = { enabled: true, url };
  }

  function unmountPlugin() {
    const slot = $('#plugin-slot');
    if (!slot) return;
    slot.innerHTML = '<div class="plugin-placeholder"><div class="plugin-note">Plugin belum aktif</div></div>';
    slot.setAttribute('aria-hidden', 'true');
    STATE.plugin = { enabled: false, url: '' };
  }

  //////////////////////
  // HEADER floating behavior & nav clicks
  //////////////////////
  function initHeaderFloating() {
    const header = $('#site-header');
    const nav = $('#floating-nav');
    if (!header || !nav) return;
    // initial position is absolute inside hero; when user scrolls, make it fixed to top-left small
    const compactClass = 'header--compact';
    let ticking = false;
    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const y = window.scrollY || document.documentElement.scrollTop;
          header.classList.toggle(compactClass, y > 120);
          // if compact, ensure nav is visible as floating fixed small
          ticking = false;
        });
        ticking = true;
      }
    }
    document.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function initFloatingNavClicks() {
    const nav = $('#floating-nav');
    if (!nav) return;
    nav.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.nav-btn');
      if (!btn) return;
      const target = btn.getAttribute('data-target');
      if (!target) return;
      scrollTo(target);
    });
  }

  function scrollTo(selector) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  //////////////////////
  // Masonry small helper (we rely mostly on CSS columns, but enforce reflow after images load)
  //////////////////////
  function reflowMasonryAfterLoad() {
    // ensure images have loaded then force reflow by toggling a CSS var
    const cont = $('#gallery-masonry');
    if (!cont) return;
    const images = Array.from(cont.querySelectorAll('img'));
    let loaded = 0;
    if (images.length === 0) return;
    images.forEach(img => {
      if (img.complete) {
        loaded++;
      } else {
        img.addEventListener('load', () => {
          loaded++;
          if (loaded === images.length) {
            // no-op but triggers layout
            cont.style.columnGap = '14px';
            setTimeout(() => cont.style.columnGap = '14px', 50);
          }
        });
      }
    });
  }

  //////////////////////
  // Utilities and DOM helpers
  //////////////////////
  function attachGalleryLazyLoaderOnDemand() {
    // safe alias for external call
    attachGalleryLazyLoader();
  }

  function attachGalleryLazyLoader() {
    const container = $('#gallery-masonry');
    if (!container) return;
    if (STATE.galleryObserver) { try { STATE.galleryObserver.disconnect(); } catch (e) {} STATE.galleryObserver = null; }
    const items = Array.from(container.querySelectorAll('img[data-src]'));
    if (!items.length) return;
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const img = en.target;
        const src = img.dataset.src;
        if (src) img.src = src;
        obs.unobserve(img);
      });
    }, { root: null, rootMargin: '300px 0px', threshold: 0.01 });
    items.forEach(i => io.observe(i));
    STATE.galleryObserver = io;
  }

  //////////////////////
  // Utilities: open memory lightbox
  //////////////////////
  function openMemoryLightbox(mem) {
    const imgs = mem.photos.map(p => p.secure_url || cloudifyMaybe(p.public_id || ''));
    const metaList = mem.photos.map(p => ({ caption: mem.title, date: mem.date }));
    openLightbox({ images: imgs, metaList, index: 0 });
  }

  //////////////////////
  // Motions: Motto pointer glow (follow pointer)
  //////////////////////
  function initMottoPointer() {
    const m = document.querySelector('.motto-inner');
    if (!m || PREFERS_REDUCED_MOTION) return;
    m.addEventListener('pointermove', (ev) => {
      const rect = m.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      m.style.setProperty('--pointer-x', `${x}px`);
      m.style.setProperty('--pointer-y', `${y}px`);
    });
  }

  //////////////////////
  // Footer year
  //////////////////////
  function initFooterYear() {
    const fy = $('#footer-year');
    if (fy) fy.textContent = new Date().getFullYear();
  }

  //////////////////////
  // Escape & small helpers
  //////////////////////
  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[m]);
  }

  //////////////////////
  // Expose some utilities for debugging (only if DEBUG)
  //////////////////////
  if (DEBUG) {
    window.__KELAS_STATE = STATE;
    window.__KELAS_UTILS = { cloudifyMaybe, supabaseGet };
    console.log('DEBUG mode: __KELAS_STATE exposed');
  }

  //////////////////////
  // END
  //////////////////////
})();
