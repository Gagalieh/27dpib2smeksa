import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.38.0/+esm'

const supabase = createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_ANON_KEY)
const $ = (sel) => document.querySelector(sel)
const $$ = (sel) => document.querySelectorAll(sel)

// ============================================
// GLOBAL STATE
// ============================================
let currentUser = null
let allGalleryPhotos = []
let allTags = []
let filesToUpload = []
let selectedGalleryIds = new Set()
let editingMemoryId = null
let editingNewsId = null
let editingEventId = null
let editingGalleryId = null
let selectedMemoryPhotos = []
let selectedBulkTagId = null

// ============================================
// NOTIFICATIONS
// ============================================
function createToastContainer() {
  if (document.getElementById('toast-container')) return
  const c = document.createElement('div')
  c.id = 'toast-container'
  c.style.position = 'fixed'
  c.style.right = '1rem'
  c.style.bottom = '1rem'
  c.style.zIndex = 99999
  c.style.display = 'flex'
  c.style.flexDirection = 'column'
  c.style.gap = '0.5rem'
  document.body.appendChild(c)
}

function showToast(message, type = 'info', persistent = false) {
  createToastContainer()
  const el = document.createElement('div')
  el.className = 'toast-item'
  el.style.padding = '0.6rem 0.9rem'
  el.style.borderRadius = '8px'
  el.style.color = '#0f172a'
  el.style.fontWeight = '600'
  el.style.minWidth = '180px'
  el.style.maxWidth = '360px'
  el.style.boxShadow = '0 8px 20px rgba(2,6,23,0.6)'
  el.style.background = type === 'error' ? '#FECACA' : type === 'success' ? '#BBF7D0' : '#E0F2FE'
  el.textContent = message

  const container = document.getElementById('toast-container')
  container.appendChild(el)

  if (!persistent) {
    setTimeout(() => {
      el.style.transition = 'opacity 0.3s, transform 0.3s'
      el.style.opacity = '0'
      el.style.transform = 'translateY(6px)'
      setTimeout(() => el.remove(), 350)
    }, 3500)
  } else {
    const btn = document.createElement('button')
    btn.textContent = 'OK'
    btn.style.marginLeft = '0.6rem'
    btn.style.border = 'none'
    btn.style.background = 'transparent'
    btn.style.cursor = 'pointer'
    btn.onclick = () => el.remove()
    el.appendChild(btn)
  }
}

window._nativeAlert = window.alert
window.alert = (msg) => showToast(String(msg), 'info', false)

// ============================================
// AUTH (safe attach + better logging)
// ============================================
function attachLoginHandler() {
  const form = $('#login-form')
  if (!form) {
    console.warn('attachLoginHandler: #login-form not found, will retry on DOMContentLoaded')
    document.addEventListener('DOMContentLoaded', attachLoginHandler, { once: true })
    return
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = ($('#login-email') && $('#login-email').value) || ''
    const password = ($('#login-password') && $('#login-password').value) || ''

    if (!validateEmail(email)) return showToast('Email tidak valid', 'error')
    if (!password) return showToast('Masukkan password', 'error')

    try {
      const res = await supabase.auth.signInWithPassword({ email, password })
      console.log('supabase signInWithPassword response', res)
      if (res.error) throw res.error
      currentUser = res.data?.user || null
      showAdminPanel()
      feather.replace()
      initializeAdmin()
    } catch (error) {
      console.error('Login error', error)
      showToast('❌ Login gagal: ' + (error?.message || JSON.stringify(error)), 'error', false)
    }
  })
}

attachLoginHandler()

const btnLogout = $('#btn-logout')
if (btnLogout) {
  btnLogout.addEventListener('click', async () => {
    if (confirm('Logout?')) {
      try {
        await supabase.auth.signOut()
      } catch (e) {
        console.error('Sign out error', e)
      }
      location.reload()
    }
  })
} else {
  console.warn('#btn-logout not found; logout handler not attached')
}

// Initialize admin dashboard data and listeners
async function initializeAdmin() {
  try {
    await loadDashboardStats()
    // pre-load common datasets for admin
    await Promise.allSettled([loadAllTags(), loadAllGalleryPhotos(), loadAllMemories(), loadAllEvents()])
    // ensure class profile data is loaded into the admin form and preview
    await loadClassProfileAdmin()
    // ensure students tab visibility and icon replacement
    try { showStudentsTab && showStudentsTab() } catch(e) {}
    try { feather && feather.replace && feather.replace() } catch(e) {}
  } catch (err) {
    console.error('initializeAdmin error', err)
  }
}

// Load class profile into admin form and preview (robust)
async function loadClassProfileAdmin() {
  try {
    const { data } = await supabase.from('class_profile').select('*').eq('id', 1).single()
    if (data) {
      // populate admin form fields if present
      const form = document.getElementById('class-profile-form')
      if (form) {
        form.ketua_name.value = data.ketua_name || ''
        form.ketua_instagram.value = data.ketua_instagram || ''
        form.ketua_photo_url.value = data.ketua_photo_url || ''
        form.wakil_name.value = data.wakil_name || ''
        form.wakil_instagram.value = data.wakil_instagram || ''
        form.wakil_photo_url.value = data.wakil_photo_url || ''
        form.wali_name.value = data.wali_name || ''
        form.wali_instagram.value = data.wali_instagram || ''
        form.wali_photo_url.value = data.wali_photo_url || ''
        form.total_students.value = data.total_students || 0
        form.school_name.value = data.school_name || ''
      }

      // also update public preview if present on admin page (preview area uses same render function)
      try { parent && parent.renderClassProfile && parent.renderClassProfile(data) } catch(e) {}
    }
  } catch (error) {
    console.error('loadClassProfileAdmin error', error)
  }
}

// ============================================
// SIDEBAR (Mobile: icon-only, no toggle)
// ============================================
const sidebar = $('#sidebar')

function showAdminPanel() {
  $('#login-page').style.display = 'none'
  $('#admin-dashboard').classList.remove('hidden')
}

// ============================================
// NAVIGATION & TAB SWITCHING
// ============================================
$$('.sidebar-link').forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault()
    const tabName = link.dataset.tab

    $$('.sidebar-link').forEach((l) => l.classList.remove('active'))
    link.classList.add('active')

    $$('.tab-content').forEach((tab) => tab.classList.remove('active'))
    const tabEl = $(`#${tabName}`)
    if (tabEl) {
      tabEl.classList.add('active')
      // Trigger data load for specific tabs
      loadTabData(tabName)
    }
  })
})

function loadTabData(tabName) {
  if (tabName === 'gallery-upload') {
    loadAllTags()
  } else if (tabName === 'gallery') {
    loadAllGalleryPhotos()
    loadAllTags()
    populateGalleryFilterTag()
  } else if (tabName === 'memories') {
    loadAllMemories()
  } else if (tabName === 'news') {
    loadAllNews()
  } else if (tabName === 'events') {
    loadAllEvents()
  } else if (tabName === 'guestbook') {
    loadGuestbook()
  } else if (tabName === 'tags') {
    loadAllTags()
  } else if (tabName === 'students') {
    loadStudents()
  }
}

