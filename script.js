import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.38.0/+esm'

const supabase = createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_ANON_KEY)
const $ = (sel) => document.querySelector(sel)
const $$ = (sel) => document.querySelectorAll(sel)

// GLOBAL STATE
let allPhotos = []
let allMemories = []
let allEvents = []
let allGuestbook = []
let allStudents = []
let allTags = []
let selectedTags = []
let itemsPerPage = 16
let currentPage = 1
let studentClickCount = 0

// Helper to robustly get a student's name from possible field variations
function getStudentName(student) {
  if(!student) return ''
  // common variations used in different imports/locales
  const candidates = [
    'name', 'nama', 'full_name', 'student_name', 'first_name', 'fullname'
  ]
  for(const key of candidates) {
    if(Object.prototype.hasOwnProperty.call(student, key)) {
      const v = student[key]
      if(typeof v === 'string' && v.trim() !== '') return v.trim()
    }
  }
  // fallback: try to infer from other fields
  if(student.first_name || student.last_name) return ((student.first_name || '') + ' ' + (student.last_name || '')).trim()
  return ''
}
// ============================================
// THEME SYSTEM
// ============================================
function setTheme(themeName) {
  document.body.className = 'theme-' + themeName
  localStorage.setItem('theme', themeName)
  
  // Update active button
  $$('.theme-btn').forEach(btn => {
    btn.classList.remove('active')
    if(btn.dataset.theme === themeName) btn.classList.add('active')
  })
}
// Initialize theme toggle UI and delegated button handling
function initThemeUI() {
  const toggle = $('#themeToggle')
  const panel = $('#themePanel')

  if(toggle && panel) {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation()
      const open = panel.classList.toggle('open')
      panel.setAttribute('aria-hidden', open ? 'false' : 'true')
    })

    // Delegate clicks inside panel to theme buttons
    panel.addEventListener('click', (e) => {
      const btn = e.target.closest('.theme-btn')
      if(!btn) return
      const theme = btn.dataset.theme
      if(theme) setTheme(theme)
      panel.classList.remove('open')
      panel.setAttribute('aria-hidden', 'true')
    })

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
      if(!panel.classList.contains('open')) return
      if(e.target === toggle || panel.contains(e.target)) return
      panel.classList.remove('open')
      panel.setAttribute('aria-hidden', 'true')
    })

    // Close on scroll or resize for safety
    window.addEventListener('scroll', () => {
      if(panel.classList.contains('open')) {
        panel.classList.remove('open')
        panel.setAttribute('aria-hidden', 'true')
      }
    })
    window.addEventListener('resize', () => {
      if(panel.classList.contains('open')) {
        panel.classList.remove('open')
        panel.setAttribute('aria-hidden', 'true')
      }
    })
  }

  // Ensure the saved theme button shows active state
  const saved = localStorage.getItem('theme') || 'dark'
  setTheme(saved)
}

// Initialize theme UI now
initThemeUI()

// ============================================
// SECRET STUDENTS SECTION (Click counter)
// ============================================
let studentClickCounter = 0
const REVEAL_CLICKS = 27

function revealStudentsSection() {
  const studentsSection = $('#students')
  if(studentsSection) {
    studentsSection.style.display = 'block'
    console.log('🔓 Reveal called - allStudents:', allStudents)
    // Delay render sedikit untuk ensure data loaded
    setTimeout(() => {
      console.log('⏰ Delayed render - allStudents:', allStudents)
      renderStudents()
    }, 100)
  }
}

