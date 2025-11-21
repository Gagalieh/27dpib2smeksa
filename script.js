/* script.js — FINAL
   Comprehensive client script for Kelas 11 DPIB 2 site.

   Features:
   - Read config from #env-config or window.__CONFIG__
   - Supabase minimal REST fetch wrapper for public reads
   - Cloudinary URL builder
   - Demo fallback data
   - Render: site config, profil, gallery (masonry Pinterest-like), messages, event, plugin slot, memories (roll-film)
   - Gallery: search + tag-filter popup (checklist) + pagination (prev/next + per-page)
   - Masonry JS layout (column-based) for consistent Pinterest-like placement
   - Lazy-load images via IntersectionObserver
   - Lightbox (fullscreen) with prev/next, keyboard support, accessibility
   - Header: floating navigation that follows screen on scroll (compact glass when scrolled)
   - Memories: IntersectionObserver center-detection, auto-scroll toggle persist, mini-slideshow when centered
   - Plugin iframe mount/unmount
   - Robust error handling and debug mode
   - Respects prefers-reduced-motion
*/

(() => {
  'use strict';

  /* ======================
     CONFIG & GLOBALS
     ====================== */

  const DEBUG = false;
  const log = (...args) => { if (DEBUG) console.log(...args); };

  // short helpers
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from((r || document).querySelectorAll(s));

  // Read env-config JSON, fallback to window.__CONFIG__
  function readConfig() {
    try {
      const el = document.getElementById('env-config');
      if (el && el.textContent.trim()) return JSON.parse(el.textContent);
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

  const PREFERS_REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ======================
     SAFE DECLARATIONS
     ====================== */

  // LIGHTBOX must exist before handlers reference it — declared upfront
  let LIGHTBOX = {
    container: null,
    inner: null,
    img: null,
    meta: null,
    index: 0,
    images: [],
    metaList: []
  };

  // State containers
  const STATE = {
    gallery: {
      items: [],
      filtered: [],
      page: 1,
      perPage: 12,
      totalPages: 1,
      tagList: [], // available tags
      selectedTags: new Set(),
      observer: null
    },
    memories: {
      items: [],
      io: null,
      centerInterval: null,
      autoScrolling: false,
      autoScrollRAF: null,
      autoScrollSpeed: 0.6,
      miniSlides: new Map()
    },
    profiles: [],
    events: [],
    messages: [],
    siteConfig: {}
  };

  /* ======================
     UTILS
     ====================== */

  function safeJSON(s, fallback = null) {
    try { return JSON.parse(s); } catch (e) { return fallback; }
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[m]);
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // Cloudinary URL builder — robust: accept public_id or absolute url or object
  function cloudinaryURL(src, opts = {}) {
    // src may be: { public_id, secure_url } or string (public_id or url)
    if (!src) return '';
    if (typeof src === 'object') {
      if (src.secure_url && typeof src.secure_url === 'string' && src.secure_url.startsWith('http')) return src.secure_url;
      src = src.public_id || src.public_id_cloudinary || src.secure_url || '';
    }
    if (!src) return '';
    if (/^https?:\/\//.test(src)) return src;
    const cloud = CLOUD_NAME || '{CLOUD_NAME}';
    // transformations
    const t = [];
    if (opts.crop) t.push(`c_${opts.crop}`);
    if (opts.w) t.push(`w_${opts.w}`);
    if (opts.h) t.push(`h_${opts.h}`);
    t.push('f_auto');
    t.push('q_auto');
    if (opts.dpr === 'auto') t.push('dpr_auto');
    const trans = t.join(',');
    const pub = src.replace(/^\/+/, '');
    return `https://res.cloudinary.com/${cloud}/image/upload/${trans}/${pub}`;
  }

  // simple supabase GET using REST endpoint (public reads only)
  async function supabaseGet(table, params = {}) {
    if (!SUPABASE_URL || !SUPABASE_ANON) return null;
    const headers = {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`
    };
    let url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}?select=*`;
    if (params.filter) url += `&${params.filter}`;
    if (params.order) url += `&order=${encodeURIComponent(params.order)}`;
    if (params.limit) url += `&limit=${params.limit}`;
    try {
      const r = await fetch(url, { headers });
      if (!r.ok) throw new Error(`Supabase GET ${table} ${r.status}`);
      const json = await r.json();
      return json;
    } catch (err) {
      console.warn('supabaseGet error', err.message || err);
      return null;
    }
  }

  /* ======================
     BOOTSTRAP
     ====================== */

  async function initSite() {
    try {
      if (window.feather) window.feather.replace();
    } catch (e) {}

    initHeaderBehavior();        // floating nav + compact state
    initFloatingNavClicks();     // nav click behavior
    initFooterYear();
    initLightbox();              // setup lightbox handlers & state
    initMottoPointer();
    initGalleryControls();       // search, perpage, prev/next
    initTagFilterUI();           // tag filter popup UI
    initPluginSlot();            // plugin slot placeholder

    // fetch (supabase) or fallback demo
    const [
      cfg,
      profiles,
      photos,
      memories,
      events,
      messages
    ] = await Promise.all([
      fetchSiteConfig(),
      supabaseGet('profiles', { limit: 200 }).catch(() => null),
      supabaseGet('photos', { filter: 'public=eq.true', order: 'id.desc', limit: 400 }).catch(() => null),
      supabaseGet('memories', { filter: 'public=eq.true', order: 'date.desc', limit: 400 }).catch(() => null),
      supabaseGet('events', { filter: 'is_public=eq.true', order: 'start_datetime.asc', limit: 20 }).catch(() => null),
      supabaseGet('messages', { order: 'id.desc', limit: 100 }).catch(() => null)
    ]);

    const demo = demoData();
    STATE.siteConfig = cfg || demo.siteConfig;
    STATE.profiles = profiles || demo.profiles;
    STATE.gallery.items = normalizePhotos(photos || demo.photos);
    STATE.memories.items = normalizeMemories(memories || demo.memories);
    STATE.events = events || demo.events;
    STATE.messages = messages || demo.messages;

    renderSiteConfig(STATE.siteConfig);
    renderProfiles(STATE.profiles);
    buildTagListFromPhotos();
    renderGalleryPage(); // will compute filtered = all initially
    renderMessages(STATE.messages);
    renderEventNearest(STATE.events);
    renderMemories();

    // Init feather again in case dynamic icons added
    try { if (window.feather) window.feather.replace(); } catch (e) {}

    // Accessibility: if reduced motion, disable auto-scroll
    if (PREFERS_REDUCED_MOTION) {
      // ensure toggle disabled
      const memToggle = document.getElementById('mem-auto-toggle');
      if (memToggle) { memToggle.style.display = 'none'; }
    }
  }

  // start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSite);
  } else {
    initSite();
  }

  /* ======================
     SITE CONFIG / PROFILES RENDER
     ====================== */

  async function fetchSiteConfig() {
    const rows = await supabaseGet('site_config', { limit: 200 }).catch(() => null);
    if (!rows) return null;
    if (Array.isArray(rows) && rows.length) {
      // convert key/value rows to object if applicable
      const obj = {};
      rows.forEach(r => {
        if (r.key) obj[r.key] = r.value;
      });
      return obj;
    }
    return rows;
  }

  function renderSiteConfig(cfg = {}) {
    // title
    const titleEl = $('#site-title');
    if (titleEl && cfg.site_title) titleEl.textContent = cfg.site_title;
    // motto
    const mEl = $('#motto-text');
    if (mEl) mEl.textContent = cfg.motto_text || cfg.motto || '[Motto Kelas]';
    // hero
    const hero = $('#hero-img');
    if (hero && cfg.hero_public_id) {
      hero.src = cloudinaryURL(cfg.hero_public_id, { w: 1600, crop: 'fill' });
    }
    // footer
    const footer = $('#footer-text');
    if (footer) footer.innerHTML = (cfg.footer_text || '© {{year}} Kelas 11 DPIB 2 — SMKN 1 KOTA KEDIRI').replace('{{year}}', new Date().getFullYear());
  }

  function renderProfiles(list = []) {
    const grid = $('#profil-grid');
    if (!grid) return;
    grid.innerHTML = '';
    // ensure mandatory entries if list is empty/insufficient
    if (!Array.isArray(list) || !list.length) {
      const defaults = [
        { role: 'Ketua', name: 'Ketua Kelas', social: {} },
        { role: 'Wakil Ketua', name: 'Wakil Ketua', social: {} },
        { role: 'Wali Kelas', name: 'Wali Kelas', social: {} },
        { role: 'Asal Sekolah', name: 'SMKN 1 KOTA KEDIRI', social: {} },
        { role: 'Jumlah Siswa', name: '36', social: {} }
      ];
      list = defaults;
    }
    // map and render
    list.forEach(p => {
      const art = document.createElement('article');
      art.className = 'profil-card';
      art.setAttribute('data-person', (p.role || p.label || '').toString().toLowerCase().replace(/\s+/g,'-'));
      art.innerHTML = `
        <div class="pc-body">
          <div class="pc-name">${escapeHtml(p.name || p.role || p.label || '')}</div>
          <div class="pc-role">${escapeHtml(p.role || p.label || '')}</div>
          <div class="pc-meta">${p.jumlah_siswa ? 'Jumlah siswa: ' + escapeHtml(p.jumlah_siswa) : (p.school || p.asal_sekolah ? escapeHtml(p.school || p.asal_sekolah) : '')}</div>
        </div>
      `;
      // socials
      if (p.social && typeof p.social === 'object') {
        const socials = document.createElement('div');
        socials.className = 'pc-socials';
        Object.entries(p.social).slice(0,4).forEach(([k,v]) => {
          if (!v) return;
          const a = document.createElement('a');
          a.className = 'pc-social';
          a.href = v;
          a.target = '_blank';
          a.rel = 'noopener';
          a.title = `${p.name} ${k}`;
          // feather icon name mapping
          const icon = (k === 'instagram' || k === 'ig') ? 'instagram' : (k === 'facebook' ? 'facebook' : (k === 'twitter' ? 'twitter' : 'link'));
          a.innerHTML = `<i data-feather="${icon}"></i>`;
          socials.appendChild(a);
        });
        art.querySelector('.pc-body').appendChild(socials);
      }
      grid.appendChild(art);
    });
    try { if (window.feather) window.feather.replace(); } catch (e) {}
  }

  /* ======================
     GALLERY (Masonry + Filter + Pagination)
     ====================== */

  // Normalize photos from Supabase or demo
  function normalizePhotos(arr = []) {
    if (!Array.isArray(arr)) return [];
    return arr.map((p, idx) => {
      const tags = Array.isArray(p.tags) ? p.tags : (typeof p.tags === 'string' ? safeJSON(p.tags, []) || [] : []);
      return {
        id: p.id || `photo-${idx}-${Date.now()}`,
        caption: p.caption || p.title || '',
        public_id: p.public_id || p.public_id_cloudinary || '',
        secure_url: p.secure_url || p.url || '',
        tags: tags.map(t => String(t).trim()).filter(Boolean),
        date_taken: p.date_taken || p.created_at || p.date || null,
        raw: p
      };
    });
  }

  // Build tag list from photos
  function buildTagListFromPhotos() {
    const set = new Set();
    STATE.gallery.items.forEach(it => (it.tags || []).forEach(t => set.add(t)));
    STATE.gallery.tagList = Array.from(set).sort((a,b) => a.localeCompare(b));
    renderTagFilterBadgeCount();
  }

  function renderTagFilterBadgeCount() {
    // placeholder: could update UI to show number of tags
    const badge = document.getElementById('gallery-tagcount-badge');
    if (badge) badge.textContent = STATE.gallery.tagList.length;
  }

  // Controls: search, perpage, prev/next
  function initGalleryControls() {
    const search = $('#gallery-search');
    const perpage = $('#gallery-perpage');
    const prev = $('#gallery-prev');
    const next = $('#gallery-next');

    if (search) {
      search.addEventListener('input', () => {
        STATE.gallery.page = 1;
        applyGalleryFilterAndRender();
      });
    }
    if (perpage) {
      perpage.addEventListener('change', () => {
        STATE.gallery.perPage = parseInt(perpage.value,10) || 12;
        STATE.gallery.page = 1;
        renderGalleryPage();
      });
    }
    if (prev) prev.addEventListener('click', () => {
      if (STATE.gallery.page > 1) {
        STATE.gallery.page--;
        renderGalleryPage();
        scrollTo('#gallery');
      }
    });
    if (next) next.addEventListener('click', () => {
      if (STATE.gallery.page < STATE.gallery.totalPages) {
        STATE.gallery.page++;
        renderGalleryPage();
        scrollTo('#gallery');
      }
    });

    // Create Tag Filter button (inject next to search)
    const controls = $('.gallery-controls');
    if (controls && !$('#tag-filter-btn')) {
      const btn = document.createElement('button');
      btn.id = 'tag-filter-btn';
      btn.className = 'btn secondary';
      btn.type = 'button';
      btn.innerHTML = '<span>Filter Tag</span>';
      btn.addEventListener('click', openTagFilterPopup);
      controls.appendChild(btn);
    }
  }

  // Apply filter (search text + selected tags)
  function applyGalleryFilterAndRender() {
    const q = ($('#gallery-search')?.value || '').trim().toLowerCase();
    const tags = Array.from(STATE.gallery.selectedTags || []);
    // filter logic: item matches if (no tags selected OR item.tags includes all selected tags?) — we'll treat as "includes any selected tag"
    STATE.gallery.filtered = STATE.gallery.items.filter(it => {
      const matchesQuery = !q || (it.caption || '').toLowerCase().includes(q) || (it.tags || []).some(t => t.toLowerCase().includes(q));
      const matchesTags = !tags.length || (it.tags || []).some(t => tags.includes(t));
      return matchesQuery && matchesTags;
    });
    STATE.gallery.page = 1;
    renderGalleryPage();
  }

  // Render Gallery page (with masonry layout)
  function renderGalleryPage() {
    const container = $('#gallery-masonry');
    if (!container) return;
    const per = STATE.gallery.perPage || 12;
    const items = STATE.gallery.filtered && STATE.gallery.filtered.length ? STATE.gallery.filtered : STATE.gallery.items;
    const total = items.length;
    STATE.gallery.totalPages = Math.max(1, Math.ceil(total / per));
    const start = (STATE.gallery.page - 1) * per;
    const pageItems = items.slice(start, start + per);

    // Clear container
    container.innerHTML = '';

    // Build item elements
    const elems = pageItems.map(it => {
      const fig = document.createElement('figure');
      fig.className = 'masonry-item';
      fig.setAttribute('data-id', it.id);
      fig.setAttribute('data-tags', JSON.stringify(it.tags || []));
      fig.setAttribute('tabindex', '0');
      const img = document.createElement('img');
      img.className = 'masonry-img';
      img.alt = it.caption || '';
      img.loading = 'lazy';
      img.dataset.src = cloudinaryURL(it.public_id || it.secure_url || it.raw?.public_id || it.raw?.secure_url, { w: 900, dpr: 'auto' }) || (it.secure_url || '');
      img.src = '/assets/thumb-placeholder.jpg';
      fig.appendChild(img);
      if (it.caption) {
        const cap = document.createElement('figcaption');
        cap.className = 'masonry-caption';
        cap.textContent = it.caption;
        fig.appendChild(cap);
      }
      // click opens lightbox with the filtered set as images
      fig.addEventListener('click', () => openLightboxFromGalleryItem(it, items));
      return fig;
    });

    // Place elements into masonry columns (JS-based Pinterest style)
    layoutMasonry(container, elems);

    // update page info
    const info = $('#gallery-pageinfo');
    if (info) info.textContent = `Page ${STATE.gallery.page} / ${STATE.gallery.totalPages}`;

    // lazy-load images
    setupImageLazyLoad(container);
  }

  // Layout masonry algorithm: create N columns and append items in shortest column order
  function layoutMasonry(container, items) {
    // determine columns by container width and desired column width
    const containerWidth = container.clientWidth || container.getBoundingClientRect().width || window.innerWidth;
    const desiredColWidth = 260; // px target
    let cols = Math.max(1, Math.floor(containerWidth / desiredColWidth));
    // responsive limits
    cols = clamp(cols, 1, 6);

    // create column elements
    container.innerHTML = '';
    const colEls = [];
    for (let i=0;i<cols;i++) {
      const col = document.createElement('div');
      col.className = 'masonry-col';
      col.style.width = `${(100/cols).toFixed(4)}%`;
      col.style.display = 'inline-block';
      col.style.verticalAlign = 'top';
      col.style.padding = '0 6px';
      col.style.boxSizing = 'border-box';
      colEls.push(col);
      container.appendChild(col);
    }

    // track heights approximation by using image aspect or fixed heights; for simplicity, place sequentially into shortest column
    const heights = new Array(cols).fill(0);
    // We don't know image heights until loaded; we approximate by count distribution: append to shortest
    items.forEach(el => {
      // find index of shortest column
      let idx = 0;
      for (let i=1;i<heights.length;i++) if (heights[i] < heights[idx]) idx = i;
      colEls[idx].appendChild(el);
      // increment estimated height: base item height ~ 240 (approx) — this ensures even distribution
      heights[idx] += 260;
    });

    // Add gutter clearing
    const clear = document.createElement('div');
    clear.style.clear = 'both';
    container.appendChild(clear);
  }

  // Lazy-load images within a root element
  function setupImageLazyLoad(root) {
    const imgs = Array.from((root || document).querySelectorAll('img[data-src]'));
    if (!imgs.length) return;
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          const img = en.target;
          const src = img.dataset.src;
          if (src) img.src = src;
          obs.unobserve(img);
        }
      });
    }, { rootMargin: '300px 0px', threshold: 0.01 });
    imgs.forEach(i => io.observe(i));
  }

  function openLightboxFromGalleryItem(item, itemsSet) {
    // construct images from the itemsSet (the current filtered set or all)
    const images = (itemsSet || STATE.gallery.items).map(it => cloudinaryURL(it.public_id || it.secure_url || it.raw?.public_id, { w: 1600, dpr: 'auto' }) || (it.secure_url || ''));
    const metaList = (itemsSet || STATE.gallery.items).map(it => ({ caption: it.caption, date: it.date_taken }));
    const startIndex = Math.max(0, (itemsSet || STATE.gallery.items).findIndex(it => it.id === item.id));
    openLightbox({ images, startIndex, metaList });
  }

  /* ======================
     TAG FILTER POPUP UI
     ====================== */

  // create popup DOM if not exists
  function ensureTagFilterPopup() {
    if ($('#tag-filter-popup')) return $('#tag-filter-popup');
    const popup = document.createElement('div');
    popup.id = 'tag-filter-popup';
    popup.className = 'tag-filter-popup glass';
    popup.style.position = 'fixed';
    popup.style.left = '50%';
    popup.style.top = '50%';
    popup.style.transform = 'translate(-50%,-50%)';
    popup.style.zIndex = '2000';
    popup.style.padding = '18px';
    popup.style.maxWidth = '480px';
    popup.style.width = '90%';
    popup.style.display = 'none';
    popup.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong>Pilih Tag</strong>
        <button id="tag-filter-close" class="btn secondary" aria-label="Tutup filter">Tutup</button>
      </div>
      <div id="tag-filter-list" style="max-height:320px;overflow:auto;display:flex;flex-direction:column;gap:8px;padding-right:6px"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button id="tag-filter-clear" class="btn secondary">Bersihkan</button>
        <button id="tag-filter-apply" class="btn primary">Terapkan</button>
      </div>
    `;
    document.body.appendChild(popup);
    $('#tag-filter-close').addEventListener('click', closeTagFilterPopup);
    $('#tag-filter-clear').addEventListener('click', () => {
      STATE.gallery.selectedTags.clear();
      renderTagFilterCheckboxes();
    });
    $('#tag-filter-apply').addEventListener('click', () => {
      applyGalleryFilterAndRender();
      closeTagFilterPopup();
    });
    return popup;
  }

  function openTagFilterPopup() {
    const popup = ensureTagFilterPopup();
    renderTagFilterCheckboxes();
    popup.style.display = 'block';
    // trap focus simple: focus first checkbox or close button
    const first = popup.querySelector('input[type="checkbox"]');
    (first || $('#tag-filter-close', popup)).focus();
  }

  function closeTagFilterPopup() {
    const popup = $('#tag-filter-popup');
    if (popup) popup.style.display = 'none';
  }

  function renderTagFilterCheckboxes() {
    const container = $('#tag-filter-list');
    if (!container) return;
    container.innerHTML = '';
    const tags = STATE.gallery.tagList || [];
    if (!tags.length) {
      container.innerHTML = '<div style="color:var(--muted)">Tidak ada tag tersedia</div>';
      return;
    }
    tags.forEach(tag => {
      const id = `tag-${tag.replace(/\s+/g,'_')}`;
      const row = document.createElement('label');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.cursor = 'pointer';
      row.innerHTML = `<input type="checkbox" id="${id}" data-tag="${escapeHtml(tag)}"> <span>${escapeHtml(tag)}</span>`;
      container.appendChild(row);
      const cb = row.querySelector('input[type="checkbox"]');
      cb.checked = STATE.gallery.selectedTags.has(tag);
      cb.addEventListener('change', (e) => {
        if (e.target.checked) STATE.gallery.selectedTags.add(tag);
        else STATE.gallery.selectedTags.delete(tag);
      });
    });
  }

  /* ======================
     LIGHTBOX (full featured)
     ====================== */

  function initLightbox() {
    LIGHTBOX.container = $('#lightbox');
    LIGHTBOX.inner = $('#lightbox-inner');
    LIGHTBOX.img = $('#lightbox-img');
    LIGHTBOX.meta = $('#lightbox-meta');

    if (!LIGHTBOX.container) {
      // Defensive: create a minimal lightbox if missing
      const lb = document.createElement('div');
      lb.id = 'lightbox';
      lb.className = 'lightbox';
      lb.setAttribute('aria-hidden', 'true');
      lb.innerHTML = `
        <button id="lightbox-close" class="lightbox-close" aria-label="Close"><i data-feather="x"></i></button>
        <button id="lightbox-prev" class="lightbox-nav prev" aria-label="Previous"><i data-feather="chevron-left"></i></button>
        <div id="lightbox-inner" class="lightbox-inner" tabindex="-1">
          <img id="lightbox-img" />
          <div id="lightbox-meta" class="lightbox-meta"></div>
        </div>
        <button id="lightbox-next" class="lightbox-nav next" aria-label="Next"><i data-feather="chevron-right"></i></button>
      `;
      document.body.appendChild(lb);
      try { if (window.feather) window.feather.replace(); } catch (e) {}
      LIGHTBOX.container = $('#lightbox');
      LIGHTBOX.inner = $('#lightbox-inner');
      LIGHTBOX.img = $('#lightbox-img');
      LIGHTBOX.meta = $('#lightbox-meta');
    }

    // bind handlers
    $('#lightbox-close')?.addEventListener('click', closeLightbox);
    $('#lightbox-prev')?.addEventListener('click', prevLightbox);
    $('#lightbox-next')?.addEventListener('click', nextLightbox);

    document.addEventListener('keydown', (e) => {
      if (!LIGHTBOX.container || LIGHTBOX.container.getAttribute('aria-hidden') === 'true') return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') prevLightbox();
      if (e.key === 'ArrowRight') nextLightbox();
    });

    // click outside image closes
    LIGHTBOX.container.addEventListener('click', (ev) => {
      if (ev.target === LIGHTBOX.container) closeLightbox();
    });
  }

  function openLightbox({ images = [], startIndex = 0, metaList = [] } = {}) {
    LIGHTBOX.images = images || [];
    LIGHTBOX.metaList = metaList || [];
    LIGHTBOX.index = clamp(startIndex || 0, 0, Math.max(0, LIGHTBOX.images.length - 1));
    if (LIGHTBOX.img) {
      const src = LIGHTBOX.images[LIGHTBOX.index] || '';
      LIGHTBOX.img.style.display = src ? '' : 'none';
      LIGHTBOX.img.src = src || '';
      LIGHTBOX.img.alt = (LIGHTBOX.metaList[LIGHTBOX.index]?.caption || '') || '';
    }
    updateLightboxMeta();
    if (LIGHTBOX.container) {
      LIGHTBOX.container.setAttribute('aria-hidden', 'false');
      LIGHTBOX.container.style.display = 'flex';
      // focus management
      try { LIGHTBOX.inner.focus(); } catch (e) {}
    }
  }

  function updateLightboxMeta() {
    if (!LIGHTBOX.meta) return;
    const meta = LIGHTBOX.metaList[LIGHTBOX.index] || {};
    const title = escapeHtml(meta.caption || meta.title || '');
    const date = meta.date ? escapeHtml(fmtDate(meta.date)) : '';
    LIGHTBOX.meta.innerHTML = `<div style="font-weight:700">${title}</div><div style="color:var(--muted);font-size:.9rem">${date}</div>`;
  }

  function closeLightbox() {
    if (!LIGHTBOX.container) return;
    LIGHTBOX.container.setAttribute('aria-hidden', 'true');
    try { LIGHTBOX.container.style.display = 'none'; } catch (e) {}
    if (LIGHTBOX.img) { LIGHTBOX.img.src = ''; LIGHTBOX.img.alt = ''; LIGHTBOX.img.style.display = ''; }
    LIGHTBOX.images = [];
    LIGHTBOX.metaList = [];
  }

  function prevLightbox() {
    if (!LIGHTBOX.images.length) return;
    LIGHTBOX.index = (LIGHTBOX.index - 1 + LIGHTBOX.images.length) % LIGHTBOX.images.length;
    LIGHTBOX.img.src = LIGHTBOX.images[LIGHTBOX.index];
    updateLightboxMeta();
  }

  function nextLightbox() {
    if (!LIGHTBOX.images.length) return;
    LIGHTBOX.index = (LIGHTBOX.index + 1) % LIGHTBOX.images.length;
    LIGHTBOX.img.src = LIGHTBOX.images[LIGHTBOX.index];
    updateLightboxMeta();
  }

  /* ======================
     MEMORIES (Roll Film)
     ====================== */

  function normalizeMemories(raw = []) {
    if (!Array.isArray(raw)) return [];
    return raw.map((m, idx) => {
      const photosRaw = Array.isArray(m.photos) ? m.photos : (typeof m.photos === 'string' ? safeJSON(m.photos, []) : []);
      const photos = photosRaw.map(p => {
        if (typeof p === 'string') return { public_id: p, secure_url: p };
        return { public_id: p.public_id || p.public_id_cloudinary, secure_url: p.secure_url || p.url || '' };
      });
      return {
        id: m.id || `mem-${idx}-${Date.now()}`,
        title: m.title || `Memory #${idx+1}`,
        date: m.date || m.created_at || '',
        description: m.description || m.excerpt || '',
        thumbnail: m.thumbnail_public_id || (photos[0] && (photos[0].secure_url || photos[0].public_id)) || '',
        photos,
        raw: m
      };
    });
  }

  function renderMemories() {
    const roll = $('.memories-roll');
    const viewport = $('#memories-viewport');
    if (!roll || !viewport) return;
    roll.innerHTML = '';
    STATE.memories.items.forEach(mem => {
      const art = document.createElement('article');
      art.className = 'memory-item';
      art.dataset.id = mem.id;
      art.dataset.photos = JSON.stringify(mem.photos.map(p => p.secure_url || p.public_id));
      art.dataset.title = mem.title;
      art.dataset.date = mem.date;
      const frame = document.createElement('div'); frame.className = 'film-frame';
      const thumbWrap = document.createElement('div'); thumbWrap.className = 'film-thumb';
      const img = document.createElement('img');
      img.alt = mem.title || 'thumbnail';
      img.loading = 'lazy';
      img.src = mem.thumbnail ? cloudinaryURL(mem.thumbnail, { w: 360, h: 240, crop: 'fill' }) : (mem.photos[0] ? cloudify(mem.photos[0], { w: 360, h: 240, crop: 'fill' }) : '/assets/thumb-placeholder.jpg');
      thumbWrap.appendChild(img);

      // indicator dots
      const indicator = document.createElement('div');
      indicator.className = 'thumb-indicator';
      mem.photos.forEach((p, i) => {
        const dot = document.createElement('div');
        dot.className = 'thumb-dot' + (i === 0 ? ' active' : '');
        indicator.appendChild(dot);
      });
      thumbWrap.appendChild(indicator);

      frame.appendChild(thumbWrap);
      art.appendChild(frame);

      const info = document.createElement('div'); info.className = 'memory-info';
      info.innerHTML = `<h3 class="memory-title">${escapeHtml(mem.title)}</h3>
                        <time class="memory-date">${escapeHtml(fmtDate(mem.date))}</time>
                        <p class="memory-excerpt">${escapeHtml(mem.description)}</p>`;
      art.appendChild(info);

      art.addEventListener('click', (e) => {
        openMemoryLightbox(mem);
      });

      roll.appendChild(art);
    });

    setupMemoriesObserver();
    setupAutoScrollControl();
  }

  function openMemoryLightbox(mem) {
    const imgs = (mem.photos || []).map(p => cloudify(p, { w:1600, dpr:'auto' }));
    const meta = (mem.photos || []).map(p => ({ caption: mem.title, date: mem.date }));
    openLightbox({ images: imgs, startIndex: 0, metaList: meta });
  }

  // IntersectionObserver for center detection
  function setupMemoriesObserver() {
    const roll = document.querySelector('.memories-roll');
    if (!roll) return;
    if (STATE.memories.io) STATE.memories.io.disconnect();

    const opts = { root: document.getElementById('memories-viewport') || null, rootMargin: '0px', threshold: buildThresholds() };
    STATE.memories.io = new IntersectionObserver((entries) => {
      // pick element with highest intersection ratio
      let best = null;
      entries.forEach(en => {
        if (!best || en.intersectionRatio > best.intersectionRatio) best = en;
      });
      if (!best) return;
      const el = best.target;
      // Remove is-center from others
      $$('.memory-item.is-center').forEach(e => { if (e !== el) { e.classList.remove('is-center'); stopMiniSlide(e); } });
      if (best.intersectionRatio > 0.25) {
        if (!el.classList.contains('is-center')) {
          el.classList.add('is-center');
          startMiniSlide(el);
        }
      } else {
        if (el.classList.contains('is-center')) {
          el.classList.remove('is-center');
          stopMiniSlide(el);
        }
      }
    }, opts);

    // observe each item
    Array.from(roll.querySelectorAll('.memory-item')).forEach(it => STATE.memories.io.observe(it));
  }

  function buildThresholds() {
    const t = [];
    for (let i=0;i<=1.0;i+=0.01) t.push(i);
    return t;
  }

  // mini slideshow: cycle photos for centered memory
  function startMiniSlide(el) {
    if (!el) return;
    const id = el.dataset.id;
    if (!id) return;
    if (STATE.memories.miniSlides.has(id)) return;
    const photos = safeJSON(el.dataset.photos, []);
    if (!photos || photos.length <= 1) return;
    const imgEl = el.querySelector('.film-thumb img');
    const dots = Array.from(el.querySelectorAll('.thumb-dot'));
    let idx = 0;
    const interval = 2200;
    const timer = setInterval(() => {
      idx = (idx + 1) % photos.length;
      const url = cloudify(photos[idx], { w: 360, h: 240, crop: 'fill' });
      if (imgEl) imgEl.src = url;
      dots.forEach((d,i) => d.classList.toggle('active', i === idx));
    }, interval);
    STATE.memories.miniSlides.set(id, { timer, idx });
  }

  function stopMiniSlide(el) {
    if (!el) return;
    const id = el.dataset.id;
    if (!id) return;
    const s = STATE.memories.miniSlides.get(id);
    if (s) {
      clearInterval(s.timer);
      STATE.memories.miniSlides.delete(id);
      // reset first photo
      const photos = safeJSON(el.dataset.photos, []);
      const imgEl = el.querySelector('.film-thumb img');
      if (imgEl && photos && photos[0]) imgEl.src = cloudify(photos[0], { w:360, h:240, crop:'fill' });
      el.querySelectorAll('.thumb-dot').forEach((d,i) => d.classList.toggle('active', i === 0));
    }
  }

  // Auto-scroll control
  function setupAutoScrollControl() {
    const btn = document.getElementById('mem-auto-toggle');
    const viewport = document.getElementById('memories-viewport');
    if (!btn || !viewport) return;
    // restore state
    const saved = localStorage.getItem('memAutoScroll') === 'true';
    btn.textContent = saved ? 'Pause Auto-Scroll' : 'Start Auto-Scroll';
    btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
    if (saved && !PREFERS_REDUCED_MOTION) startAutoScroll();

    btn.addEventListener('click', () => {
      if (STATE.memories.autoScrolling) {
        stopAutoScroll();
        btn.textContent = 'Start Auto-Scroll';
        btn.setAttribute('aria-pressed', 'false');
        localStorage.setItem('memAutoScroll', 'false');
      } else {
        if (!PREFERS_REDUCED_MOTION) startAutoScroll();
        btn.textContent = 'Pause Auto-Scroll';
        btn.setAttribute('aria-pressed', 'true');
        localStorage.setItem('memAutoScroll', 'true');
      }
    });

    // pause on user interaction
    ['wheel','touchstart','pointerdown'].forEach(ev => {
      viewport.addEventListener(ev, () => {
        if (STATE.memories.autoScrolling) {
          stopAutoScroll();
          btn.textContent = 'Start Auto-Scroll';
          btn.setAttribute('aria-pressed', 'false');
          localStorage.setItem('memAutoScroll', 'false');
        }
      }, { passive: true });
    });
  }

  function startAutoScroll() {
    if (PREFERS_REDUCED_MOTION) return;
    if (STATE.memories.autoScrolling) return;
    const viewport = document.getElementById('memories-viewport');
    if (!viewport) return;
    STATE.memories.autoScrolling = true;
    const step = () => {
      if (!STATE.memories.autoScrolling) return;
      // scroll up slowly; loop back to bottom when reach top
      const max = viewport.scrollHeight - viewport.clientHeight;
      let pos = viewport.scrollTop;
      pos -= STATE.memories.autoScrollSpeed;
      if (pos <= 0) pos = max || 0;
      viewport.scrollTop = pos;
      STATE.memories.autoScrollRAF = requestAnimationFrame(step);
    };
    STATE.memories.autoScrollRAF = requestAnimationFrame(step);
  }

  function stopAutoScroll() {
    STATE.memories.autoScrolling = false;
    if (STATE.memories.autoScrollRAF) {
      cancelAnimationFrame(STATE.memories.autoScrollRAF);
      STATE.memories.autoScrollRAF = null;
    }
  }

  /* ======================
     PLUGIN SLOT (iframe)
     ====================== */

  function initPluginSlot() {
    const slot = $('#plugin-slot');
    if (!slot) return;
    // if admin toggled plugin via data attributes, mount
    const enabled = slot.getAttribute('data-enabled') === 'true';
    const url = slot.getAttribute('data-plugin-url') || '';
    if (enabled && url) mountPlugin(url);
  }

  let PLUGIN_IFRAME = null;
  function mountPlugin(url) {
    const slot = $('#plugin-slot');
    if (!slot) return;
    unmountPlugin();
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.width = '100%';
    iframe.height = '560';
    iframe.frameBorder = '0';
    iframe.loading = 'lazy';
    iframe.style.border = '0';
    iframe.style.borderRadius = '12px';
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
    slot.innerHTML = '';
    slot.appendChild(iframe);
    slot.setAttribute('aria-hidden', 'false');
    PLUGIN_IFRAME = iframe;
  }

  function unmountPlugin() {
    const slot = $('#plugin-slot');
    if (!slot) return;
    slot.innerHTML = `<div class="plugin-placeholder"><div class="plugin-note">Plugin belum aktif</div></div>`;
    slot.setAttribute('aria-hidden', 'true');
    PLUGIN_IFRAME = null;
  }

  /* ======================
     EVENT: nearest + countdown
     ====================== */

  function renderEventNearest(list = []) {
    if (!Array.isArray(list) || !list.length) {
      // hide or set empty
      $('#event-box')?.setAttribute('data-has-event', 'false');
      $('#event-title').textContent = 'Tidak ada event';
      $('#event-datetime').textContent = '';
      $('#event-desc').textContent = '';
      return;
    }
    // convert and find nearest future
    const now = new Date();
    const future = list.map(e => ({ ...e, start: new Date(e.start_datetime || e.start || e.date || null) }))
      .filter(e => e.start instanceof Date && !Number.isNaN(e.start.getTime()) && e.start > now)
      .sort((a,b) => a.start - b.start);
    const nearest = future.length ? future[0] : null;
    if (!nearest) {
      $('#event-box')?.setAttribute('data-has-event', 'false');
      $('#event-title').textContent = 'Tidak ada event';
      $('#event-datetime').textContent = '';
      $('#event-desc').textContent = '';
      return;
    }
    $('#event-box')?.setAttribute('data-has-event', 'true');
    $('#event-title').textContent = nearest.title || 'Event';
    $('#event-datetime').textContent = fmtDate(nearest.start);
    $('#event-desc').textContent = nearest.description || '';
    startEventCountdown(nearest.start);
  }

  let EVENT_TIMER = null;
  function startEventCountdown(targetDate) {
    if (EVENT_TIMER) { clearInterval(EVENT_TIMER); EVENT_TIMER = null; }
    const target = new Date(targetDate);
    if (Number.isNaN(target.getTime())) return;
    const elDays = $('#cd-days'), elHours = $('#cd-hours'), elMins = $('#cd-mins'), elSecs = $('#cd-secs');
    function tick() {
      const now = new Date();
      let diff = Math.max(0, Math.floor((target - now)/1000));
      if (diff <= 0) {
        // hide event
        $('#event-box')?.setAttribute('data-has-event', 'false');
        clearInterval(EVENT_TIMER); EVENT_TIMER = null;
        return;
      }
      const days = Math.floor(diff / 86400); diff -= days * 86400;
      const hours = Math.floor(diff / 3600); diff -= hours * 3600;
      const mins = Math.floor(diff / 60); diff -= mins * 60;
      const secs = diff;
      if (elDays) elDays.textContent = String(days).padStart(2,'0');
      if (elHours) elHours.textContent = String(hours).padStart(2,'0');
      if (elMins) elMins.textContent = String(mins).padStart(2,'0');
      if (elSecs) elSecs.textContent = String(secs).padStart(2,'0');
    }
    tick();
    EVENT_TIMER = setInterval(tick, 1000);
  }

  /* ======================
     MISC: MESSAGES
     ====================== */

  function renderMessages(items = []) {
    const list = $('#messages-list');
    if (!list) return;
    list.innerHTML = '';
    items.forEach(it => {
      const art = document.createElement('article');
      art.className = 'message-card';
      art.dataset.id = it.id || '';
      art.innerHTML = `<header><h3 class="msg-title">${escapeHtml(it.title || 'Pesan')}</h3>
                       <div class="msg-author" style="opacity:0">${escapeHtml(it.author_name || '')}</div></header>
                       <div class="msg-body">${escapeHtml((it.content || it.body || '').slice(0,240))}</div>`;
      art.addEventListener('click', () => openMessageDetail(it));
      list.appendChild(art);
    });
  }

  function openMessageDetail(it) {
    // reuse lightbox modal for message detail
    openLightbox({ images: [], startIndex: 0, metaList: [] });
    const meta = $('#lightbox-meta');
    if (meta) {
      meta.innerHTML = `<div style="font-weight:700;margin-bottom:8px">${escapeHtml(it.title || '')}</div>
                        <div style="color:var(--muted);margin-bottom:12px">${escapeHtml(it.author_name || '')}</div>
                        <div>${escapeHtml(it.content || it.body || '')}</div>`;
    }
    if (LIGHTBOX.img) LIGHTBOX.img.style.display = 'none';
  }

  /* ======================
     HEADER / NAV behavior (floating follow)
     ====================== */

  function initHeaderBehavior() {
    const header = document.getElementById('site-header');
    if (!header) return;
    const nav = document.getElementById('floating-nav');
    if (!nav) return;
    // Make nav follow screen: when user scrolls, nav stays near top center or top-left compact
    window.addEventListener('scroll', () => {
      const y = window.scrollY || window.pageYOffset;
      if (y > 80) {
        header.classList.add('header--compact');
        nav.style.left = '16px';
        nav.style.top = '12px';
        nav.style.transform = 'none';
      } else {
        header.classList.remove('header--compact');
        nav.style.left = '50%';
        nav.style.top = '18px';
        nav.style.transform = 'translateX(-50%)';
      }
    }, { passive: true });

    // initial state
    const ev = new Event('scroll'); window.dispatchEvent(ev);
  }

  function initFloatingNavClicks() {
    const nav = document.getElementById('floating-nav');
    if (!nav) return;
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-btn');
      if (!btn) return;
      const target = btn.getAttribute('data-target');
      if (target) scrollTo(target);
    });
  }

  function scrollTo(selector) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ======================
     FOOTER YEAR
     ====================== */

  function initFooterYear() {
    const el = document.getElementById('footer-year');
    if (el) el.textContent = new Date().getFullYear();
  }

  /* ======================
     SITE MOTTO POINTER GLOW
     ====================== */

  function initMottoPointer() {
    const motto = document.querySelector('.motto-inner');
    if (!motto || PREFERS_REDUCED_MOTION) return;
    // use CSS variables to place glow; update on pointermove
    motto.addEventListener('pointermove', (e) => {
      const r = motto.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      motto.style.setProperty('--pointer-x', `${x}px`);
      motto.style.setProperty('--pointer-y', `${y}px`);
    });
    motto.addEventListener('pointerleave', () => {
      motto.style.removeProperty('--pointer-x');
      motto.style.removeProperty('--pointer-y');
    });
  }

  /* ======================
     HELPERS: cloudify
     ====================== */

  function cloudify(p, opts = {}) {
    if (!p) return '';
    if (typeof p === 'string') {
      if (/^https?:\/\//.test(p)) return p;
      return cloudinaryURL(p, opts);
    }
    if (p.secure_url && /^https?:\/\//.test(p.secure_url)) return p.secure_url;
    if (p.public_id) return cloudinaryURL(p.public_id, opts);
    return '';
  }

  /* ======================
     DEMO DATA (fallback)
     ====================== */

  function demoData() {
    const photos = [];
    for (let i=0;i<24;i++) {
      photos.push({
        id: `demo-${i+1}`,
        caption: `Foto Kenangan ${i+1}`,
        public_id: '',
        secure_url: `https://picsum.photos/seed/kelas-${i+1}/1200/800`,
        tags: (i%2===0) ? ['ospek','kelas'] : ['kegiatan'],
        date_taken: new Date(Date.now() - (i*86400000)).toISOString()
      });
    }
    const memories = [
      { id: 'mem-1', title: 'Ospek 2024', date: '2024-09-02', description: 'Orientasi siswa baru', photos: photos.slice(0,6).map(p => p.secure_url) },
      { id: 'mem-2', title: 'Kunjungan Industri', date: '2024-11-10', description: 'Pembelajaran lapangan', photos: photos.slice(6,12).map(p => p.secure_url) },
      { id: 'mem-3', title: 'Pentas Seni', date: '2025-03-20', description: 'Pertunjukan seni', photos: photos.slice(12,20).map(p => p.secure_url) }
    ];
    const events = [{ id: 'e1', title: 'Ujian Modul 1', start: new Date(Date.now() + 7*86400000).toISOString(), description: 'Ujian materi Revit dasar' }];
    const messages = [
      { id: 'msg1', title: 'Pesan Wali Kelas', author_name: 'Wali Kelas', content: 'Tetap semangat dan jaga kesehatan.'}
    ];
    const profiles = [
      { id: 'p1', name: 'Ketua Kelas', role: 'Ketua', jumlah_siswa: 36, social: { instagram: '#' } },
      { id: 'p2', name: 'Wakil Ketua', role: 'Wakil Ketua', social: { instagram: '#' } },
      { id: 'p3', name: 'Wali Kelas', role: 'Wali Kelas', social: { instagram: '#' } },
      { id: 'p4', name: 'Asal Sekolah', role: 'Asal Sekolah', name: 'SMKN 1 KOTA KEDIRI' }
    ];
    const siteConfig = { site_title:'Kelas 11 DPIB 2 — SMKN 1 KOTA KEDIRI', motto_text:'Kenangan Kita, Selamanya', footer_text:'© {{year}} Kelas 11 DPIB 2 — SMKN 1 KOTA KEDIRI' };
    return { photos, memories, events, messages, profiles, siteConfig };
  }

  /* ======================
     NAV / UTILITY
     ====================== */

  // Simple debounce
  function debounce(fn, wait=100) {
    let t = null;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(this,args), wait); };
  }

  /* ======================
     STARTUP: ensure STATE gallery filtered & render
     ====================== */

  // Initialize gallery filtered and render
  function renderGalleryPage() {
    // if tag filter not filled, fill initial
    if (!STATE.gallery.filtered || !STATE.gallery.filtered.length) STATE.gallery.filtered = STATE.gallery.items.slice();
    // apply current search and tag filter
    applyGalleryFilterAndRender();
  }

  function applyGalleryFilterAndRender() {
    // apply search + tags then render page
    const q = ($('#gallery-search')?.value || '').trim().toLowerCase();
    const selTags = Array.from(STATE.gallery.selectedTags || []);
    const source = STATE.gallery.items.slice();
    STATE.gallery.filtered = source.filter(it => {
      const matchesQ = !q || (it.caption && it.caption.toLowerCase().includes(q)) || (it.tags || []).some(t => t.toLowerCase().includes(q));
      const matchesTags = !selTags.length || (it.tags || []).some(t => selTags.includes(t));
      return matchesQ && matchesTags;
    });
    STATE.gallery.page = clamp(STATE.gallery.page, 1, Math.max(1, Math.ceil(STATE.gallery.filtered.length / STATE.gallery.perPage)));
    renderGalleryPageDOM();
  }

  function renderGalleryPageDOM() {
    // Reuse renderGalleryPage setup logic: but avoid recursion
    const container = $('#gallery-masonry');
    if (!container) return;
    const per = STATE.gallery.perPage || 12;
    const items = STATE.gallery.filtered;
    const total = items.length;
    STATE.gallery.totalPages = Math.max(1, Math.ceil(total / per));
    const start = (STATE.gallery.page - 1) * per;
    const pageItems = items.slice(start, start + per);
    const elems = pageItems.map(it => {
      const fig = document.createElement('figure');
      fig.className = 'masonry-item';
      fig.tabIndex = 0;
      fig.dataset.id = it.id;
      fig.dataset.tags = JSON.stringify(it.tags || []);
      const img = document.createElement('img');
      img.className = 'masonry-img';
      img.alt = it.caption || '';
      img.loading = 'lazy';
      const src = cloudify(it.public_id || it.secure_url || it.raw?.public_id || it.raw?.secure_url, { w:900, dpr:'auto' }) || (it.secure_url || '');
      img.dataset.src = src;
      img.src = '/assets/thumb-placeholder.jpg';
      fig.appendChild(img);
      if (it.caption) {
        const cap = document.createElement('figcaption');
        cap.className = 'masonry-caption';
        cap.textContent = it.caption;
        fig.appendChild(cap);
      }
      fig.addEventListener('click', () => openLightboxFromGalleryItem(it, STATE.gallery.filtered));
      return fig;
    });

    // layout masonry
    const colsContainer = container;
    layoutMasonry(colsContainer, elems);
    setupImageLazyLoad(colsContainer);
    const info = $('#gallery-pageinfo'); if (info) info.textContent = `Page ${STATE.gallery.page} / ${STATE.gallery.totalPages}`;
  }

  /* ======================
     IMAGE LAZY-LOAD for general usage
     ====================== */

  function setupImageLazyLoad(root) {
    const imgs = Array.from((root || document).querySelectorAll('img[data-src]'));
    if (!imgs.length) return;
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          const img = en.target;
          const src = img.dataset.src;
          if (src) img.src = src;
          obs.unobserve(img);
        }
      });
    }, { rootMargin: '300px 0px', threshold: 0.01 });
    imgs.forEach(i => io.observe(i));
  }

  /* ======================
     HELPER: openTagFilter UI from external call
     ====================== */
  function openTagFilterPopup() {
    // build if not exists
    ensureTagFilterPopup();
  }
  // expose to global so UI button can call if needed
  window.openTagFilterPopup = openTagFilterPopup;

  /* ======================
     NETWORK / FILE 404 handling helper
     ====================== */

  // quick check whether a resource exists — use fetch HEAD (works for same-origin and CORS allowed)
  async function resourceExists(url) {
    try {
      const r = await fetch(url, { method: 'HEAD' });
      return r.ok;
    } catch (e) {
      return false;
    }
  }

  /* ======================
     PUBLIC EXPOSURES (for debug / test)
     ====================== */

  window.__KELAS_DEBUG__ = {
    state: STATE,
    config: CONFIG,
    cloudify,
    openLightbox,
    renderGalleryPageDOM,
    applyGalleryFilterAndRender
  };

  /* ======================
     FINAL small helpers & ensure tag popup created
     ====================== */

  function ensureTagFilterPopup() {
    if ($('#tag-filter-popup')) { renderTagFilterCheckboxes(); $('#tag-filter-popup').style.display = 'block'; return $('#tag-filter-popup'); }
    const popup = document.createElement('div');
    popup.id = 'tag-filter-popup';
    popup.className = 'tag-filter-popup glass';
    popup.style.position = 'fixed';
    popup.style.left = '50%';
    popup.style.top = '50%';
    popup.style.transform = 'translate(-50%,-50%)';
    popup.style.zIndex = '2200';
    popup.style.padding = '18px';
    popup.style.maxWidth = '520px';
    popup.style.width = '92%';
    popup.style.display = 'block';
    popup.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <strong>Pilih Tag</strong>
        <button id="tag-filter-close" class="btn secondary">Tutup</button>
      </div>
      <div id="tag-filter-list" style="max-height:340px;overflow:auto;display:flex;flex-direction:column;gap:8px;padding-right:6px"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button id="tag-filter-clear" class="btn secondary">Bersihkan</button>
        <button id="tag-filter-apply" class="btn primary">Terapkan</button>
      </div>
    `;
    document.body.appendChild(popup);
    $('#tag-filter-close').addEventListener('click', () => popup.style.display = 'none');
    $('#tag-filter-clear').addEventListener('click', () => { STATE.gallery.selectedTags.clear(); renderTagFilterCheckboxes(); });
    $('#tag-filter-apply').addEventListener('click', () => { applyGalleryFilterAndRender(); popup.style.display = 'none'; });
    renderTagFilterCheckboxes();
    return popup;
  }

  function renderTagFilterCheckboxes() {
    const list = $('#tag-filter-list');
    if (!list) return;
    list.innerHTML = '';
    const tags = STATE.gallery.tagList || [];
    if (!tags.length) {
      list.innerHTML = '<div style="color:var(--muted)">Tidak ada tag</div>';
      return;
    }
    tags.forEach(tag => {
      const id = `tag_${tag.replace(/\W+/g,'_')}`;
      const row = document.createElement('label');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.cursor = 'pointer';
      row.innerHTML = `<input type="checkbox" id="${id}" data-tag="${escapeHtml(tag)}"> <span>${escapeHtml(tag)}</span>`;
      const cb = row.querySelector('input[type="checkbox"]');
      cb.checked = STATE.gallery.selectedTags.has(tag);
      cb.addEventListener('change', (e) => {
        if (e.target.checked) STATE.gallery.selectedTags.add(tag);
        else STATE.gallery.selectedTags.delete(tag);
      });
      list.appendChild(row);
    });
  }

  /* ======================
     END OF SCRIPT
     ====================== */

})();