// ============================================
// DASHBOARD
// ============================================
async function loadDashboardStats() {
  try {
    const [photosRes, memoriesRes, newsRes, eventsRes, guestsRes] = await Promise.all([
      supabase.from('gallery').select('id, created_at, image_url, file_size', { count: 'exact' }),
      supabase.from('memories').select('id', { count: 'exact' }),
      supabase.from('news').select('id', { count: 'exact' }),
      supabase.from('events').select('id', { count: 'exact' }),
      supabase.from('guestbook').select('id', { count: 'exact' })
    ])

    // Set photo counters
    if (photosRes.error) {
      console.error('Photos query error:', photosRes.error)
      $('#stat-photos').textContent = '0'
    } else {
      $('#stat-photos').textContent = photosRes.count || 0
    }

    $('#stat-memories').textContent = memoriesRes.count || 0
    $('#stat-news').textContent = newsRes.count || 0
    $('#stat-events').textContent = eventsRes.count || 0
    $('#stat-guests').textContent = guestsRes.count || 0

    // Calculate storage from file sizes in database
    let totalSizeBytes = 0
    
    if (photosRes.data && Array.isArray(photosRes.data) && photosRes.data.length > 0) {
      // First try: use database file_size values
      let databaseHasFileSizes = false
      
      photosRes.data.forEach((photo) => {
        if (photo.file_size && photo.file_size > 0) {
          databaseHasFileSizes = true
          totalSizeBytes += photo.file_size
        }
      })
      
      // If database has real file sizes, we're done
      if (databaseHasFileSizes && totalSizeBytes > 0) {
        // Good - use database values
      } else {
        // Fallback: try to fetch actual file sizes from Cloudinary URLs using HEAD requests
        const fileSizeMap = {}
        
        for (const photo of photosRes.data) {
          if (photo.image_url && !fileSizeMap[photo.image_url]) {
            try {
              const headRes = await fetch(photo.image_url, { method: 'HEAD' })
              const contentLength = headRes.headers.get('content-length')
              if (contentLength) {
                fileSizeMap[photo.image_url] = parseInt(contentLength)
                totalSizeBytes += parseInt(contentLength)
              }
            } catch (e) {
              console.warn('Could not fetch size for', photo.image_url, e.message)
            }
          }
        }
        
        // Save sizes to database for next time
        if (Object.keys(fileSizeMap).length > 0) {
          photosRes.data.forEach(async (photo) => {
            if (fileSizeMap[photo.image_url] && (!photo.file_size || photo.file_size === 0)) {
              await supabase
                .from('gallery')
                .update({ file_size: fileSizeMap[photo.image_url] })
                .eq('id', photo.id)
                .catch(e => console.warn('Could not update file_size:', e))
            }
          })
        }
      }
      
      // Last resort: estimate if we still have nothing
      if (totalSizeBytes === 0 && photosRes.count > 0) {
        totalSizeBytes = (photosRes.count || 0) * 0.5 * 1024 * 1024 // 0.5 MB estimate
      }
    }
    
    const totalSizeMB = totalSizeBytes / (1024 * 1024)
    $('#stat-storage').textContent = totalSizeMB.toFixed(1) + ' MB'
  } catch (error) {
    console.error('Dashboard stats error:', error)
    $('#stat-photos').textContent = '0'
    $('#stat-storage').textContent = '0 MB'
  }
}

// ============================================
// SITE CONFIG
// ============================================
$('#site-config-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const formData = new FormData(e.target)
  const obj = {
    id: 1,
    hero_title: formData.get('hero_title'),
    hero_subtitle: formData.get('hero_subtitle'),
    hero_motto: formData.get('hero_motto'),
    footer_text: formData.get('footer_text'),
    instagram_url: formData.get('instagram_url'),
    youtube_url: formData.get('youtube_url'),
    tiktok_url: formData.get('tiktok_url'),
    whatsapp_url: formData.get('whatsapp_url')
  }

  try {
    const { error } = await supabase.from('site_config').upsert(obj)
    if (error) throw error
    showToast('✅ Konfigurasi berhasil disimpan!', 'success')
  } catch (error) {
    showToast('❌ Error: ' + error.message, 'error')
  }
})

document.addEventListener('click', async (e) => {
  if (e.target.dataset.tab === 'site-config') {
    try {
      const { data } = await supabase.from('site_config').select('*').eq('id', 1).single()
      if (data) {
        $('#site-config-form').hero_title.value = data.hero_title || ''
        $('#site-config-form').hero_subtitle.value = data.hero_subtitle || ''
        $('#site-config-form').hero_motto.value = data.hero_motto || ''
        $('#site-config-form').footer_text.value = data.footer_text || ''
        $('#site-config-form').instagram_url.value = data.instagram_url || ''
        $('#site-config-form').youtube_url.value = data.youtube_url || ''
        $('#site-config-form').tiktok_url.value = data.tiktok_url || ''
        $('#site-config-form').whatsapp_url.value = data.whatsapp_url || ''
      }
    } catch (error) {
      console.error('Config load error:', error)
    }
  }
})

// ============================================
// CLASS PROFILE
// ============================================
$('#class-profile-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const formData = new FormData(e.target)
  const obj = {
    id: 1,
    ketua_name: formData.get('ketua_name'),
    ketua_instagram: formData.get('ketua_instagram'),
    ketua_photo_url: formData.get('ketua_photo_url'),
    wakil_name: formData.get('wakil_name'),
    wakil_instagram: formData.get('wakil_instagram'),
    wakil_photo_url: formData.get('wakil_photo_url'),
    wali_name: formData.get('wali_name'),
    wali_instagram: formData.get('wali_instagram'),
    wali_photo_url: formData.get('wali_photo_url'),
    total_students: parseInt(formData.get('total_students')) || 0,
    school_name: formData.get('school_name')
  }

  try {
    const { error } = await supabase.from('class_profile').upsert(obj)
    if (error) throw error
    showToast('✅ Profil kelas berhasil disimpan!', 'success')
  } catch (error) {
    showToast('❌ Error: ' + error.message, 'error')
  }
})

document.addEventListener('click', async (e) => {
  if (e.target.dataset.tab === 'class-profile') {
    try {
      const { data } = await supabase.from('class_profile').select('*').eq('id', 1).single()
      if (data) {
        $('#class-profile-form').ketua_name.value = data.ketua_name || ''
        $('#class-profile-form').ketua_instagram.value = data.ketua_instagram || ''
        $('#class-profile-form').ketua_photo_url.value = data.ketua_photo_url || ''
        $('#class-profile-form').wakil_name.value = data.wakil_name || ''
        $('#class-profile-form').wakil_instagram.value = data.wakil_instagram || ''
        $('#class-profile-form').wakil_photo_url.value = data.wakil_photo_url || ''
        $('#class-profile-form').wali_name.value = data.wali_name || ''
        $('#class-profile-form').wali_instagram.value = data.wali_instagram || ''
        $('#class-profile-form').wali_photo_url.value = data.wali_photo_url || ''
        $('#class-profile-form').total_students.value = data.total_students || 0
        $('#class-profile-form').school_name.value = data.school_name || ''
      }
    } catch (error) {
      console.error('Profile load error:', error)
    }
  }
})

// ============================================
// FORM VALIDATION
// ============================================
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return re.test(email)
}

function validateRequired(value) {
  return value.trim().length > 0
}

function validateMinLength(value, min) {
  return value.length >= min
}