function renderStudents() {
  const tbody = $('#studentsList')
  if(!tbody) return
  console.log('🎯 renderStudents called - allStudents:', allStudents)
  console.log('renderStudents - allStudents sample:', allStudents && allStudents.slice(0,5))
  tbody.innerHTML = ''

  if(!allStudents || allStudents.length === 0) {
    console.warn('⚠️ No students data found')
    tbody.innerHTML = `<tr><td colspan="6" style="padding: 2rem; text-align: center; color: var(--text-secondary);">Belum ada data siswa</td></tr>`
    return
  }

  console.log('📊 Rendering', allStudents.length, 'students')
  allStudents.forEach((student, idx) => {
    console.log(`Student #${idx}:`, student)
    console.log(`  - Keys in object: ${Object.keys(student).join(', ')}`)
    console.log(`  - student.name = "${student.name}"`)
    console.log(`  - student['name'] = "${student['name']}"`)
    console.log(`  - JSON: ${JSON.stringify(student)}`)

    const tr = document.createElement('tr')
    tr.style.borderBottom = '1px solid var(--border-light)'

    const nameValue = getStudentName(student) || 'Tidak Ada Nama'

    tr.innerHTML = `
      <td style="padding: 1rem;">${student.student_number || '-'}</td>
      <td style="padding: 1rem;">${nameValue}</td>
      <td style="padding: 1rem;">${student.email || '-'}</td>
      <td style="padding: 1rem;">${student.phone || '-'}</td>
      <td style="padding: 1rem;">${student.instagram ? '@' + student.instagram : '-'}</td>
      <td style="padding: 1rem;">${student.address || '-'}</td>
    `
    tr.style.cursor = 'pointer'
    tr.addEventListener('click', () => openStudentDetail(student))
    tbody.appendChild(tr)
  })
}

function openStudentDetail(student) {
  const modal = $('#modal-student-detail')
  if(!modal) return
  $('#detail-name').textContent = getStudentName(student) || 'Nama tidak tersedia'
  $('#detail-number').textContent = student.student_number ? 'No. ' + student.student_number : ''
  $('#detail-email').innerHTML = student.email ? `📧 <a href="mailto:${student.email}">${student.email}</a>` : ''
  $('#detail-phone').textContent = student.phone ? '📞 ' + student.phone : ''
  $('#detail-instagram').innerHTML = student.instagram ? `📱 <a href="https://instagram.com/${student.instagram}" target="_blank">@${student.instagram}</a>` : ''
  $('#detail-address').textContent = student.address || ''
  modal.style.display = 'block'
}

// Close modal when clicking close or outside content
document.addEventListener('click', (e) => {
  const modal = $('#modal-student-detail')
  if(!modal) return
  if(e.target.id === 'detail-close' || e.target === modal) {
    modal.style.display = 'none'
  }
})

// ============================================
// NAVBAR SCROLL EFFECT
// ============================================
// Position nav initially under the hero and keep floating island on scroll
function positionNavUnderHero() {
  const nav = $('nav')
  const hero = $('#hero')
  if(!nav || !hero) return

  const rect = hero.getBoundingClientRect()
  const top = rect.bottom + window.scrollY + 12
  // only set inline styles when not scrolled
  if(!nav.classList.contains('scrolled')) {
    nav.style.position = 'absolute'
    nav.style.top = top + 'px'
    nav.style.left = '50%'
    nav.style.transform = 'translateX(-50%)'
    nav.style.width = 'fit-content'
  }
}

window.addEventListener('scroll', () => {
  const nav = $('nav')
  const hero = $('#hero')
  if(!nav || !hero) return

  const heroBottom = hero.getBoundingClientRect().bottom
  // when we scroll past the hero, add scrolled class (keep centered floating island)
  if(window.scrollY + 12 > heroBottom) {
    nav.classList.add('scrolled')
    // ensure center position
    nav.style.left = '50%'
    nav.style.transform = 'translateX(-50%)'
  } else {
    nav.classList.remove('scrolled')
    positionNavUnderHero()
  }
})

window.addEventListener('resize', () => positionNavUnderHero())
document.addEventListener('DOMContentLoaded', () => positionNavUnderHero())

