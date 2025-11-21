/* script.js
   "Otak" utama untuk halaman index.html
   Responsibilities:
   - Read CONFIG from #env-config
   - Fetch public data from Supabase REST (photos, memories, events, messages, site_config)
   - Render Profil, Gallery (masonry), Motto, Messages, Event countdown, Memories roll-film
   - Lazy-load images via IntersectionObserver
   - Lightbox functionality (fullscreen, prev/next, keyboard)
   - Auto-scroll for memories with Start/Pause (persisted)
   - Center-highlight detection: add .is-center and trigger mini slideshow in thumbnail
   - Plugin slot: mount/unmount iframe
   - Header/nav behavior on scroll
   - Accessibility and reduced-motion respect
*/

(() => {
  'use strict';

  /* -------------------------
     Utilities & Config
     ------------------------- */

  const DEBUG = false;
  const log = (...args) => { if (DEBUG) console.log(...args); };

  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const $ = qs;
  const $$ = qsa;

  // Read config from #env-config (JSON) fallback to window.__CONFIG__
  function readConfig() {
    try {
      const el = document.getElementById('env-config');
      if (el && el.textContent.trim()) {
        return JSON.parse(el.textContent);
      }
    } catch (e) {
      console.warn('env-config parse failed', e);
    }
    return window.__CONFIG__ || {};
  }

  const CONFIG = readConfig();
  const SUPABASE_URL = CONFIG.SUPABASE_URL || '';
  const SUPABASE_ANON = CONFIG.SUPABASE_ANON_KEY || '';
  const CLOUD_NAME = CONFIG.CLOUDINARY_CLOUD_NAME || '';
  const CLOUD_PRESET = CONFIG.CLOUDINARY_UPLOAD_PRESET || '';

  // Simple fetch wrapper for Supabase REST (public reads)
  async function supabaseGet(table, opts = {}) {
    if (!SUPABASE_URL || !SUPABASE_ANON) {
      // return null to indicate no backend configured
      return null;
    }
    const headers = {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
    };
    // build query
    let url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}?select=*`;
    if (opts.filter) url += `&${opts.filter}`;
    if (opts.order) url += `&order=${encodeURIComponent(opts.order)}`;
    if (opts.limit) url += `&limit=${opts.limit}`;
    if (opts.offset) url += `&offset=${opts.offset}`;
    if (opts.range) url += `&range=${opts.range}`;
    try {
      const r = await fetch(url, { headers });
      if (!r.ok) throw new Error(`Supabase GET ${table} failed: ${r.status}`);
      const json = await r.json();
      return json;
    } catch (err) {
      console.error('supabaseGet error', err);
      return null;
    }
  }

  // Cloudinary URL builder (public_id or absolute URL)
  function cloudinaryURL({ public_id, secure_url }, opts = {}) {
    // if secure_url provided or public_id already is absolute URL, return that
    if (secure_url && typeof secure_url === 'string' && secure_url.startsWith('http')) return secure_url;
    if (!public_id) return '';
    if (/^https?:\/\//.test(public_id)) return public_id;
    const cloud = CLOUD_NAME || '{CLOUD_NAME}';
    // transformations: w_auto,dpr_auto,f_auto,q_auto
    const t = [];
    if (opts.w) t.push(`w_${opts.w}`);
    else t.push('w_auto');
    if (opts.h) t.push(`h_${opts.h}`);
    if (opts.crop) t.push(`c_${opts.crop}`);
    t.push('f_auto');
    t.push('q_auto');
    if (opts.dpr === 'auto') t.push('dpr_auto');
    const trans = t.join(',');
    // remove leading slashes in public_id
    const pub = public_id.replace(/^\/+/, '');
    return `https://res.cloudinary.com/${cloud}/image/upload/${trans}/${pub}`;
  }

  // Safe parse JSON
  function safeJSONParse(s, fallback = null) {
    try { return JSON.parse(s); } catch (e) { return fallback; }
  }

  // format date utilities
  function fmtDateISOToDisplay(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const opts = { day: '2-digit', month: 'short', year: 'numeric' };
    return d.toLocaleDateString('id-ID', opts);
  }

  // clamp
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // detect prefers-reduced-motion
  const PREFERS_REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* -------------------------
     Initial bootstrap
     ------------------------- */

  async function initSite() {
    // feather icons
    try { if (window.feather) window.feather.replace(); } catch (e) {}

    initHeaderScroll();
    initFloatingNav();
    initFooterYear();
    initMottoPointerGlow();
    initLightboxHandlers();
    initGalleryControls();
    initPluginSlot();

    // fetch data: attempt Supabase; if null then fallback to demo sample data
    const [
      siteConfig,
      profiles,
      photos,
      memories,
      events,
      messages
    ] = await Promise.all([
      fetchSiteConfig(),
      supabaseGet('profiles', { limit: 50, order: 'id.asc' }),
      supabaseGet('photos', { filter: 'public=eq.true', order: 'id.desc', limit: 100 }),
      supabaseGet('memories', { filter: 'public=eq.true', order: 'date.desc', limit: 100 }),
      supabaseGet('events', { filter: 'is_public=eq.true', order: 'start_datetime.asc', limit: 20 }),
      supabaseGet('messages', { order: 'id.desc', limit: 50 }),
    ]);

    // fallback demo data if supabase returns null
    const demo = getDemoData();
    const cfg = siteConfig || demo.site_config;
    const prof = profiles || demo.profiles;
    const ph = photos || demo.photos;
    const mem = memories || demo.memories;
    const ev = events || demo.events;
    const msg = messages || demo.messages;

    renderSiteConfig(cfg);
    renderProfil(prof);
    initGallery(ph);
    renderMessages(msg);
    initEvent(ev);
    initMemories(mem);

    // feather replace again (icons inserted dynamically)
    try { if (window.feather) window.feather.replace(); } catch (e) {}
  }

  // wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSite);
  } else {
    initSite();
  }

  /* -------------------------
     SITE CONFIG
     ------------------------- */

  async function fetchSiteConfig() {
    const cfgArr = await supabaseGet('site_config', { limit: 200 });
    if (!cfgArr) return null;
    // site_config table assumed key/value pairs or single object
    // if array of rows, convert to key/value
    if (Array.isArray(cfgArr)) {
      const obj = {};
      cfgArr.forEach(row => {
        if (row.key) obj[row.key] = row.value;
      });
      return obj;
    }
    return cfgArr;
  }

  function renderSiteConfig(cfg = {}) {
    // title
    const titleEl = $('#site-title');
    if (titleEl && cfg.site_title) titleEl.textContent = cfg.site_title;
    // motto
    const motto = cfg.motto_text || cfg.motto || '[Motto Kelas]';
    const mottoEl = $('#motto-text');
    if (mottoEl) mottoEl.textContent = motto;
    // hero image
    const hero = $('#hero-img');
    if (hero && cfg.hero_public_id) {
      hero.src = cloudinaryURL({ public_id: cfg.hero_public_id }, { w: 1600, crop: 'fill' });
    }
    // footer text override
    const footerText = $('#footer-text');
    if (footerText && cfg.footer_text) footerText.innerHTML = cfg.footer_text.replace('{{year}}', new Date().getFullYear());
  }

  /* -------------------------
     HEADER / NAV BEHAVIOR
     ------------------------- */
  function initHeaderScroll() {
    const header = document.getElementById('site-header');
    if (!header) return;
    let lastY = window.scrollY;
    let ticking = false;
    function onScroll() {
      const y = window.scrollY;
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const compact = y > 120;
          header.classList.toggle('header--compact', compact);
          lastY = y;
          ticking = false;
        });
        ticking = true;
      }
    }
    document.addEventListener('scroll', onScroll, { passive: true });
    // initial
    onScroll();
  }

  function initFloatingNav() {
    const nav = document.getElementById('floating-nav');
    if (!nav) return;
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-btn');
      if (!btn) return;
      const target = btn.getAttribute('data-target');
      if (target) scrollToSection(target);
    });
  }

  function scrollToSection(selector) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* -------------------------
     FOOTER YEAR
     ------------------------- */
  function initFooterYear() {
    const fy = document.getElementById('footer-year');
    if (fy) fy.textContent = new Date().getFullYear();
  }

  /* -------------------------
     MOTTO POINTER GLOW (follow pointer)
     ------------------------- */
  function initMottoPointerGlow() {
    const mottoInner = document.querySelector('.motto-inner');
    if (!mottoInner || PREFERS_REDUCED_MOTION) return;
    // create a pointer-following gradient by updating CSS variables
    function onMove(e) {
      const rect = mottoInner.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      mottoInner.style.setProperty('--pointer-x', `${x}px`);
      mottoInner.style.setProperty('--pointer-y', `${y}px`);
      // optional: move pseudo-element by updating style transform
      mottoInner.style.setProperty('--pointer-opacity', '1');
    }
    mottoInner.addEventListener('pointermove', onMove);
    mottoInner.addEventListener('pointerleave', () => {
      mottoInner.style.setProperty('--pointer-opacity', '0.6');
    });
  }

  /* -------------------------
     GALLERY: render, search, paginate, lazy-load
     ------------------------- */

  // gallery state
  const GALLERY = {
    items: [], // raw items from backend
    filtered: [],
    page: 1,
    perPage: 12,
    totalPages: 1,
    observer: null
  };

  function initGalleryControls() {
    const search = $('#gallery-search');
    const perpage = $('#gallery-perpage');
    const prev = $('#gallery-prev');
    const next = $('#gallery-next');

    if (search) {
      search.addEventListener('input', () => {
        GALLERY.page = 1;
        applyGalleryFilter();
      });
    }
    if (perpage) {
      perpage.addEventListener('change', () => {
        GALLERY.perPage = parseInt(perpage.value, 10) || 12;
        GALLERY.page = 1;
        renderGalleryPage();
      });
    }
    if (prev) prev.addEventListener('click', () => {
      if (GALLERY.page > 1) {
        GALLERY.page--;
        renderGalleryPage();
        scrollToSection('#gallery');
      }
    });
    if (next) next.addEventListener('click', () => {
      if (GALLERY.page < GALLERY.totalPages) {
        GALLERY.page++;
        renderGalleryPage();
        scrollToSection('#gallery');
      }
    });
  }

  async function initGallery(itemsRaw = []) {
    // itemsRaw is array of photo objects
    GALLERY.items = normalizePhotos(itemsRaw);
    applyGalleryFilter();
  }

  function normalizePhotos(items) {
    // ensure each item has id, caption, public_id or secure_url, tags array
    if (!items || !Array.isArray(items)) return [];
    return items.map(it => {
      return {
        id: it.id || it.photo_id || Math.random().toString(36).slice(2,9),
        caption: it.caption || it.title || '',
        public_id: it.public_id || it.public_id_cloudinary || it.public_id?.toString() || it.public_id,
        secure_url: it.secure_url || it.url || it.secure_url,
        tags: Array.isArray(it.tags) ? it.tags : (typeof it.tags === 'string' ? safeJSONParse(it.tags, []) : []),
        date_taken: it.date_taken || it.created_at || it.date,
        raw: it
      };
    });
  }

  function applyGalleryFilter() {
    const q = ($('#gallery-search')?.value || '').trim().toLowerCase();
    // filter by tag or caption
    GALLERY.filtered = GALLERY.items.filter(item => {
      if (!q) return true;
      const inCaption = (item.caption || '').toLowerCase().includes(q);
      const inTags = (item.tags || []).some(t => String(t).toLowerCase().includes(q));
      return inCaption || inTags;
    });
    GALLERY.page = 1;
    renderGalleryPage();
  }

  function renderGalleryPage() {
    const container = $('#gallery-masonry');
    if (!container) return;
    const per = GALLERY.perPage || 12;
    const total = GALLERY.filtered.length;
    GALLERY.totalPages = Math.max(1, Math.ceil(total / per));
    const start = (GALLERY.page - 1) * per;
    const end = start + per;
    const pageItems = GALLERY.filtered.slice(start, end);

    container.innerHTML = '';
    pageItems.forEach(item => {
      const fig = document.createElement('figure');
      fig.className = 'masonry-item';
      fig.setAttribute('data-id', item.id);
      fig.setAttribute('data-tags', JSON.stringify(item.tags || []));
      // image element uses data-src for lazy-loading
      const img = document.createElement('img');
      img.className = 'masonry-img';
      img.alt = item.caption || '';
      img.loading = 'lazy';
      const thumbUrl = cloudinaryURL({ public_id: item.public_id, secure_url: item.secure_url }, { w: 800, dpr: 'auto' });
      img.dataset.src = thumbUrl || (item.secure_url || '');
      img.src = '/assets/thumb-placeholder.jpg'; // low-res placeholder
      fig.appendChild(img);

      if (item.caption) {
        const cap = document.createElement('figcaption');
        cap.className = 'masonry-caption';
        cap.textContent = item.caption;
        fig.appendChild(cap);
      }
      // click opens lightbox at image index within current filtered list
      fig.addEventListener('click', () => openLightboxFromGallery(item));
      container.appendChild(fig);
    });

    $('#gallery-pageinfo').textContent = `Page ${GALLERY.page} / ${GALLERY.totalPages}`;

    // lazy-load observer for gallery images
    if (GALLERY.observer) GALLERY.observer.disconnect();
    const imgs = Array.from(container.querySelectorAll('img[data-src]'));
    const io = new IntersectionObserver((entries, observer) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const img = e.target;
        const src = img.dataset.src;
        if (src) img.src = src;
        observer.unobserve(img);
      });
    }, { rootMargin: '200px 0px', threshold: 0.01 });
    imgs.forEach(img => io.observe(img));
    GALLERY.observer = io;
  }

  function openLightboxFromGallery(item) {
    // find all filtered items and open lightbox at this index
    const images = GALLERY.filtered.map(it => cloudinaryURL({ public_id: it.public_id, secure_url: it.secure_url }, { w: 1600, dpr: 'auto' }));
    const startIndex = Math.max(0, GALLERY.filtered.findIndex(it => it.id === item.id));
    openLightbox({ images, startIndex, metaList: GALLERY.filtered });
  }

  /* -------------------------
     LIGHTBOX
     ------------------------- */

  const LIGHTBOX = {
    container: null,
    inner: null,
    img: null,
    meta: null,
    index: 0,
    images: [],
    metaList: []
  };

  function initLightboxHandlers() {
    LIGHTBOX.container = $('#lightbox');
    LIGHTBOX.inner = $('#lightbox-inner');
    LIGHTBOX.img = $('#lightbox-img');
    LIGHTBOX.meta = $('#lightbox-meta');

    $('#lightbox-close')?.addEventListener('click', closeLightbox);
    $('#lightbox-prev')?.addEventListener('click', () => lightboxPrev());
    $('#lightbox-next')?.addEventListener('click', () => lightboxNext());
    document.addEventListener('keydown', (e) => {
      if (!LIGHTBOX.container || LIGHTBOX.container.getAttribute('aria-hidden') === 'true') return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') lightboxPrev();
      if (e.key === 'ArrowRight') lightboxNext();
    });
    // trap focus on open is omitted for brevity but could be added
  }

  function openLightbox({ images = [], startIndex = 0, metaList = [] } = {}) {
    if (!LIGHTBOX.container) return;
    LIGHTBOX.images = images || [];
    LIGHTBOX.metaList = metaList || [];
    LIGHTBOX.index = clamp(startIndex || 0, 0, LIGHTBOX.images.length - 1);
    // set image
    const src = LIGHTBOX.images[LIGHTBOX.index] || '';
    LIGHTBOX.img.src = src;
    LIGHTBOX.img.alt = (LIGHTBOX.metaList[LIGHTBOX.index]?.caption || '') || '';
    updateLightboxMeta();
    LIGHTBOX.container.setAttribute('aria-hidden', 'false');
    // show
    try { LIGHTBOX.container.style.display = 'flex'; } catch (e) {}
  }

  function updateLightboxMeta() {
    if (!LIGHTBOX.meta) return;
    const metaObj = LIGHTBOX.metaList[LIGHTBOX.index] || {};
    const title = metaObj.caption || metaObj.title || '';
    const date = fmtDateISOToDisplay(metaObj.date_taken || metaObj.date || metaObj.created_at);
    LIGHTBOX.meta.innerHTML = `<div class="lightbox-meta-title">${escapeHtml(title)}</div><div class="lightbox-meta-date">${escapeHtml(date)}</div>`;
  }

  function closeLightbox() {
    if (!LIGHTBOX.container) return;
    LIGHTBOX.container.setAttribute('aria-hidden', 'true');
    try { LIGHTBOX.container.style.display = 'none'; } catch (e) {}
    LIGHTBOX.img.src = '';
    LIGHTBOX.images = [];
    LIGHTBOX.metaList = [];
  }

  function lightboxPrev() {
    if (!LIGHTBOX.images.length) return;
    LIGHTBOX.index = (LIGHTBOX.index - 1 + LIGHTBOX.images.length) % LIGHTBOX.images.length;
    LIGHTBOX.img.src = LIGHTBOX.images[LIGHTBOX.index];
    updateLightboxMeta();
  }

  function lightboxNext() {
    if (!LIGHTBOX.images.length) return;
    LIGHTBOX.index = (LIGHTBOX.index + 1) % LIGHTBOX.images.length;
    LIGHTBOX.img.src = LIGHTBOX.images[LIGHTBOX.index];
    updateLightboxMeta();
  }

  /* -------------------------
     MESSAGES (static list, click expand)
     ------------------------- */

  function renderMessages(items = []) {
    const list = $('#messages-list');
    if (!list) return;
    list.innerHTML = '';
    items.forEach(it => {
      const card = document.createElement('article');
      card.className = 'message-card';
      card.setAttribute('data-id', it.id || Math.random().toString(36).slice(2,8));
      const title = document.createElement('h3');
      title.className = 'msg-title';
      title.textContent = it.title || it.headline || 'Pesan';
      const author = document.createElement('div');
      author.className = 'msg-author';
      author.textContent = it.author_name ? `oleh: ${it.author_name}` : '';
      const body = document.createElement('div');
      body.className = 'msg-body';
      body.textContent = it.content || it.body || '';
      card.appendChild(title);
      card.appendChild(author);
      card.appendChild(body);
      card.addEventListener('click', () => openMessageDetail(it));
      list.appendChild(card);
    });
  }

  function openMessageDetail(it) {
    // reuse lightbox as a simple modal for message detail
    openLightbox({ images: [], startIndex: 0, metaList: [] });
    const meta = $('#lightbox-meta');
    if (meta) {
      meta.innerHTML = `<h3 style="margin:0 0 8px">${escapeHtml(it.title || 'Pesan')}</h3>
        <div style="color:var(--muted);margin-bottom:8px">${it.author_name ? 'oleh: ' + escapeHtml(it.author_name) : ''}</div>
        <div>${escapeHtml(it.content || it.body || '')}</div>`;
    }
    // hide image
    $('#lightbox-img').style.display = 'none';
  }

  /* -------------------------
     EVENTS: nearest + countdown
     ------------------------- */

  function initEvent(events = []) {
    if (!Array.isArray(events)) events = [];
    // find the nearest future event
    const now = new Date();
    const future = events
      .map(e => ({ ...e, start: new Date(e.start_datetime || e.start || e.date || null) }))
      .filter(e => e.start instanceof Date && !Number.isNaN(e.start.getTime()) && e.start > now)
      .sort((a,b) => a.start - b.start);
    const nearest = future.length ? future[0] : null;
    renderEventBox(nearest);
  }

  function renderEventBox(ev) {
    const box = $('#event-box');
    if (!box) return;
    if (!ev) {
      box.setAttribute('data-has-event', 'false');
      $('#event-title').textContent = 'Tidak ada event';
      $('#event-datetime').textContent = '';
      $('#event-desc').textContent = '';
      box.querySelector('.event-countdown')?.setAttribute('aria-hidden', 'true');
      return;
    }
    box.setAttribute('data-has-event', 'true');
    $('#event-title').textContent = ev.title || 'Event';
    $('#event-datetime').textContent = fmtDateISOToDisplay(ev.start_datetime || ev.start || ev.date);
    $('#event-desc').textContent = ev.description || ev.desc || '';
    box.querySelector('.event-countdown')?.setAttribute('aria-hidden', 'false');
    startEventCountdown(ev.start_datetime || ev.start || ev.date);
  }

  let _eventCountdownTimer = null;
  function startEventCountdown(targetISO) {
    if (_eventCountdownTimer) { clearInterval(_eventCountdownTimer); _eventCountdownTimer = null; }
    const target = new Date(targetISO);
    if (Number.isNaN(target.getTime())) return;
    function tick() {
      const now = new Date();
      let diff = Math.max(0, Math.floor((target - now) / 1000)); // in seconds
      if (diff <= 0) {
        // hide event or mark done
        const box = $('#event-box');
        if (box) { box.setAttribute('data-has-event', 'false'); }
        clearInterval(_eventCountdownTimer);
        _eventCountdownTimer = null;
        return;
      }
      const days = Math.floor(diff / 86400); diff -= days * 86400;
      const hours = Math.floor(diff / 3600); diff -= hours * 3600;
      const mins = Math.floor(diff / 60); diff -= mins * 60;
      const secs = Math.floor(diff);
      $('#cd-days').textContent = String(days).padStart(2,'0');
      $('#cd-hours').textContent = String(hours).padStart(2,'0');
      $('#cd-mins').textContent = String(mins).padStart(2,'0');
      $('#cd-secs').textContent = String(secs).padStart(2,'0');
    }
    tick();
    _eventCountdownTimer = setInterval(tick, 1000);
  }

  /* -------------------------
     PLUGIN SLOT (iframe)
     ------------------------- */

  const PLUGIN = {
    enabled: false,
    url: '',
    iframe: null
  };

  function initPluginSlot() {
    const slot = $('#plugin-slot');
    if (!slot) return;
    // check attributes
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
    iframe.height = '560';
    iframe.loading = 'lazy';
    iframe.style.border = '0';
    iframe.style.borderRadius = '12px';
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms'); // restrict as needed
    slot.innerHTML = '';
    slot.appendChild(iframe);
    slot.setAttribute('aria-hidden', 'false');
    PLUGIN.enabled = true;
    PLUGIN.url = url;
    PLUGIN.iframe = iframe;
  }

  function unmountPlugin() {
    const slot = $('#plugin-slot');
    if (!slot) return;
    slot.innerHTML = '<div class="plugin-placeholder"><div class="plugin-note">Plugin belum aktif</div></div>';
    slot.setAttribute('aria-hidden', 'true');
    PLUGIN.enabled = false;
    PLUGIN.url = '';
    PLUGIN.iframe = null;
  }

  /* -------------------------
     MEMORIES: render, center-detect, auto-scroll, mini slideshow
     ------------------------- */

  const MEM = {
    items: [],
    io: null,
    centerScanInterval: null,
    autoScrolling: false,
    autoScrollRAF: null,
    autoScrollSpeed: 0.5, // px per frame-ish
    miniSlides: new Map(), // memoryId => { idx, timerId }
    observerOpts: { root: null, rootMargin: '0px', threshold: buildThresholdList() },
    viewport: null
  };

  function buildThresholdList() {
    const thresholds = [];
    for (let i=0;i<=1.0;i+=0.01) thresholds.push(i);
    return thresholds;
  }

  function initMemories(items = []) {
    const roll = document.querySelector('.memories-roll');
    MEM.viewport = document.getElementById('memories-viewport');
    if (!roll || !MEM.viewport) return;
    MEM.items = normalizeMemories(items);
    renderMemories(roll, MEM.items);
    setupMemoriesObserver();
    setupAutoScrollToggle();
    // pause on user interaction
    ['wheel','touchstart','pointerdown'].forEach(ev => {
      MEM.viewport.addEventListener(ev, () => stopAutoScroll(), { passive: true });
    });
  }

  function normalizeMemories(items) {
    if (!Array.isArray(items)) return [];
    return items.map(it => {
      // memory.photos may be array of objects or public_ids or urls
      const rawPhotos = Array.isArray(it.photos) ? it.photos : (typeof it.photos === 'string' ? safeJSONParse(it.photos, []) : []);
      const photos = rawPhotos.map(p => {
        if (typeof p === 'string') {
          // assume public_id or url
          return { public_id: p, secure_url: p };
        }
        return { public_id: p.public_id || p.public_id_cloudinary, secure_url: p.secure_url || p.url || '' };
      });
      return {
        id: it.id || Math.random().toString(36).slice(2,8),
        title: it.title || '',
        date: it.date || it.created_at || it.date_taken || '',
        description: it.description || it.excerpt || '',
        thumbnail_public_id: it.thumbnail_public_id || (photos[0] && photos[0].public_id) || '',
        photos,
        raw: it
      };
    });
  }

  function renderMemories(container, items) {
    container.innerHTML = '';
    items.forEach(mem => {
      const art = document.createElement('article');
      art.className = 'memory-item';
      art.setAttribute('data-id', mem.id);
      art.setAttribute('data-photos', JSON.stringify(mem.photos.map(p => p.secure_url || p.public_id)));
      art.setAttribute('data-title', mem.title || '');
      art.setAttribute('data-date', mem.date || '');

      // film frame
      const frame = document.createElement('div');
      frame.className = 'film-frame';
      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'film-thumb';
      const img = document.createElement('img');
      img.alt = mem.title || 'thumbnail';
      // set initial src: either constructed cloudinary thumbnail or placeholder
      const thumbUrl = cloudinaryURL({ public_id: mem.thumbnail_public_id }, { w: 360, h: 240, crop: 'fill' }) ||
                       (mem.photos[0] ? (mem.photos[0].secure_url || mem.photos[0].public_id) : '');
      img.src = thumbUrl || '/assets/thumb-placeholder.jpg';
      img.loading = 'lazy';
      thumbWrap.appendChild(img);
      // indicator dots container
      const indicator = document.createElement('div');
      indicator.className = 'thumb-indicator';
      mem.photos.forEach((p, idx) => {
        const dot = document.createElement('div');
        dot.className = 'thumb-dot';
        if (idx === 0) dot.classList.add('active');
        indicator.appendChild(dot);
      });
      thumbWrap.appendChild(indicator);

      frame.appendChild(thumbWrap);
      art.appendChild(frame);

      // memory info
      const info = document.createElement('div');
      info.className = 'memory-info';
      const h3 = document.createElement('h3');
      h3.className = 'memory-title';
      h3.textContent = mem.title || 'Judul Memory';
      const t = document.createElement('time');
      t.className = 'memory-date';
      t.textContent = fmtDateISOToDisplay(mem.date);
      const p = document.createElement('p');
      p.className = 'memory-excerpt';
      p.textContent = mem.description || '';
      info.appendChild(h3);
      info.appendChild(t);
      info.appendChild(p);

      art.appendChild(info);

      // click opens lightbox with all photos of this memory
      art.addEventListener('click', (e) => {
        // prevent when clicking indicator
        openMemoryLightbox(mem);
      });

      container.appendChild(art);
    });

    // ensure feather icons updated where needed
    try { if (window.feather) window.feather.replace(); } catch (e) {}
  }

  function openMemoryLightbox(mem) {
    const imgs = mem.photos.map(p => cloudinaryURL({ public_id: p.public_id, secure_url: p.secure_url }, { w: 1600, dpr: 'auto' }));
    openLightbox({ images: imgs, startIndex: 0, metaList: mem.photos.map((p, idx) => ({ caption: mem.title })) });
  }

  function setupMemoriesObserver() {
    const roll = document.querySelector('.memories-roll');
    if (!roll) return;
    // IntersectionObserver to detect visibility / center
    if (MEM.io) MEM.io.disconnect();
    MEM.io = new IntersectionObserver(handleMemIntersection, MEM.observerOpts);
    const items = Array.from(roll.querySelectorAll('.memory-item'));
    items.forEach(it => MEM.io.observe(it));
  }

  function handleMemIntersection(entries) {
    // choose the item with largest intersection ratio as center
    let best = null;
    entries.forEach(en => {
      const el = en.target;
      el._lastRatio = en.intersectionRatio;
      if (!best || en.intersectionRatio > best.ratio) {
        best = { el, ratio: en.intersectionRatio };
      }
    });
    if (!best) return;
    // clear others .is-center
    const roll = document.querySelector('.memories-roll');
    if (roll) {
      roll.querySelectorAll('.memory-item.is-center').forEach(e => {
        if (e !== best.el) {
          e.classList.remove('is-center');
          stopMiniSlideshow(e);
        }
      });
    }
    // set center on best.el
    if (best.ratio > 0.25) { // threshold to avoid false positives
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
  }

  function startMiniSlideshow(el) {
    if (!el) return;
    const id = el.getAttribute('data-id');
    if (!id) return;
    // protect: if already running, ignore
    if (MEM.miniSlides.has(id)) return;
    const photosRaw = safeJSONParse(el.getAttribute('data-photos'), []);
    const photos = (photosRaw || []).map(p => (typeof p === 'string' ? p : (p.secure_url || p.public_id || '')));
    if (!photos || photos.length <= 1) return; // no need to slideshow single image
    const img = el.querySelector('.film-thumb img');
    const dots = Array.from(el.querySelectorAll('.thumb-dot'));
    let idx = 0;
    const intervalMs = 2100;
    function tick() {
      idx = (idx + 1) % photos.length;
      const url = photos[idx];
      if (img) img.src = cloudifyUrlMaybe(url, { w: 360, h: 240, crop: 'fill' });
      dots.forEach((d, i) => d.classList.toggle('active', i === idx));
    }
    const timer = setInterval(tick, intervalMs);
    MEM.miniSlides.set(id, { idx, timer });
  }

  function stopMiniSlideshow(el) {
    if (!el) return;
    const id = el.getAttribute('data-id');
    if (!id) return;
    const state = MEM.miniSlides.get(id);
    if (state) {
      clearInterval(state.timer);
      MEM.miniSlides.delete(id);
      // reset thumbnail to first photo if available
      const photosRaw = safeJSONParse(el.getAttribute('data-photos'), []);
      const first = (photosRaw && photosRaw[0]) ? photosRaw[0] : null;
      const img = el.querySelector('.film-thumb img');
      if (img && first) img.src = cloudifyUrlMaybe(first, { w: 360, h: 240, crop: 'fill' });
      // reset dots
      el.querySelectorAll('.thumb-dot').forEach((d, i) => d.classList.toggle('active', i === 0));
    }
  }

  function cloudifyUrlMaybe(input, opts = {}) {
    // input might be public_id or absolute url
    if (!input) return '';
    if (/^https?:\/\//.test(input)) return input;
    // else build cloudinary url
    return cloudinaryURL({ public_id: input }, opts);
  }

  // Auto-scroll behavior
  function setupAutoScrollToggle() {
    const toggle = document.getElementById('mem-auto-toggle');
    if (!toggle || !MEM.viewport) return;
    // initialize state from localStorage
    const saved = localStorage.getItem('memAutoScroll');
    const want = saved === 'true';
    toggle.textContent = want ? 'Pause Auto-Scroll' : 'Start Auto-Scroll';
    toggle.setAttribute('aria-pressed', want ? 'true' : 'false');
    if (want) startAutoScroll();
    toggle.addEventListener('click', () => {
      const newState = !(MEM.autoScrolling);
      if (newState) startAutoScroll();
      else stopAutoScroll();
      localStorage.setItem('memAutoScroll', MEM.autoScrolling ? 'true' : 'false');
      toggle.textContent = MEM.autoScrolling ? 'Pause Auto-Scroll' : 'Start Auto-Scroll';
      toggle.setAttribute('aria-pressed', MEM.autoScrolling ? 'true' : 'false');
    });
  }

  function startAutoScroll() {
    if (PREFERS_REDUCED_MOTION) return;
    if (MEM.autoScrolling) return;
    MEM.autoScrolling = true;
    const viewport = MEM.viewport;
    if (!viewport) return;
    const step = () => {
      if (!MEM.autoScrolling) return;
      // scroll upward slowly to create nostalgia roll effect (spec said "bergulis naik secara perlahan")
      // We'll scroll content inside the viewport's first scroll parent (viewport itself)
      const maxScroll = viewport.scrollHeight - viewport.clientHeight;
      const current = viewport.scrollTop;
      // move up (toward top) at speed proportional to content
      const delta = MEM.autoScrollSpeed; // px per frame
      let next = current - delta;
      if (next <= 0) {
        // reached top => loop back to bottom for continuous nostalgia
        next = maxScroll;
      }
      viewport.scrollTop = next;
      MEM.autoScrollRAF = requestAnimationFrame(step);
    };
    MEM.autoScrollRAF = requestAnimationFrame(step);
  }

  function stopAutoScroll() {
    if (!MEM.autoScrolling) return;
    MEM.autoScrolling = false;
    if (MEM.autoScrollRAF) {
      cancelAnimationFrame(MEM.autoScrollRAF);
      MEM.autoScrollRAF = null;
    }
  }

  /* -------------------------
     HELPERS & FALLBACK DEMO DATA
     ------------------------- */

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }

  function getDemoData() {
    // Minimal demo objects so page is interactive without Supabase
    const demoPhotos = new Array(16).fill(0).map((_,i) => ({
      id: i+1,
      caption: `Foto Kenangan ${i+1}`,
      public_id: `sample/${(i%6)+1}.jpg`, // placeholder public_id (not real)
      secure_url: `https://picsum.photos/seed/kelas-${i+1}/1200/800`,
      tags: ['sample','kelas', i%2===0 ? 'ospek' : 'kegiatan'],
      date_taken: (new Date()).toISOString()
    }));
    const demoMemories = [
      {
        id: 'm1',
        title: 'Ospek 2024',
        date: '2024-09-02',
        description: 'Kegiatan orientasi siswa baru.',
        photos: demoPhotos.slice(0,5).map(p => p.secure_url)
      },
      {
        id: 'm2',
        title: 'Kunjungan Industri',
        date: '2024-11-10',
        description: 'Belajar di industri rekanan.',
        photos: demoPhotos.slice(5,10).map(p => p.secure_url)
      },
      {
        id: 'm3',
        title: 'Pentas Seni',
        date: '2025-03-20',
        description: 'Pertunjukan karya siswa.',
        photos: demoPhotos.slice(10,16).map(p => p.secure_url)
      }
    ];
    const demoEvents = [
      { id: 'e1', title: 'Ujian Modul 1', start_datetime: new Date(Date.now() + 7*24*3600*1000).toISOString(), description: 'Ujian materi Revit dasar.' }
    ];
    const demoMessages = [
      { id: 'msg1', title: 'Untuk Angkatan 2024', author_name: 'Guru Wali', content: 'Tetap semangat dan jangan lupa kumpulkan tugas.' },
      { id: 'msg2', title: 'Ucapan Terima Kasih', author_name: 'Ketua Kelas', content: 'Terima kasih teman-teman atas perjuangan.' }
    ];
    const demoProfiles = [
      { id: 'p1', name: 'Ketua Kelas', role: 'Ketua', jumlah: 36, social: { instagram: '#' } },
      { id: 'p2', name: 'Wakil Ketua', role: 'Wakil Ketua', social: { instagram: '#' } },
      { id: 'p3', name: 'Wali Kelas', role: 'Wali Kelas', social: { instagram: '#' } },
      { id: 'p4', name: 'Asal Sekolah', role: 'Asal Sekolah', jumlah: 0 }
    ];
    const demoSiteConfig = {
      site_title: 'Kelas 11 DPIB 2 — SMKN 1 KOTA KEDIRI',
      motto_text: 'Kenangan Kita, Selamanya',
      footer_text: '© {{year}} Kelas 11 DPIB 2 — SMKN 1 KOTA KEDIRI'
    };
    return {
      photos: demoPhotos,
      memories: demoMemories,
      events: demoEvents,
      messages: demoMessages,
      profiles: demoProfiles,
      site_config: demoSiteConfig
    };
  }

  /* -------------------------
     PROFIL RENDERING
     ------------------------- */

  function renderProfil(data = []) {
    const grid = $('#profil-grid');
    if (!grid) return;
    grid.innerHTML = '';
    // data could be array of objects or conversion from site_config
    if (!Array.isArray(data)) {
      // try to convert object mapping keys to cards
      const arr = [];
      for (const k in data) {
        arr.push({ key: k, value: data[k] });
      }
      data = arr;
    }
    // Ensure we render the mandatory fields: Ketua, Wakil, Jumlah Siswa, Wali, Asal Sekolah
    // If data contains profiles, map them
    if (data.length && data[0].name) {
      // assume profiles format
      data.forEach(p => {
        const card = document.createElement('article');
        card.className = 'profil-card';
        card.setAttribute('data-person', p.role ? p.role.toLowerCase().replace(/\s+/g,'-') : (p.id || 'p'));
        card.setAttribute('data-id', p.id || '');
        const body = document.createElement('div');
        body.className = 'pc-body';
        const name = document.createElement('div'); name.className = 'pc-name'; name.textContent = p.name || '';
        const role = document.createElement('div'); role.className = 'pc-role'; role.textContent = p.role || '';
        const meta = document.createElement('div'); meta.className = 'pc-meta';
        if (p.jumlah || p.count || p.jumlah_siswa) meta.textContent = `Jumlah siswa: ${p.jumlah || p.count || p.jumlah_siswa}`;
        else meta.textContent = p.school || p.asal_sekolah || '';
        const socials = document.createElement('div'); socials.className = 'pc-socials';
        // social icons editable in admin; render anchors if exist
        const s = p.social || {};
        for (const key of ['instagram','facebook','twitter','youtube','link']) {
          if (s[key]) {
            const a = document.createElement('a'); a.className = 'pc-social';
            a.href = s[key]; a.target = '_blank'; a.rel = 'noopener';
            a.setAttribute('aria-label', `${p.name} ${key}`);
            a.innerHTML = `<i data-feather="${key==='link'?'link':key}"></i>`;
            socials.appendChild(a);
          }
        }
        body.appendChild(name);
        body.appendChild(role);
        body.appendChild(meta);
        if (socials.children.length) body.appendChild(socials);
        card.appendChild(body);
        grid.appendChild(card);
      });
    } else {
      // fallback: use keys
      const mandatory = [
        { label: 'Ketua', key: 'ketua' },
        { label: 'Wakil Ketua', key: 'wakil' },
        { label: 'Jumlah Siswa', key: 'jumlah_siswa' },
        { label: 'Wali Kelas', key: 'wali_kelas' },
        { label: 'Asal Sekolah', key: 'asal_sekolah' }
      ];
      mandatory.forEach(m => {
        const card = document.createElement('article');
        card.className = 'profil-card';
        card.setAttribute('data-person', m.key);
        const body = document.createElement('div'); body.className = 'pc-body';
        const name = document.createElement('div'); name.className = 'pc-name'; name.textContent = m.label;
        const role = document.createElement('div'); role.className = 'pc-role'; role.textContent = '';
        const meta = document.createElement('div'); meta.className = 'pc-meta'; meta.textContent = '';
        body.appendChild(name); body.appendChild(role); body.appendChild(meta);
        card.appendChild(body);
        grid.appendChild(card);
      });
    }
    // replace dynamic icons
    try { if (window.feather) window.feather.replace(); } catch (e) {}
  }

  /* -------------------------
     Small helpers
     ------------------------- */

  // escape for safety in meta
  function safeText(s) { return s == null ? '' : String(s); }

  // end of IIFE
})();