function validateUrl(url) {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

function validateForm(form) {
  let isValid = true
  const errorMessages = []

  // Clear previous error styles
  form.querySelectorAll('.input-error').forEach((el) => {
    el.classList.remove('input-error')
  })
  form.querySelectorAll('.input-error-msg').forEach((el) => el.remove())

  // Check required fields
  form.querySelectorAll('[required]').forEach((field) => {
    if (!validateRequired(field.value)) {
      isValid = false
      field.classList.add('input-error')
      const msg = document.createElement('small')
      msg.className = 'input-error-msg'
      msg.style.color = 'var(--danger)'
      msg.style.display = 'block'
      msg.style.marginTop = '0.25rem'
      msg.textContent = `${field.placeholder || field.name} is required`
      field.parentNode.appendChild(msg)
      errorMessages.push(msg.textContent)
    }
  })

  // Check email fields
  form.querySelectorAll('[type="email"]').forEach((field) => {
    if (field.value && !validateEmail(field.value)) {
      isValid = false
      field.classList.add('input-error')
      const msg = document.createElement('small')
      msg.className = 'input-error-msg'
      msg.style.color = 'var(--danger)'
      msg.style.display = 'block'
      msg.style.marginTop = '0.25rem'
      msg.textContent = 'Invalid email format'
      field.parentNode.appendChild(msg)
      errorMessages.push(msg.textContent)
    }
  })

  // Check URL fields
  form.querySelectorAll('[type="url"]').forEach((field) => {
    if (field.value && !validateUrl(field.value)) {
      isValid = false
      field.classList.add('input-error')
      const msg = document.createElement('small')
      msg.className = 'input-error-msg'
      msg.style.color = 'var(--danger)'
      msg.style.display = 'block'
      msg.style.marginTop = '0.25rem'
      msg.textContent = 'Invalid URL format'
      field.parentNode.appendChild(msg)
      errorMessages.push(msg.textContent)
    }
  })

  return { isValid, errorMessages }
}

// Add CSS for error styling
const style = document.createElement('style')
style.textContent = `
  .input-error {
    border-color: var(--danger) !important;
    background: rgba(248, 113, 113, 0.1) !important;
  }
  
  .input-error:focus {
    box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.2) !important;
  }
`
document.head.appendChild(style)

// ============================================
// TAGS MANAGEMENT
// ============================================
async function loadAllTags() {
  try {
    const { data } = await supabase.from('tags').select('*').order('name')
    allTags = data || []
    renderTagsList()
  } catch (error) {
    console.error('Tags load error:', error)
  }
}

function renderTagsList() {
  const container = $('#tags-list')
  if (!container) return
  container.innerHTML = ''

  if (allTags.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem; color: var(--text-secondary);">
        <div style="font-size: 3rem; margin-bottom: 1rem;">🏷️</div>
        <p style="font-size: 1.1rem; font-weight: 600; margin-bottom: 0.5rem;">Belum ada tag</p>
        <p style="font-size: 0.9rem;">Buat tag untuk mengorganisir foto galeri Anda</p>
      </div>
    `
    return
  }

  allTags.forEach((tag) => {
    const card = document.createElement('div')
    card.className = 'item-card'
    card.innerHTML = `
      <div class="item-info">
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
          <div style="width: 20px; height: 20px; border-radius: 50%; background: ${tag.color}; box-shadow: 0 2px 8px rgba(0,0,0,0.2);"></div>
          <h3 style="margin: 0;">${tag.name}</h3>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0;">Slug: <code style="background: rgba(255,255,255,0.05); padding: 0.2rem 0.4rem; border-radius: 4px;">${tag.slug}</code></p>
      </div>
      <div class="item-actions">
        <button class="btn btn-danger" data-tag-id="${tag.id}">Hapus</button>
      </div>
    `
    card.querySelector('.btn-danger').addEventListener('click', async () => {
      if (confirm(`Hapus tag "${tag.name}"?`)) {
        try {
          showLoading('Menghapus tag...')
          const { error } = await supabase.from('tags').delete().eq('id', tag.id)
          if (error) throw error
          loadAllTags()
          showToast('✅ Tag berhasil dihapus!', 'success')
        } catch (error) {
          showToast('❌ Error: ' + error.message, 'error')
        } finally {
          hideLoading()
        }
      }
    })
    container.appendChild(card)
  })
}

$('#add-tag-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  
  const form = e.target
  const validation = validateForm(form)
  if (!validation.isValid) {
    showToast('❌ ' + validation.errorMessages[0], 'error')
    return
  }
  
  const name = $('#tag-name').value.trim()
  const color = $('#tag-color').value
  if (!name) return showToast('Nama tag tidak boleh kosong', 'error')

  const slug = name.toLowerCase().replace(/\s+/g, '-')

  try {
    showLoading('Menambah tag...')
    const { error } = await supabase.from('tags').insert({ name, slug, color })
    if (error) throw error
    $('#tag-name').value = ''
    $('#tag-color').value = '#7c3aed'
    loadAllTags()
    showToast('✅ Tag berhasil ditambahkan!', 'success')
  } catch (error) {
    showToast('❌ Error: ' + error.message, 'error')
  } finally {
    hideLoading()
  }
})

// ============================================
// IMAGE COMPRESSION & UPLOAD
// ============================================
async function compressImage(file, maxWidth = 1600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const scale = Math.min(1, maxWidth / img.width)
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(resolve, 'image/jpeg', quality)
      }
      img.onerror = reject
      img.src = e.target.result
    }
    reader.onerror = reject
  })
}

async function uploadToCloudinary(blob, retries = 1) {
  const url = `https://api.cloudinary.com/v1_1/${window.CONFIG.CLOUDINARY.CLOUD_NAME}/image/upload`
  const formData = new FormData()
  formData.append('file', blob)
  formData.append('upload_preset', window.CONFIG.CLOUDINARY.UPLOAD_PRESET)
  if (window.CONFIG.CLOUDINARY.FOLDER) formData.append('folder', window.CONFIG.CLOUDINARY.FOLDER)

  try {
    const response = await fetch(url, { method: 'POST', body: formData })
    const text = await response.text()
    let body
    try { body = JSON.parse(text) } catch (e) { body = { raw: text } }

    if (!response.ok) {
      console.error('Cloudinary upload error:', response.status, body)
      showToast(`Cloudinary error ${response.status}: ${body.error?.message || body.raw || JSON.stringify(body)}`, 'error', true)
      const err = new Error(`Cloudinary ${response.status}`)
      err.responseBody = body
      throw err
    }

    return body
  } catch (err) {
    if (retries > 0) {
      console.warn('Retrying Cloudinary upload...', { retries })
      await new Promise((r) => setTimeout(r, 900))
      return uploadToCloudinary(blob, retries - 1)
    }
    console.error('Upload to Cloudinary failed:', err)
    showToast('Upload ke Cloudinary gagal: ' + (err.message || ''), 'error', true)
    throw err
  }
}

// ============================================
// GALLERY UPLOAD
// ============================================
$('#btn-browse').addEventListener('click', () => {
  $('#file-input').click()
})

$('#file-input').addEventListener('change', (e) => {
  addFilesToUpload(e.target.files)
})

const uploadArea = $('#upload-area')
uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault()
  uploadArea.classList.add('dragover')
})

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('dragover')
})

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault()
  uploadArea.classList.remove('dragover')
  addFilesToUpload(e.dataTransfer.files)
})

function addFilesToUpload(files) {
  filesToUpload = Array.from(files)
  renderUploadPreview()
  $('#btn-upload-all').classList.remove('hidden')
  $('#file-count').textContent = filesToUpload.length
}

function renderUploadPreview() {
  const container = $('#upload-preview-list')
  if (!container) return
  container.innerHTML = ''

  filesToUpload.forEach((file, index) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const item = document.createElement('div')
      item.className = 'upload-preview-item'
      item.innerHTML = `
        <img class="upload-preview-img" src="${e.target.result}" alt="preview">
        <div class="upload-preview-form">
          <div class="form-group" style="margin-bottom: 0.5rem;">
            <label style="font-size: 0.8rem;">Judul</label>
            <input type="text" class="upload-title" placeholder="Judul foto" value="${file.name.replace(/\.[^/.]+$/, '')}" style="font-size: 0.85rem;">
          </div>
          <div class="form-group" style="margin-bottom: 0.75rem;">
            <label style="font-size: 0.8rem;">Caption</label>
            <input type="text" class="upload-caption" placeholder="Caption (opsional)" style="font-size: 0.85rem;">
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label style="font-size: 0.8rem; display: block; margin-bottom: 0.5rem;">Tag</label>
            <div class="upload-tags-selected" data-file-index="${index}" data-tags="[]" style="display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.75rem; min-height: 24px;"></div>
            <div class="upload-tags-list" style="display: flex; flex-wrap: wrap; gap: 0.4rem;"></div>
          </div>
        </div>
      `
      container.appendChild(item)

      const selectedTagsDiv = item.querySelector('.upload-tags-selected')
      const tagsListDiv = item.querySelector('.upload-tags-list')

      allTags.forEach((tag) => {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.textContent = tag.name
        btn.style.padding = '0.4rem 0.75rem'
        btn.style.fontSize = '0.75rem'
        btn.style.background = 'rgba(255, 255, 255, 0.1)'
        btn.style.color = 'var(--text-primary)'
        btn.style.border = '1px solid var(--border)'
        btn.style.borderRadius = '6px'
        btn.style.cursor = 'pointer'
        btn.style.transition = 'all 0.2s'
        btn.dataset.tagId = tag.id
        btn.dataset.selected = 'false'

        btn.addEventListener('click', (e) => {
          e.preventDefault()
          const tags = JSON.parse(selectedTagsDiv.dataset.tags)
          if (btn.dataset.selected === 'true') {
            btn.dataset.selected = 'false'
            btn.style.background = 'rgba(255, 255, 255, 0.1)'
            btn.style.color = 'var(--text-primary)'
            btn.style.borderColor = 'var(--border)'
            const idx = tags.indexOf(tag.id)
            if (idx > -1) tags.splice(idx, 1)
          } else {
            btn.dataset.selected = 'true'
            btn.style.background = tag.color
            btn.style.color = 'white'
            btn.style.borderColor = tag.color
            if (!tags.includes(tag.id)) tags.push(tag.id)
          }
          selectedTagsDiv.dataset.tags = JSON.stringify(tags)
          renderUploadTagChips(item)
        })

        tagsListDiv.appendChild(btn)
      })
    }
    reader.readAsDataURL(file)
  })
}

function renderUploadTagChips(item) {
  const selectedTagsDiv = item.querySelector('.upload-tags-selected')
  const tags = JSON.parse(selectedTagsDiv.dataset.tags)
  selectedTagsDiv.innerHTML = ''

  tags.forEach((tagId) => {
    const tag = allTags.find((t) => t.id === tagId)
    if (tag) {
      const chip = document.createElement('div')
      chip.className = 'upload-tag-chip'
      chip.innerHTML = `
        ${tag.name}
        <button type="button" data-tag-id="${tagId}" style="margin-left: 0.3rem;">×</button>
      `
      chip.querySelector('button').addEventListener('click', () => {
        const idx = tags.indexOf(tagId)
        if (idx > -1) tags.splice(idx, 1)
        selectedTagsDiv.dataset.tags = JSON.stringify(tags)
        renderUploadTagChips(item)
      })
      selectedTagsDiv.appendChild(chip)
    }
  })
}