// ============================================
// LOAD DATA
// ============================================
async function loadAllData() {
  try {
    // Load class profile
    const { data: classData } = await supabase.from('class_profile').select('*').eq('id', 1).single()
    if(classData) renderClassProfile(classData)

    // Load site config
    const { data: configData } = await supabase.from('site_config').select('*').eq('id', 1).single()
    if(configData) {
      document.title = configData.hero_title + ' - Digital Kenangan'
      const h1 = document.querySelector('#hero h1')
      const p = document.querySelector('#hero > p:first-of-type')
      const motto = document.querySelector('.motto')
      if(h1) h1.textContent = configData.hero_title
      if(p) p.textContent = configData.hero_subtitle
      if(motto) motto.textContent = '💫 ' + configData.hero_motto + ' 💫'
      if(configData.footer_text) $('#footerText').textContent = configData.footer_text
      
      // Social links
      const socialLinksHtml = []
      if(configData.instagram_url) socialLinksHtml.push(`<a href="${configData.instagram_url}" target="_blank" title="Instagram"><i data-feather="instagram"></i></a>`)
      if(configData.youtube_url) socialLinksHtml.push(`<a href="${configData.youtube_url}" target="_blank" title="YouTube"><i data-feather="youtube"></i></a>`)
      if(configData.tiktok_url) socialLinksHtml.push(`<a href="${configData.tiktok_url}" target="_blank" title="TikTok"><i data-feather="music"></i></a>`)
      if(configData.whatsapp_url) socialLinksHtml.push(`<a href="${configData.whatsapp_url}" target="_blank" title="WhatsApp"><i data-feather="phone"></i></a>`)
      const socialLinks = $('#socialLinks')
      if(socialLinks) socialLinks.innerHTML = socialLinksHtml.join('')
    }

    // Load tags
    const { data: tagsData } = await supabase.from('tags').select('*').order('name')
    allTags = tagsData || []
    renderTagFilter()

    // Load gallery
    const { data: photosData } = await supabase.from('gallery').select('*, gallery_tags(tags(*))').eq('status', 'public').order('created_at', { ascending: false })
    allPhotos = photosData || []
    currentPage = 1
    renderGallery()

    // Load memories
    const { data: memoriesData } = await supabase.from('memories').select('*, memory_photos(*, gallery(*))').order('position')
    allMemories = memoriesData || []
    renderMemories()

    // Load events
    const { data: eventsData } = await supabase.from('events').select('*').order('event_date')
    allEvents = eventsData || []
    renderNextEvent()

    // Load guestbook (removed is_approved filter - show all)
    const { data: guestbookData } = await supabase.from('guestbook').select('*').order('created_at', { ascending: false })
    allGuestbook = guestbookData || []
    renderGuestbook()

    // Load students (public can now read)
    try {
      const { data: studentsData, error: studentsError } = await supabase.from('students').select('*').order('student_number')
      console.log('📚 Students loaded:', { data: studentsData, error: studentsError })
      if(studentsError) throw studentsError
      allStudents = studentsData || []
      console.log('✅ allStudents set to:', allStudents)
    } catch(err) {
      // Students table may not exist yet
      console.log('Students not available yet')
    }

    feather.replace()

    // REALTIME: Subscribe to site_config changes
    supabase.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'site_config'
    }, (payload) => {
      if (payload.new) {
        const configData = payload.new
        const h1 = document.querySelector('#hero h1')
        const p = document.querySelector('#hero > p:first-of-type')
        const motto = document.querySelector('.motto')
        if(h1) h1.textContent = configData.hero_title
        if(p) p.textContent = configData.hero_subtitle
        if(motto) motto.textContent = '💫 ' + configData.hero_motto + ' 💫'
        document.title = configData.hero_title + ' - Digital Kenangan'
        if(configData.footer_text) $('#footerText').textContent = configData.footer_text
      }
    }).subscribe()
  } catch(err) {
    console.error('Load error:', err)
  }
}

// ============================================
// CLASS PROFILE
// ============================================
function renderClassProfile(profile) {
  const grid = $('#profileGrid')
  if(!grid) return
  
  grid.innerHTML = ''

  const roles = [
    { key: 'ketua', label: 'Ketua Kelas' },
    { key: 'wakil', label: 'Wakil Ketua' },
    { key: 'wali', label: 'Wali Kelas' }
  ]

  roles.forEach(role => {
    const name = profile[role.key + '_name']
    const photo = profile[role.key + '_photo_url']
    const instagram = profile[role.key + '_instagram']

    if(name) {
      const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
      const card = document.createElement('div')
      card.className = 'profile-card'
      card.innerHTML = `
        ${photo ? `<img src="${photo}" alt="${name}" class="profile-photo">` : `<div class="profile-placeholder">${initials}</div>`}
        <h3>${name}</h3>
        <p>${role.label}</p>
        ${instagram ? `<a href="${instagram}" target="_blank" style="color: var(--primary); text-decoration: none; font-size: 0.9rem;">👤 ${instagram}</a>` : ''}
      `
      grid.appendChild(card)
    }
  })

  const studentCountEl = $('#studentCountNumber')
  if(studentCountEl) studentCountEl.textContent = profile.total_students || 0
}