$('#btn-upload-all').addEventListener('click', async () => {
  if (filesToUpload.length === 0) return showToast('Pilih foto terlebih dahulu', 'error')

  $('#upload-progress').classList.remove('hidden')
  const progressFill = $('.progress-fill')
  const progressPercent = $('#progress-percent')
  let uploaded = 0

  for (let i = 0; i < filesToUpload.length; i++) {
    const file = filesToUpload[i]
    const item = $$('.upload-preview-item')[i]
    const title = item.querySelector('.upload-title').value || file.name
    const caption = item.querySelector('.upload-caption').value || ''
    const selectedTagsDiv = item.querySelector('.upload-tags-selected')
    const tags = JSON.parse(selectedTagsDiv.dataset.tags)

    try {
      const compressed = await compressImage(file)
      const cloudResult = await uploadToCloudinary(compressed, 1)

      const { data: galleryData, error: galleryError } = await supabase
        .from('gallery')
        .insert({
          image_url: cloudResult.secure_url,
          title,
          caption,
          status: 'public',
          file_size: compressed.size
        })
        .select()

      if (galleryError) throw galleryError

      const galleryId = galleryData[0].id

      if (tags.length > 0) {
        const tagInserts = tags.map((tagId) => ({
          gallery_id: galleryId,
          tag_id: tagId
        }))
        const { error: tagError } = await supabase.from('gallery_tags').insert(tagInserts)
        if (tagError) throw tagError
      }

      uploaded++
      const percent = Math.round((uploaded / filesToUpload.length) * 100)
      progressFill.style.width = percent + '%'
      progressPercent.textContent = percent
    } catch (error) {
      console.error('Upload error:', error)
      const msg = error?.responseBody?.error?.message || error.message || String(error)
      showToast(`❌ Error uploading ${file.name}: ${msg}`, 'error', false)
    }
  }

  showToast('✅ Upload selesai!', 'success')
  filesToUpload = []
  $('#upload-preview-list').innerHTML = ''
  $('#btn-upload-all').classList.add('hidden')
  $('#upload-progress').classList.add('hidden')
  $('#file-input').value = ''
  loadAllGalleryPhotos()
  loadDashboardStats()
})

// ============================================
// GALLERY MANAGEMENT
// ============================================
async function loadAllGalleryPhotos() {
  try {
    const { data } = await supabase.from('gallery').select('*, gallery_tags(tags(*))').order('created_at', { ascending: false })
    allGalleryPhotos = data || []
    selectedGalleryIds.clear()
    renderGalleryGrid()
    updateGallerySelectUI()
  } catch (error) {
    console.error('Gallery load error:', error)
  }
}

function populateGalleryFilterTag() {
  const select = $('#gallery-filter-tag')
  if (!select) return
  
  const existingOptions = select.querySelectorAll('option:not(:first-child)')
  existingOptions.forEach((opt) => opt.remove())

  allTags.forEach((tag) => {
    const option = document.createElement('option')
    option.value = tag.id
    option.textContent = tag.name
    select.appendChild(option)
  })
}

function renderGalleryGrid() {
  const container = $('#gallery-grid')
  if (!container) return
  container.innerHTML = ''

  const searchTerm = $('#gallery-search')?.value.toLowerCase() || ''
  const selectedTag = $('#gallery-filter-tag')?.value || ''

  let filtered = allGalleryPhotos.filter((photo) => {
    const matchesSearch = photo.title?.toLowerCase().includes(searchTerm) || photo.caption?.toLowerCase().includes(searchTerm)
    const matchesTag = !selectedTag || photo.gallery_tags?.some((gt) => gt.tags.id == selectedTag)
    return matchesSearch && matchesTag
  })

  if (allGalleryPhotos.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem 1rem; color: var(--text-secondary);">
        <div style="font-size: 3rem; margin-bottom: 1rem;">📷</div>
        <p style="font-size: 1.1rem; font-weight: 600; margin-bottom: 0.5rem;">Belum ada foto di galeri</p>
        <p style="font-size: 0.9rem; margin-bottom: 1rem;">Mulai dengan mengupload foto pertama Anda</p>
        <button class="btn btn-primary" onclick="document.getElementById('upload')?.click()" style="cursor: pointer;">Upload Foto</button>
      </div>
    `
    return
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 2rem 1rem; color: var(--text-secondary);">
        <div style="font-size: 2rem; margin-bottom: 1rem;">🔍</div>
        <p>Tidak ada foto yang sesuai dengan pencarian atau filter</p>
      </div>
    `
    return
  }

  filtered.forEach((photo) => {
    const item = document.createElement('div')
    item.className = 'gallery-item'
    if (selectedGalleryIds.has(photo.id)) item.classList.add('selected')
    
    const tags = photo.gallery_tags?.map((gt) => gt.tags.name).join(', ') || ''
    item.innerHTML = `
      <input type="checkbox" class="gallery-item-checkbox" ${selectedGalleryIds.has(photo.id) ? 'checked' : ''}>
      <img class="gallery-item-img" src="${photo.image_url}" alt="${photo.title}">
      <div class="gallery-item-info">
        <div class="gallery-item-title">${photo.title || 'Untitled'}</div>
        ${tags ? `<small style="color: var(--text-secondary); display: block; margin-bottom: 0.5rem;">${tags}</small>` : ''}
        <div class="gallery-item-actions">
          <button class="btn btn-secondary" style="font-size: 0.8rem; padding: 0.4rem 0.75rem; flex: 1;" data-photo-id="${photo.id}" data-action="edit">Edit</button>
          <button class="btn btn-danger" style="font-size: 0.8rem; padding: 0.4rem 0.75rem; flex: 1;" data-photo-id="${photo.id}" data-action="delete">Hapus</button>
        </div>
      </div>
    `

    const checkbox = item.querySelector('.gallery-item-checkbox')
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedGalleryIds.add(photo.id)
        item.classList.add('selected')
      } else {
        selectedGalleryIds.delete(photo.id)
        item.classList.remove('selected')
      }
      updateGallerySelectUI()
    })

    const editBtn = item.querySelector('[data-action="edit"]')
    editBtn.addEventListener('click', () => openGalleryEditModal(photo))

    const deleteBtn = item.querySelector('[data-action="delete"]')
    deleteBtn.addEventListener('click', async () => {
      if (confirm('Hapus foto ini?')) {
        try {
          showLoading('Menghapus foto...')
          await supabase.from('gallery_tags').delete().eq('gallery_id', photo.id)
          await supabase.from('gallery').delete().eq('id', photo.id)
          loadAllGalleryPhotos()
          loadDashboardStats()
          showToast('✅ Foto berhasil dihapus!', 'success')
        } catch (error) {
          showToast('❌ Error: ' + error.message, 'error')
        } finally {
          hideLoading()
        }
      }
    })

    container.appendChild(item)
  })
}

function updateGallerySelectUI() {
  const selectAllCheckbox = $('#gallery-select-all')
  const bulkTagBtn = $('#btn-gallery-bulk-tag')
  const bulkDeleteBtn = $('#btn-gallery-bulk-delete')
  const label = $('#gallery-select-label')

  const totalFiltered = $$('.gallery-item').length
  const allSelected = selectedGalleryIds.size > 0 && selectedGalleryIds.size === allGalleryPhotos.length
  selectAllCheckbox.checked = allSelected

  if (selectedGalleryIds.size === 0) {
    bulkTagBtn.classList.add('hidden')
    bulkDeleteBtn.classList.add('hidden')
    label.textContent = 'Pilih Semua'
  } else {
    bulkTagBtn.classList.remove('hidden')
    bulkDeleteBtn.classList.remove('hidden')
    label.textContent = `Pilih Semua (${selectedGalleryIds.size} dipilih)`
  }
}

$('#gallery-select-all').addEventListener('change', (e) => {
  if (e.target.checked) {
    selectedGalleryIds.clear()
    $$('.gallery-item-checkbox').forEach((cb) => {
      cb.checked = true
      const id = parseInt(cb.closest('.gallery-item').querySelector('[data-action="delete"]').dataset.photoId)
      selectedGalleryIds.add(id)
    })
  } else {
    selectedGalleryIds.clear()
    $$('.gallery-item-checkbox').forEach((cb) => {
      cb.checked = false
    })
  }
  renderGalleryGrid()
  updateGallerySelectUI()
})

$('#btn-gallery-bulk-tag').addEventListener('click', () => {
  if (selectedGalleryIds.size === 0) {
    showToast('Pilih foto terlebih dahulu', 'error')
    return
  }
  openBulkTagModal()
})

$('#btn-gallery-bulk-delete').addEventListener('click', async () => {
  if (selectedGalleryIds.size === 0) return
  if (!confirm(`Hapus ${selectedGalleryIds.size} foto? Tindakan ini tidak dapat dibatalkan.`)) return

  try {
    for (const id of selectedGalleryIds) {
      await supabase.from('gallery_tags').delete().eq('gallery_id', id)
      await supabase.from('gallery').delete().eq('id', id)
    }
    selectedGalleryIds.clear()
    loadAllGalleryPhotos()
    loadDashboardStats()
    showToast(`✅ ${selectedGalleryIds.size} foto berhasil dihapus!`, 'success')
  } catch (error) {
    showToast('❌ Error: ' + error.message, 'error')
  }
})

function openGalleryEditModal(photo) {
  editingGalleryId = photo.id
  const modal = $('#modal-gallery-edit')
  if (!modal) return

  $('#gallery-edit-preview').src = photo.image_url
  $('#gallery-edit-title').value = photo.title || ''
  $('#gallery-edit-caption').value = photo.caption || ''
  $('#gallery-edit-file-input').value = ''

  const tagsContainer = $('#gallery-edit-tags-container')
  tagsContainer.innerHTML = ''

  const currentTagIds = photo.gallery_tags?.map((gt) => gt.tags.id) || []

  allTags.forEach((tag) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = tag.name
    btn.style.padding = '0.4rem 0.75rem'
    btn.style.fontSize = '0.85rem'
    btn.style.background = currentTagIds.includes(tag.id) ? tag.color : 'rgba(255, 255, 255, 0.1)'
    btn.style.color = currentTagIds.includes(tag.id) ? 'white' : 'var(--text-primary)'
    btn.style.border = '1px solid var(--border)'
    btn.style.borderRadius = '6px'
    btn.style.cursor = 'pointer'
    btn.style.transition = 'all 0.2s'
    btn.className = 'gallery-edit-tag-btn'
    btn.dataset.tagId = tag.id
    btn.dataset.selected = currentTagIds.includes(tag.id) ? 'true' : 'false'

    btn.addEventListener('click', (e) => {
      e.preventDefault()
      btn.dataset.selected = btn.dataset.selected === 'true' ? 'false' : 'true'
      btn.style.background = btn.dataset.selected === 'true' ? tag.color : 'rgba(255, 255, 255, 0.1)'
      btn.style.color = btn.dataset.selected === 'true' ? 'white' : 'var(--text-primary)'
    })

    tagsContainer.appendChild(btn)
  })

  modal.classList.remove('hidden')
}

$('#gallery-edit-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  if (!editingGalleryId) return

  const title = $('#gallery-edit-title').value
  const caption = $('#gallery-edit-caption').value
  const fileInput = $('#gallery-edit-file-input')

  try {
    let imageUrl = null

    if (fileInput.files && fileInput.files.length > 0) {
      const compressed = await compressImage(fileInput.files[0])
      const cloudResult = await uploadToCloudinary(compressed, 1)
      imageUrl = cloudResult.secure_url
    }

    const updateObj = { title, caption }
    if (imageUrl) updateObj.image_url = imageUrl

    const { error: updateError } = await supabase.from('gallery').update(updateObj).eq('id', editingGalleryId)
    if (updateError) throw updateError

    // Update tags
    const selectedTagBtns = $$('.gallery-edit-tag-btn[data-selected="true"]')
    const newTagIds = Array.from(selectedTagBtns).map((btn) => parseInt(btn.dataset.tagId))

    await supabase.from('gallery_tags').delete().eq('gallery_id', editingGalleryId)

    if (newTagIds.length > 0) {
      const tagInserts = newTagIds.map((tagId) => ({
        gallery_id: editingGalleryId,
        tag_id: tagId
      }))
      const { error: tagError } = await supabase.from('gallery_tags').insert(tagInserts)
      if (tagError) throw tagError
    }

    showToast('✅ Foto berhasil diubah!', 'success')
    const modal = $('#modal-gallery-edit')
    if (modal) modal.classList.add('hidden')
    loadAllGalleryPhotos()
    loadDashboardStats()
  } catch (error) {
    showToast('❌ Error: ' + error.message, 'error')
  }
})

function openBulkTagModal() {
  const modal = $('#modal-bulk-tag')
  if (!modal) return

  $('#bulk-tag-count').textContent = selectedGalleryIds.size
  const tagsContainer = $('#bulk-tag-options')
  tagsContainer.innerHTML = ''

  allTags.forEach((tag) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = tag.name
    btn.style.padding = '0.5rem 1rem'
    btn.style.fontSize = '0.9rem'
    btn.style.background = 'rgba(255, 255, 255, 0.1)'
    btn.style.color = 'var(--text-primary)'
    btn.style.border = '1px solid var(--border)'
    btn.style.borderRadius = '8px'
    btn.style.cursor = 'pointer'
    btn.style.transition = 'all 0.2s'
    btn.className = 'bulk-tag-option-btn'
    btn.dataset.tagId = tag.id
    btn.dataset.selected = 'false'

    btn.addEventListener('click', (e) => {
      e.preventDefault()
      btn.dataset.selected = btn.dataset.selected === 'true' ? 'false' : 'true'
      btn.style.background = btn.dataset.selected === 'true' ? tag.color : 'rgba(255, 255, 255, 0.1)'
      btn.style.color = btn.dataset.selected === 'true' ? 'white' : 'var(--text-primary)'
    })

    tagsContainer.appendChild(btn)
  })

  modal.classList.remove('hidden')
}

$('#btn-bulk-tag-add').addEventListener('click', async () => {
  const selectedTagBtns = $$('.bulk-tag-option-btn[data-selected="true"]')
  const selectedTagIds = Array.from(selectedTagBtns).map((btn) => parseInt(btn.dataset.tagId))

  if (selectedTagIds.length === 0) {
    showToast('Pilih minimal 1 tag', 'error')
    return
  }

  try {
    for (const photoId of selectedGalleryIds) {
      const tagInserts = selectedTagIds.map((tagId) => ({
        gallery_id: photoId,
        tag_id: tagId
      }))
      const { error } = await supabase.from('gallery_tags').insert(tagInserts)
      if (error && !error.message.includes('duplicate')) throw error
    }

    showToast(`✅ Tag berhasil ditambahkan ke ${selectedGalleryIds.size} foto!`, 'success')
    const modal = $('#modal-bulk-tag')
    if (modal) modal.classList.add('hidden')
    loadAllGalleryPhotos()
  } catch (error) {
    showToast('❌ Error: ' + error.message, 'error')
  }
})

const gallerySearch = $('#gallery-search')
if (gallerySearch) gallerySearch.addEventListener('input', renderGalleryGrid)
const galleryFilterTag = $('#gallery-filter-tag')
if (galleryFilterTag) galleryFilterTag.addEventListener('change', renderGalleryGrid)

$$('.btn-cancel').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    const modal = e.target.closest('.modal')
    if (modal) modal.classList.add('hidden')
  })
})

$$('.btn-close').forEach((btn) => {
  btn.addEventListener('click', () => {
    const modal = btn.closest('.modal')
    if (modal) modal.classList.add('hidden')
  })
})

// Shortcuts button
const shortcutsBtn = $('#btn-shortcuts')
if (shortcutsBtn) {
  shortcutsBtn.addEventListener('click', () => {
    const modal = $('#modal-shortcuts')
    if (modal) modal.classList.toggle('hidden')
  })
}

// ============================================
// MEMORIES
// ============================================
async function loadAllMemories() {
  try {
    const { data } = await supabase.from('memories').select('*, memory_photos(*, gallery(*))').order('position')
    renderMemoriesList(data || [])
  } catch (error) {
    console.error('Memories load error:', error)
  }
}