// Student count easter egg
const studentCount = $('#studentCount')
if(studentCount) {
  studentCount.addEventListener('click', () => {
    studentClickCount++
    if(studentClickCount === 27) {
      const studentDir = $('#studentDir')
      if(studentDir) {
        studentDir.classList.add('active')
        studentDir.scrollIntoView({ behavior: 'smooth' })
        renderStudentDirectory()
      }
      studentClickCount = 0
    } else if(studentClickCount > 27) {
      studentClickCount = 0
    }
  })
}

// ============================================
// GALLERY - MASONRY + PAGINATION
// ============================================
function renderTagFilter() {
  const tagList = $('#tagList')
  if(!tagList) return
  
  tagList.innerHTML = ''

  allTags.forEach(tag => {
    const id = `tag-${tag.id}`
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.id = id
    checkbox.className = 'tag-checkbox'
    checkbox.dataset.tagId = tag.id
    checkbox.value = tag.name

    const label = document.createElement('label')
    label.htmlFor = id
    label.className = 'tag-label'
    label.textContent = tag.name
    label.style.backgroundColor = tag.color + '40'
    label.style.borderColor = tag.color

    const wrapper = document.createElement('div')
    wrapper.style.display = 'flex'
    wrapper.appendChild(checkbox)
    wrapper.appendChild(label)

    tagList.appendChild(wrapper)
  })
}

function getFilteredPhotos() {
  if(selectedTags.length === 0) return allPhotos

  return allPhotos.filter(photo => {
    return photo.gallery_tags.some(gt => selectedTags.includes(gt.tag_id))
  })
}

function renderGallery() {
  const filtered = getFilteredPhotos()
  const start = (currentPage - 1) * itemsPerPage
  const end = start + itemsPerPage
  const pagePhotos = filtered.slice(start, end)

  const gallery = $('#galleryGrid')
  if(!gallery) return
  
  gallery.innerHTML = ''

  pagePhotos.forEach(photo => {
    const item = document.createElement('div')
    item.className = 'gallery-item'
    item.innerHTML = `<img src="${photo.image_url}" alt="${photo.title}" loading="lazy" style="width: 100%; height: auto; border-radius: 12px;">`
    
    item.addEventListener('click', () => {
      const lightboxImg = $('#lightboxImg')
      const lightbox = $('#lightbox')
      if(lightboxImg && lightbox) {
        lightboxImg.src = photo.image_url
        lightboxImg.alt = photo.title
        lightbox.classList.add('active')
      }
    })

    gallery.appendChild(item)
  })

  renderPagination(filtered)
}

function renderPagination(filtered) {
  const totalPages = Math.ceil(filtered.length / itemsPerPage)
  const pagination = $('#pagination')
  if(!pagination) return
  
  pagination.innerHTML = ''

  for(let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('button')
    btn.textContent = i
    btn.className = i === currentPage ? 'active' : ''
    btn.addEventListener('click', () => {
      currentPage = i
      renderGallery()
      const galeriSection = document.querySelector('#galeri')
      if(galeriSection) galeriSection.scrollIntoView({ behavior: 'smooth' })
    })
    pagination.appendChild(btn)
  }
}

// Filter popup
const filterBtn = $('#filterBtn')
if(filterBtn) {
  filterBtn.addEventListener('click', () => {
    const filterPopup = $('#filterPopup')
    if(filterPopup) filterPopup.classList.add('active')
  })
}

const closeFilter = $('#closeFilter')
if(closeFilter) {
  closeFilter.addEventListener('click', () => {
    const filterPopup = $('#filterPopup')
    if(filterPopup) filterPopup.classList.remove('active')
  })
}

const applyFilter = $('#applyFilter')
if(applyFilter) {
  applyFilter.addEventListener('click', () => {
    selectedTags = Array.from($$('.tag-checkbox:checked')).map(el => parseInt(el.dataset.tagId))
    const itemsPerPageSelect = $('#itemsPerPage')
    if(itemsPerPageSelect) itemsPerPage = parseInt(itemsPerPageSelect.value)
    currentPage = 1
    renderGallery()
    const filterPopup = $('#filterPopup')
    if(filterPopup) filterPopup.classList.remove('active')
  })
}