function renderMemoriesList(memories) {
  const container = $('#memories-list')
  if (!container) return
  container.innerHTML = ''

  if (memories.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem; color: var(--text-secondary);">
        <div style="font-size: 3rem; margin-bottom: 1rem;">💭</div>
        <p style="font-size: 1.1rem; font-weight: 600; margin-bottom: 0.5rem;">Belum ada memories</p>
        <p style="font-size: 0.9rem;">Simpan momen berharga bersama kelas Anda</p>
      </div>
    `
    return
  }

  memories.forEach((memory) => {
    const card = document.createElement('div')
    card.className = 'item-card'
    const photoCount = memory.memory_photos?.length || 0
    card.innerHTML = `
      <div class="item-info">
        <h3>${memory.title}</h3>
        <div class="item-meta">
          <span>${new Date(memory.memory_date).toLocaleDateString('id-ID')}</span>
          <span>${photoCount} 📷</span>
        </div>
      </div>
      <div class="item-actions">
        <button class="btn btn-secondary" data-memory-id="${memory.id}">Edit</button>
        <button class="btn btn-danger" data-memory-id="${memory.id}">Hapus</button>
      </div>
    `

    const editBtn = card.querySelectorAll('button')[0]
    const deleteBtn = card.querySelectorAll('button')[1]

    editBtn.addEventListener('click', () => openMemoryModal(memory))
    deleteBtn.addEventListener('click', async () => {
      if (confirm('Hapus memory ini?')) {
        try {
          showLoading('Menghapus memory...')
          await supabase.from('memories').delete().eq('id', memory.id)
          loadAllMemories()
          showToast('✅ Memory berhasil dihapus!', 'success')
        } catch (error) {
          showToast('❌ Error: ' + error.message, 'error')
        } finally {
          hideLoading()
        }
      }
    })

    container.appendChild(card)
  })
}

async function loadMemoriesGallery() {
  try {
    const { data } = await supabase
      .from('gallery')
      .select('*, gallery_tags(tags(*))')
      .eq('status', 'public')
      .order('created_at', { ascending: false })
    
    const container = $('#memory-photo-list')
    if (!container) return

    // Populate tag filter select
    const filterSelect = $('#memory-photo-filter-tag')
    if (filterSelect && filterSelect.options.length === 1) {
      allTags.forEach((tag) => {
        const option = document.createElement('option')
        option.value = tag.id
        option.textContent = tag.name
        filterSelect.appendChild(option)
      })
    }

    // Filter by search and tag
    const searchTerm = ($('#memory-photo-search')?.value || '').toLowerCase()
    const selectedTag = $('#memory-photo-filter-tag')?.value || ''

    let filtered = (data || []).filter((photo) => {
      const matchesSearch = photo.title?.toLowerCase().includes(searchTerm) || photo.caption?.toLowerCase().includes(searchTerm)
      const matchesTag = !selectedTag || photo.gallery_tags?.some((gt) => gt.tags.id == selectedTag)
      return matchesSearch && matchesTag
    })

    container.innerHTML = ''

    if (filtered.length === 0) {
      container.innerHTML = '<p style="color: var(--text-secondary); grid-column: 1/-1;">Tidak ada foto</p>'
      return
    }

    filtered.forEach((photo) => {
      const item = document.createElement('div')
      item.className = `memory-photo-item ${selectedMemoryPhotos.includes(photo.id) ? 'selected' : ''}`
      item.dataset.photoId = photo.id
      item.innerHTML = `
        <img src="${photo.image_url}" alt="">
        <div class="memory-photo-check">✓</div>
      `
      item.addEventListener('click', () => {
        if (selectedMemoryPhotos.includes(photo.id)) {
          selectedMemoryPhotos = selectedMemoryPhotos.filter((id) => id !== photo.id)
        } else {
          selectedMemoryPhotos.push(photo.id)
        }
        loadMemoriesGallery()
      })
      container.appendChild(item)
    })
  } catch (error) {
    console.error('Memory gallery load error:', error)
  }
}

function openMemoryModal(memory = null) {
  editingMemoryId = memory?.id || null
  selectedMemoryPhotos = memory?.memory_photos?.map((mp) => mp.gallery_id) || []

  const form = $('#memory-form')
  if (!form) return
  form.reset()
  form.title.value = memory?.title || ''
  form.memory_date.value = memory?.memory_date || new Date().toISOString().split('T')[0]
  form.description.value = memory?.description || ''

  loadMemoriesGallery()

  // Setup filter listeners
  const searchInput = $('#memory-photo-search')
  const filterSelect = $('#memory-photo-filter-tag')
  if (searchInput) searchInput.addEventListener('input', loadMemoriesGallery)
  if (filterSelect) filterSelect.addEventListener('change', loadMemoriesGallery)

  const modal = $('#modal-memory')
  if (modal) modal.classList.remove('hidden')
}

const btnAddMemory = $('#btn-add-memory')
if (btnAddMemory) btnAddMemory.addEventListener('click', () => openMemoryModal())

const memoryForm = $('#memory-form')
if (memoryForm) {
  memoryForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)

    const obj = {
      title: formData.get('title'),
      memory_date: formData.get('memory_date'),
      description: formData.get('description'),
      position: editingMemoryId ? null : 0
    }

    try {
      let memoryId = editingMemoryId

      if (editingMemoryId) {
        const { error } = await supabase.from('memories').update(obj).eq('id', editingMemoryId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('memories').insert(obj).select()
        if (error) throw error
        memoryId = data[0].id
      }

      if (memoryId) {
        await supabase.from('memory_photos').delete().eq('memory_id', memoryId)

        if (selectedMemoryPhotos.length > 0) {
          const photoInserts = selectedMemoryPhotos.map((galleryId, idx) => ({
            memory_id: memoryId,
            gallery_id: galleryId,
            position: idx
          }))
          const { error: photoError } = await supabase.from('memory_photos').insert(photoInserts)
          if (photoError) throw photoError
        }
      }

      showToast('✅ Memory berhasil disimpan!', 'success')
      const modal = $('#modal-memory')
      if (modal) modal.classList.add('hidden')
      loadAllMemories()
    } catch (error) {
      showToast('❌ Error: ' + error.message, 'error')
    }
  })
}

// ============================================
// NEWS
// ============================================
async function loadAllNews() {
  try {
    const { data } = await supabase.from('news').select('*').order('publish_date', { ascending: false })
    renderNewsList(data || [])
  } catch (error) {
    console.error('News load error:', error)
  }
}

function renderNewsList(newsList) {
  const container = $('#news-list')
  if (!container) return
  container.innerHTML = ''

  if (newsList.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem; color: var(--text-secondary);">
        <div style="font-size: 3rem; margin-bottom: 1rem;">📰</div>
        <p style="font-size: 1.1rem; font-weight: 600; margin-bottom: 0.5rem;">Belum ada berita</p>
        <p style="font-size: 0.9rem;">Bagikan kabar terbaru tentang kelas Anda</p>
      </div>
    `
    return
  }

  newsList.forEach((news) => {
    const card = document.createElement('div')
    card.className = 'item-card'
    card.innerHTML = `
      <div class="item-info">
        <h3>${news.title}</h3>
        <div class="item-meta">
          <span>${new Date(news.publish_date).toLocaleDateString('id-ID')}</span>
          <span class="tag-chip ${news.status === 'published' ? '' : 'outline'}">${news.status === 'published' ? '✓ Published' : '📝 Draft'}</span>
        </div>
        <p style="margin-top: 0.5rem; font-size: 0.9rem;">${news.summary || ''}</p>
      </div>
      <div class="item-actions">
        <button class="btn btn-secondary" data-news-id="${news.id}">Edit</button>
        <button class="btn btn-danger" data-news-id="${news.id}">Hapus</button>
      </div>
    `

    const editBtn = card.querySelectorAll('button')[0]
    const deleteBtn = card.querySelectorAll('button')[1]

    editBtn.addEventListener('click', () => openNewsModal(news))
    deleteBtn.addEventListener('click', async () => {
      if (confirm('Hapus berita ini?')) {
        try {
          showLoading('Menghapus berita...')
          await supabase.from('news').delete().eq('id', news.id)
          loadAllNews()
          showToast('✅ Berita berhasil dihapus!', 'success')
        } catch (error) {
          showToast('❌ Error: ' + error.message, 'error')
        } finally {
          hideLoading()
        }
      }
    })

    container.appendChild(card)
  })
}

function openNewsModal(news = null) {
  editingNewsId = news?.id || null
  const form = $('#news-form')
  if (!form) return
  form.reset()

  if (news) {
    form.title.value = news.title
    form.summary.value = news.summary || ''
    form.content.value = news.content || ''
    form.thumbnail_url.value = news.thumbnail_url || ''
    form.publish_date.value = news.publish_date
    form.status.value = news.status
  } else {
    form.publish_date.value = new Date().toISOString().split('T')[0]
    form.status.value = 'draft'
  }

  const modal = $('#modal-news')
  if (modal) modal.classList.remove('hidden')
}

const btnAddNews = $('#btn-add-news')
if (btnAddNews) btnAddNews.addEventListener('click', () => openNewsModal())

const newsForm = $('#news-form')
if (newsForm) {
  newsForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)

    const obj = {
      title: formData.get('title'),
      summary: formData.get('summary'),
      content: formData.get('content'),
      thumbnail_url: formData.get('thumbnail_url'),
      publish_date: formData.get('publish_date'),
      status: formData.get('status')
    }

    try {
      if (editingNewsId) {
        const { error } = await supabase.from('news').update(obj).eq('id', editingNewsId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('news').insert(obj)
        if (error) throw error
      }

      showToast('✅ Berita berhasil disimpan!', 'success')
      const modal = $('#modal-news')
      if (modal) modal.classList.add('hidden')
      loadAllNews()
    } catch (error) {
      showToast('❌ Error: ' + error.message, 'error')
    }
  })
}

// ============================================
// EVENTS
// ============================================
async function loadAllEvents() {
  try {
    const { data } = await supabase.from('events').select('*').order('event_date')
    renderEventsList(data || [])
  } catch (error) {
    console.error('Events load error:', error)
  }
}

function renderEventsList(events) {
  const container = $('#events-list')
  if (!container) return
  container.innerHTML = ''

  if (events.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem; color: var(--text-secondary);">
        <div style="font-size: 3rem; margin-bottom: 1rem;">📅</div>
        <p style="font-size: 1.1rem; font-weight: 600; margin-bottom: 0.5rem;">Belum ada kegiatan</p>
        <p style="font-size: 0.9rem;">Daftarkan acara dan kegiatan kelas Anda</p>
      </div>
    `
    return
  }

  events.forEach((event) => {
    const card = document.createElement('div')
    card.className = 'item-card'
    const eventDate = new Date(event.event_date)
    const now = new Date()
    const isPast = eventDate < now
    const daysLeft = Math.ceil((eventDate - now) / (1000 * 60 * 60 * 24))

    card.innerHTML = `
      <div class="item-info">
        <h3>${event.title}</h3>
        <div class="item-meta">
          <span>${eventDate.toLocaleDateString('id-ID')}</span>
          ${!isPast ? `<span style="color: var(--success);">📅 ${daysLeft} hari</span>` : '<span style="color: var(--text-secondary);">✓ Selesai</span>'}
        </div>
        <p style="margin-top: 0.5rem; font-size: 0.9rem;">${event.description || ''}</p>
      </div>
      <div class="item-actions">
        <button class="btn btn-secondary" data-event-id="${event.id}">Edit</button>
        <button class="btn btn-danger" data-event-id="${event.id}">Hapus</button>
      </div>
    `

    const editBtn = card.querySelectorAll('button')[0]
    const deleteBtn = card.querySelectorAll('button')[1]

    editBtn.addEventListener('click', () => openEventModal(event))
    deleteBtn.addEventListener('click', async () => {
      if (confirm('Hapus event ini?')) {
        try {
          showLoading('Menghapus event...')
          await supabase.from('events').delete().eq('id', event.id)
          loadAllEvents()
          showToast('✅ Event berhasil dihapus!', 'success')
        } catch (error) {
          showToast('❌ Error: ' + error.message, 'error')
        } finally {
          hideLoading()
        }
      }
    })

    container.appendChild(card)
  })
}

function openEventModal(event = null) {
  editingEventId = event?.id || null
  const form = $('#event-form')
  if (!form) return
  form.reset()

  if (event) {
    form.title.value = event.title
    form.description.value = event.description || ''
    form.event_date.value = event.event_date
    form.event_time.value = event.event_time || ''
    form.location.value = event.location || ''
  } else {
    form.event_date.value = new Date().toISOString().split('T')[0]
  }

  const modal = $('#modal-event')
  if (modal) modal.classList.remove('hidden')
}

const btnAddEvent = $('#btn-add-event')
if (btnAddEvent) btnAddEvent.addEventListener('click', () => openEventModal())

const eventForm = $('#event-form')
if (eventForm) {
  eventForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)

    const obj = {
      title: formData.get('title'),
      description: formData.get('description'),
      event_date: formData.get('event_date'),
      event_time: formData.get('event_time') || null,
      location: formData.get('location')
    }

    try {
      if (editingEventId) {
        const { error } = await supabase.from('events').update(obj).eq('id', editingEventId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('events').insert(obj)
        if (error) throw error
      }

      showToast('✅ Event berhasil disimpan!', 'success')
      const modal = $('#modal-event')
      if (modal) modal.classList.add('hidden')
      loadAllEvents()
    } catch (error) {
      showToast('❌ Error: ' + error.message, 'error')
    }
  })
}

// ============================================
// GUESTBOOK
// ============================================
async function loadGuestbook() {
  try {
    const { data } = await supabase.from('guestbook').select('*').order('created_at', { ascending: false })
    renderGuestbookList(data || [])
  } catch (error) {
    console.error('Guestbook load error:', error)
  }
}

function renderGuestbookList(guests) {
  const container = $('#guestbook-list')
  if (!container) return
  container.innerHTML = ''

  if (guests.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem; color: var(--text-secondary);">
        <div style="font-size: 3rem; margin-bottom: 1rem;">💬</div>
        <p style="font-size: 1.1rem; font-weight: 600; margin-bottom: 0.5rem;">Belum ada pesan</p>
        <p style="font-size: 0.9rem;">Pesan dari pengunjung akan muncul di sini</p>
      </div>
    `
    return
  }

  guests.forEach((guest) => {
    const card = document.createElement('div')
    card.className = 'item-card'
    card.innerHTML = `
      <div class="item-info" style="flex: 1;">
        <h3>${guest.visitor_name || 'Anonim'}</h3>
        <p style="color: var(--text-secondary); font-size: 0.9rem; margin: 0.5rem 0;">📧 ${guest.visitor_email || '-'}</p>
        <p style="font-size: 0.95rem; margin-top: 0.5rem; font-style: italic;">"${guest.message}"</p>
        <small style="color: #64748b;">🕐 ${new Date(guest.created_at).toLocaleDateString('id-ID')}</small>
      </div>
      <div class="item-actions">
        <button class="btn btn-danger" data-guest-id="${guest.id}">Hapus</button>
      </div>
    `

    card.querySelector('.btn-danger').addEventListener('click', async () => {
      if (confirm('Hapus pesan ini?')) {
        try {
          showLoading('Menghapus pesan...')
          await supabase.from('guestbook').delete().eq('id', guest.id)
          loadGuestbook()
          showToast('✅ Pesan berhasil dihapus!', 'success')
        } catch (error) {
          showToast('❌ Error: ' + error.message, 'error')
        } finally {
          hideLoading()
        }
      }
    })

    container.appendChild(card)
  })
}

// ============================================
// BONUS FEATURES
// ============================================

// Gallery Export (Download as JSON)
window.exportGalleryData = async function() {
  try {
    const { data } = await supabase.from('gallery').select('*, gallery_tags(tags(*))')
    const dataStr = JSON.stringify(data, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `galeri-backup-${new Date().toISOString().split('T')[0]}.json`
    link.click()
    showToast('✅ Data gallery berhasil diexport!', 'success')
  } catch (error) {
    showToast('❌ Error export: ' + error.message, 'error')
  }
}

// Gallery Sorting Option
window.toggleGallerySortMode = function() {
  const grid = $('#gallery-grid')
  if (!grid) return
  if (grid.dataset.sortMode === 'date') {
    grid.dataset.sortMode = 'name'
    allGalleryPhotos.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
  } else {
    grid.dataset.sortMode = 'date'
    allGalleryPhotos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }
  renderGalleryGrid()
  showToast(`Diurutkan berdasarkan: ${grid.dataset.sortMode === 'date' ? 'Tanggal (Terbaru)' : 'Nama (A-Z)'}`, 'info')
}

// Gallery Lightbox Preview
window.openGalleryLightbox = function(imageUrl, title) {
  const lightbox = document.createElement('div')
  lightbox.style.position = 'fixed'
  lightbox.style.inset = '0'
  lightbox.style.background = 'rgba(0, 0, 0, 0.9)'
  lightbox.style.zIndex = '5000'
  lightbox.style.display = 'flex'
  lightbox.style.alignItems = 'center'
  lightbox.style.justifyContent = 'center'
  lightbox.style.backdropFilter = 'blur(4px)'
  lightbox.innerHTML = `
    <div style="position: relative; max-width: 90vw; max-height: 90vh;">
      <img src="${imageUrl}" alt="${title}" style="width: 100%; height: 100%; object-fit: contain;">
      <div style="position: absolute; top: 1rem; right: 1rem; background: rgba(0, 0, 0, 0.7); color: white; padding: 0.5rem 1rem; border-radius: 8px; cursor: pointer; font-size: 1.5rem;" onclick="this.closest('div').parentElement.remove();">×</div>
    </div>
  `
  document.body.appendChild(lightbox)
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) lightbox.remove()
  })
}