const filterPopup = $('#filterPopup')
if(filterPopup) {
  filterPopup.addEventListener('click', (e) => {
    if(e.target === filterPopup) {
      filterPopup.classList.remove('active')
    }
  })
}

// Lightbox
const lightboxClose = $('#lightboxClose')
if(lightboxClose) {
  lightboxClose.addEventListener('click', () => {
    const lightbox = $('#lightbox')
    if(lightbox) lightbox.classList.remove('active')
  })
}

const lightbox = $('#lightbox')
if(lightbox) {
  lightbox.addEventListener('click', (e) => {
    if(e.target === lightbox) {
      lightbox.classList.remove('active')
    }
  })
}

// ============================================
// MEMORIES
// ============================================
function renderMemories() {
  const container = $('#memoriesContainer')
  if(!container) return
  
  container.innerHTML = ''

  // Create scrollable timeline container
  const scrollContainer = document.createElement('div')
  scrollContainer.className = 'memories-timeline-container'
  scrollContainer.id = 'memoriesTimeline'

  const timelineLine = document.createElement('div')
  timelineLine.className = 'timeline-line'
  scrollContainer.appendChild(timelineLine)

  // Sort memories by date (newest first)
  const sorted = [...allMemories].sort((a, b) => new Date(b.memory_date) - new Date(a.memory_date))

  // Track current center item for auto-scroll animation
  let autoScrollInterval = null
  let isManualScroll = false

  sorted.forEach((memory, idx) => {
    const photos = memory.memory_photos || []
    const photoUrls = photos.map(mp => mp.gallery?.image_url).filter(Boolean)
    if(photoUrls.length === 0) return

    const item = document.createElement('div')
    item.className = 'timeline-item'
    item.dataset.index = idx

    // Film frame with animated photos
    const frame = document.createElement('div')
    frame.className = 'film-frame'
    let photoIdx = 0
    const img = document.createElement('img')
    img.src = photoUrls[0]
    img.alt = memory.title
    frame.appendChild(img)

    // Rotate photos automatically
    let photoInterval = setInterval(() => {
      photoIdx = (photoIdx + 1) % photoUrls.length
      img.src = photoUrls[photoIdx]
    }, 3000)

    // Faster rotation for center item
    item.addEventListener('mouseenter', () => {
      if(item.classList.contains('center')) {
        clearInterval(photoInterval)
        photoIdx = 0
        photoInterval = setInterval(() => {
          photoIdx = (photoIdx + 1) % photoUrls.length
          img.src = photoUrls[photoIdx]
        }, 1500)
      }
    })

    item.addEventListener('mouseleave', () => {
      clearInterval(photoInterval)
      photoIdx = 0
      photoInterval = setInterval(() => {
        photoIdx = (photoIdx + 1) % photoUrls.length
        img.src = photoUrls[photoIdx]
      }, 3000)
    })

    // Info section
    const info = document.createElement('div')
    info.className = 'timeline-info'
    info.innerHTML = `
      <h3>${memory.title}</h3>
      <small>${new Date(memory.memory_date).toLocaleDateString('id-ID')}</small>
    `

    item.appendChild(frame)
    item.appendChild(info)

    // Click to open detail modal
    item.addEventListener('click', () => {
      showMemoryModal(memory, photoUrls)
    })

    scrollContainer.appendChild(item)
  })

  // Center detection and auto-scroll
  function updateCenterItems() {
    const items = $$('.timeline-item')
    items.forEach(item => item.classList.remove('center'))

    const containerRect = scrollContainer.getBoundingClientRect()
    const centerY = containerRect.height / 2

    items.forEach(item => {
      const itemRect = item.getBoundingClientRect()
      const itemCenterY = itemRect.top + itemRect.height / 2
      const distance = Math.abs(itemCenterY - centerY)

      if(distance < itemRect.height / 2) {
        item.classList.add('center')
      }
    })
  }

  // Auto-scroll with momentum
  function startAutoScroll() {
    if(autoScrollInterval) clearInterval(autoScrollInterval)
    let scrollSpeed = 1
    autoScrollInterval = setInterval(() => {
      if(!isManualScroll) {
        scrollContainer.scrollTop += scrollSpeed
        scrollSpeed = Math.min(scrollSpeed + 0.1, 3)
      }
    }, 50)
  }

  scrollContainer.addEventListener('scroll', () => {
    isManualScroll = true
    clearInterval(autoScrollInterval)
    updateCenterItems()

    // Resume auto-scroll after 5 seconds of no scroll
    setTimeout(() => {
      isManualScroll = false
      scrollSpeed = 0.5
      startAutoScroll()
    }, 5000)
  })

  scrollContainer.addEventListener('mouseenter', () => {
    clearInterval(autoScrollInterval)
  })

  scrollContainer.addEventListener('mouseleave', () => {
    isManualScroll = false
    startAutoScroll()
  })

  // Initial setup
  updateCenterItems()
  startAutoScroll()

  container.appendChild(scrollContainer)
}

// Memory modal functions
function showMemoryModal(memory, photoUrls) {
  const modal = $('#memoriesModal')
  if(!modal) return

  $('#memoryTitle').textContent = memory.title
  $('#memoryDate').textContent = new Date(memory.memory_date).toLocaleDateString('id-ID')
  $('#memoryCaption').textContent = memory.description || ''

  const grid = $('#memoryPhotosGrid')
  grid.innerHTML = ''

  photoUrls.forEach((url, idx) => {
    const thumb = document.createElement('div')
    thumb.className = 'memory-photo-thumb'
    const img = document.createElement('img')
    img.src = url
    img.alt = `Photo ${idx + 1}`
    thumb.appendChild(img)

    thumb.addEventListener('click', () => {
      const lightbox = $('#lightbox')
      const lightboxImg = $('#lightboxImg')
      if(lightbox && lightboxImg) {
        lightboxImg.src = url
        lightbox.classList.add('active')
      }
    })

    grid.appendChild(thumb)
  })

  modal.classList.add('active')
}

let currentMemoryPhotoIndex = 0
let memoryPhotos = []

function showMemoryLightbox(photoUrls) {
  memoryPhotos = photoUrls
  currentMemoryPhotoIndex = 0
  const lightboxImg = $('#lightboxImg')
  const lightbox = $('#lightbox')
  if(lightboxImg && lightbox) {
    lightboxImg.src = photoUrls[0]
    lightbox.classList.add('active')
  }
}

// ============================================
// EVENTS
// ============================================
function renderNextEvent() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const nextEvent = allEvents.find(event => {
    const eventDate = new Date(event.event_date)
    return eventDate >= today
  })

  const container = $('#eventContainer')
  if(!container) return
  
  container.innerHTML = ''

  if(!nextEvent) {
    container.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">Tidak ada event mendatang</p>'
    return
  }

  const eventDate = new Date(nextEvent.event_date)
  const card = document.createElement('div')
  card.className = 'event-card'

  const updateCountdown = () => {
    const now = new Date()
    const diff = eventDate - now

    if(diff < 0) {
      const countdown = card.querySelector('.countdown')
      if(countdown) countdown.innerHTML = '<p style="text-align: center; margin-top: 1rem;">Event sudah berakhir</p>'
      return
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((diff % (1000 * 60)) / 1000)

    const daysEl = card.querySelector('#days')
    const hoursEl = card.querySelector('#hours')
    const minutesEl = card.querySelector('#minutes')
    const secondsEl = card.querySelector('#seconds')

    if(daysEl) daysEl.textContent = days
    if(hoursEl) hoursEl.textContent = hours
    if(minutesEl) minutesEl.textContent = minutes
    if(secondsEl) secondsEl.textContent = seconds
  }

  card.innerHTML = `
    <h2>${nextEvent.title}</h2>
    <p>${new Date(nextEvent.event_date).toLocaleDateString('id-ID')}</p>
    <p>${nextEvent.description || ''}</p>
    ${nextEvent.location ? `<p>📍 ${nextEvent.location}</p>` : ''}
    <div class="countdown">
      <div class="countdown-item">
        <div class="countdown-number" id="days">0</div>
        <div class="countdown-label">Hari</div>
      </div>
      <div class="countdown-item">
        <div class="countdown-number" id="hours">0</div>
        <div class="countdown-label">Jam</div>
      </div>
      <div class="countdown-item">
        <div class="countdown-number" id="minutes">0</div>
        <div class="countdown-label">Menit</div>
      </div>
      <div class="countdown-item">
        <div class="countdown-number" id="seconds">0</div>
        <div class="countdown-label">Detik</div>
      </div>
    </div>
  `

  container.appendChild(card)
  updateCountdown()
  setInterval(updateCountdown, 1000)
}