// Quick Stats
window.showQuickStats = function() {
  const stats = {
    'Total Foto': allGalleryPhotos.length,
    'Tags Tersedia': allTags.length,
    'Ukuran Rata-Rata': (0.5).toFixed(1) + ' MB per foto'
  }
  let message = 'STATISTIK GALERI:\n\n'
  Object.entries(stats).forEach(([key, val]) => {
    message += `${key}: ${val}\n`
  })
  showToast(message, 'info', true)
}

// ============================================
// LOADING STATE
// ============================================
function showLoading(text = 'Loading...') {
  const overlay = $('#loading-overlay')
  if (!overlay) return
  const loadingText = $('#loading-text')
  if (loadingText) loadingText.textContent = text
  overlay.classList.remove('hidden')
}

function hideLoading() {
  const overlay = $('#loading-overlay')
  if (!overlay) return
  overlay.classList.add('hidden')
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
document.addEventListener('keydown', (e) => {
  // Check if user is typing in an input field
  const isTyping = ['INPUT', 'TEXTAREA'].includes(e.target.tagName)
  
  // ? or Cmd+K: Open shortcuts modal
  if ((e.key === '?' && !isTyping) || (e.metaKey && e.key === 'k')) {
    e.preventDefault()
    const modal = $('#modal-shortcuts')
    if (modal) modal.classList.toggle('hidden')
  }
  
  // Escape: Close any modal
  if (e.key === 'Escape') {
    $$('.modal:not(.hidden)').forEach((modal) => {
      modal.classList.add('hidden')
    })
  }
  
  // Cmd+D: Go to Dashboard
  if (e.metaKey && e.key === 'd' && !isTyping) {
    e.preventDefault()
    document.getElementById('dashboard')?.click()
    showToast('📊 Dashboard', 'info')
  }
  
  // Cmd+G: Go to Gallery
  if (e.metaKey && e.key === 'g' && !isTyping) {
    e.preventDefault()
    document.getElementById('gallery')?.click()
    showToast('🖼️ Gallery', 'info')
  }
  
  // Cmd+S: Save form
  if (e.metaKey && e.key === 's' && !isTyping) {
    e.preventDefault()
    const activeForm = $$('form:not(.hidden)')
    if (activeForm && activeForm.length > 0) {
      activeForm[0].querySelector('[type="submit"]')?.click()
      showToast('💾 Form saved', 'success')
    }
  }
  
  // Cmd+E: Export gallery
  if (e.metaKey && e.key === 'e' && !isTyping) {
    e.preventDefault()
    if (window.exportGalleryData) {
      window.exportGalleryData()
    }
  }
  
  // Cmd+L: Logout
  if (e.metaKey && e.key === 'l' && !isTyping) {
    e.preventDefault()
    if (confirm('Logout?')) {
      supabase.auth.signOut().then(() => {
        location.reload()
      })
    }
  }
})

// ============================================
// INIT
// ============================================
// ============================================
// STUDENTS MANAGEMENT (SUPERADMIN ONLY)
// ============================================
const SUPERADMIN_EMAIL = 'muhammadgalihpakuan@gmail.com'

function isSuperadmin() {
  return currentUser && currentUser.email === SUPERADMIN_EMAIL
}

function showStudentsTab() {
  const tab = $('#students')
  const navLink = document.querySelector('#nav-students-link')
  if (isSuperadmin()) {
    // Only show the sidebar link; don't force the tab visible via inline styles.
    // Tab visibility should be handled by tab switching (active class).
    if(navLink) navLink.style.display = 'flex'
    // Load students data so it's ready when user opens the tab
    loadStudents()
  } else {
    if(navLink) navLink.style.display = 'none'
    // If the students tab was active for some reason, deactivate it
    if(tab) tab.classList.remove('active')
  }
}

async function loadStudents() {
  try {
    console.log('📚 loadStudents called')
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .order('student_number', { ascending: true })

    console.log('📚 Students fetched:', { data, error })
    if (error) throw error

    // keep a local copy for edit/delete operations
    allStudents = data || []
    console.log('✅ allStudents set to:', allStudents)

    const tbody = $('#students-tbody')
    if(!tbody) {
      console.error('❌ tbody not found!')
      return
    }
    
    tbody.innerHTML = ''

    data.forEach((student) => {
      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td>${student.student_number}</td>
        <td>${student.name}</td>
        <td>${student.email || '-'}</td>
        <td>${student.phone || '-'}</td>
        <td>${student.instagram ? '@' + student.instagram : '-'}</td>
        <td>${student.address ? student.address.substring(0, 30) + '...' : '-'}</td>
        <td>
          <button class="btn-icon" onclick="editStudent(${student.id})" title="Edit"><i data-feather="edit-2"></i></button>
          <button class="btn-icon btn-danger" onclick="deleteStudent(${student.id})" title="Hapus"><i data-feather="trash-2"></i></button>
        </td>
      `
      tbody.appendChild(tr)
    })

    console.log('✅ Students rendered:', data.length, 'rows')
    feather.replace()
  } catch (error) {
    console.error('❌ loadStudents error:', error)
    showToast('❌ Gagal memuat siswa: ' + error.message, 'error')
  }
}

function openStudentForm() {
  if (!isSuperadmin()) {
    showToast('❌ Hanya superadmin yang dapat mengelola siswa', 'error')
    return
  }
  $('#student-form').reset()
  $('#student-id').value = ''
  $('#student-form-title').textContent = 'Tambah Siswa'
  $('#modal-student').classList.remove('hidden')
}

function editStudent(id) {
  if (!isSuperadmin()) return

  const student = allStudents?.find(s => s.id === id)
  if (!student) return

  $('#student-id').value = id
  $('#student-form').student_number.value = student.student_number
  $('#student-form').name.value = student.name
  $('#student-form').email.value = student.email || ''
  $('#student-form').phone.value = student.phone || ''
  $('#student-form').instagram.value = student.instagram || ''
  $('#student-form').address.value = student.address || ''
  $('#student-form-title').textContent = 'Edit Siswa'
  $('#modal-student').classList.remove('hidden')
}

async function deleteStudent(id) {
  if (!isSuperadmin()) return
  if (!confirm('Hapus siswa ini?')) return

  try {
    const { error } = await supabase.from('students').delete().eq('id', id)
    if (error) throw error
    showToast('✅ Siswa dihapus', 'success')
    loadStudents()
  } catch (error) {
    showToast('❌ Gagal hapus: ' + error.message, 'error')
  }
}

let allStudents = []

$('#student-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  if (!isSuperadmin()) return

  const id = $('#student-id').value
  const data = {
    student_number: parseInt($('#student-form').student_number.value),
    name: $('#student-form').name.value,
    email: $('#student-form').email.value || null,
    phone: $('#student-form').phone.value || null,
    instagram: $('#student-form').instagram.value || null,
    address: $('#student-form').address.value || null,
  }

  try {
    let result
    if (id) {
      result = await supabase.from('students').update(data).eq('id', id)
    } else {
      result = await supabase.from('students').insert([data])
    }

    if (result.error) throw result.error
    showToast(id ? '✅ Siswa diperbarui' : '✅ Siswa ditambahkan', 'success')
    $('#modal-student').classList.add('hidden')
    loadStudents()
  } catch (error) {
    showToast('❌ Gagal simpan: ' + error.message, 'error')
  }
})

$('#btn-add-student').addEventListener('click', openStudentForm)

document.querySelector('#modal-student .btn-close').addEventListener('click', () => {
  $('#modal-student').classList.add('hidden')
})

// Expose functions to global scope for inline onclick handlers
window.editStudent = editStudent
window.deleteStudent = deleteStudent
window.openStudentForm = openStudentForm

supabase.auth.getSession().then(({ data, error }) => {
  if (data?.session) {
    currentUser = data.session.user
    showAdminPanel()
    feather.replace()
    initializeAdmin()
  }
})