// ============================================
// GUESTBOOK
// ============================================
function renderGuestbook() {
  const list = $('#guestbookList')
  if(!list) return
  
  list.innerHTML = ''

  if(allGuestbook.length === 0) {
    list.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">Belum ada pesan</p>'
    return
  }

  allGuestbook.forEach(guest => {
    const msg = document.createElement('div')
    msg.className = 'guest-message'
    msg.innerHTML = `
      <div class="guest-header">
        <div>
          <div class="guest-name">${guest.visitor_name || 'Anonim'}</div>
          ${guest.visitor_email ? `<div class="guest-email">📧 ${guest.visitor_email}</div>` : ''}
        </div>
        <div class="guest-date">${new Date(guest.created_at).toLocaleDateString('id-ID')}</div>
      </div>
      <div class="guest-text">"${guest.message}"</div>
    `
    list.appendChild(msg)
  })
}

// Guestbook form
const guestbookForm = $('#guestbookForm')
if(guestbookForm) {
  guestbookForm.addEventListener('submit', async (e) => {
    e.preventDefault()

    const visitorName = $('#visitorName')
    const visitorEmail = $('#visitorEmail')
    const visitorMessage = $('#visitorMessage')

    const name = visitorName ? visitorName.value.trim() : ''
    const email = visitorEmail ? visitorEmail.value.trim() : ''
    const message = visitorMessage ? visitorMessage.value.trim() : ''

    if(!message) {
      alert('Pesan tidak boleh kosong!')
      return
    }

    try {
      const { error } = await supabase.from('guestbook').insert({
        visitor_name: name || 'Anonim',
        visitor_email: email || null,
        message,
        is_approved: true
      })

      if(error) throw error

      // Clear form
      if(visitorName) visitorName.value = ''
      if(visitorEmail) visitorEmail.value = ''
      if(visitorMessage) visitorMessage.value = ''

      // Reload guestbook
      const { data } = await supabase.from('guestbook').select('*').order('created_at', { ascending: false })
      allGuestbook = data || []
      renderGuestbook()

      alert('Terima kasih! Pesan Anda telah terkirim.')
    } catch(err) {
      console.error('Error:', err)
      alert('Gagal mengirim pesan')
    }
  })
}

// ============================================
// STUDENT DIRECTORY (HIDDEN)
// ============================================
function renderStudentDirectory() {
  const grid = $('#studentsGridView')
  if(!grid) return
  
  grid.innerHTML = ''

  if(allStudents.length === 0) {
    grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">Belum ada data siswa</p>'
    return
  }

  allStudents.forEach(student => {
    const card = document.createElement('div')
    card.className = 'student-card'
    card.innerHTML = `
      <div class="student-number">No. ${student.student_number}</div>
      <div class="student-name">${getStudentName(student) || 'Tidak Ada Nama'}</div>
      ${student.phone ? `<div class="student-info">📞 ${student.phone}</div>` : ''}
      ${student.email ? `<div class="student-info">📧 <a href="mailto:${student.email}">${student.email}</a></div>` : ''}
      ${student.instagram ? `<div class="student-info">📱 <a href="https://instagram.com/${student.instagram}" target="_blank">@${student.instagram}</a></div>` : ''}
      ${student.address ? `<div class="student-info">🏠 ${student.address}</div>` : ''}
    `
    card.addEventListener('click', () => openStudentDetail(student))
    grid.appendChild(card)
  })
}


// ============================================
// INIT
// ============================================
loadAllData()
if(feather) feather.replace()

// Secret click counter untuk reveal students section (tanpa indikator visual)
document.addEventListener('click', (e) => {
  const studentCountNumber = $('#studentCountNumber')
  if(e.target === studentCountNumber || e.target.closest('[id="studentCountNumber"]')) {
    studentClickCounter++
    if(studentClickCounter === REVEAL_CLICKS) {
      revealStudentsSection()
      studentClickCounter = 0 // Reset counter
    }
  }
})
