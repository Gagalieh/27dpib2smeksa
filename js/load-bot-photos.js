/**
 * Load Bot Photos untuk ditampilkan di website
 * Buat script ini di: js/load-bot-photos.js
 */

async function loadBotPhotos() {
  try {
    // Baca file index.json dari folder photos-upload
    const response = await fetch('/photos-upload/index.json');
    
    if (!response.ok) {
      console.log('Belum ada foto dari bot');
      return;
    }

    const photos = await response.json();
    const photoGrid = document.getElementById('photo-grid');

    if (!photoGrid) {
      console.error('Element #photo-grid tidak ditemukan');
      return;
    }

    // Kosongkan grid
    photoGrid.innerHTML = '';

    // Reverse untuk tampilkan foto terbaru di depan
    photos.reverse().forEach((photo, index) => {
      const photoElement = createPhotoElement(photo);
      photoGrid.appendChild(photoElement);
    });

    console.log(`✅ Loaded ${photos.length} photos from bot`);
  } catch (error) {
    console.error('Error loading bot photos:', error);
  }
}

/**
 * Buat elemen foto dengan hover effect
 */
function createPhotoElement(photo) {
  const container = document.createElement('div');
  container.className = 'relative group overflow-hidden rounded-lg shadow-lg hover:shadow-xl transition-all duration-300';
  container.style.cursor = 'pointer';

  const uploadDate = new Date(photo.uploadedAt);
  const formattedDate = uploadDate.toLocaleDateString('id-ID', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  container.innerHTML = `
    <img src="/photos-upload/${photo.filename}" 
         alt="Foto dari ${photo.sender}" 
         class="w-full h-64 object-cover group-hover:scale-105 transition-transform duration-300"
         loading="lazy">
    
    <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
      <div class="text-white">
        <p class="font-semibold text-lg flex items-center gap-2">
          <span>📱</span>
          <span>${sanitizePhoneNumber(photo.sender)}</span>
        </p>
        <p class="text-gray-300 text-sm">⏰ ${formattedDate}</p>
      </div>
    </div>

    <!-- Optional: Click to view full size -->
    <div class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
      <button class="bg-white/90 hover:bg-white text-gray-900 px-4 py-2 rounded-lg font-semibold transition"
              onclick="viewPhotoFullscreen('/photos-upload/${photo.filename}', '${photo.sender}')">
        👁️ Lihat Besar
      </button>
    </div>
  `;

  return container;
}

/**
 * Sanitize nomor telepon untuk privacy
 */
function sanitizePhoneNumber(phoneOrId) {
  // Jika format: xxxxxxxxxxxx-xxxx, ambil bagian pertama
  if (phoneOrId.includes('-')) {
    const parts = phoneOrId.split('-');
    return parts[parts.length - 1]; // Ambil username/ID
  }
  
  // Jika angka, mask beberapa digit
  if (/^\d+$/.test(phoneOrId)) {
    return phoneOrId.slice(0, 5) + '****' + phoneOrId.slice(-4);
  }

  return phoneOrId;
}

/**
 * Buka foto full size di modal
 */
function viewPhotoFullscreen(src, sender) {
  // Cek apakah sudah ada modal di DOM
  let modal = document.getElementById('photo-modal');
  
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'photo-modal';
    modal.className = 'fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 hidden';
    modal.innerHTML = `
      <div class="relative max-w-4xl w-full max-h-[90vh] flex flex-col">
        <button onclick="document.getElementById('photo-modal').classList.add('hidden')" 
                class="absolute top-2 right-2 bg-white/20 hover:bg-white/40 text-white p-2 rounded-full transition">
          ✕
        </button>
        <img id="modal-photo" src="" alt="" class="w-full h-auto max-h-[85vh] object-contain rounded-lg">
        <div id="modal-info" class="mt-4 text-white text-center"></div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  document.getElementById('modal-photo').src = src;
  document.getElementById('modal-photo').alt = `Foto dari ${sender}`;
  document.getElementById('modal-info').textContent = `Dari: ${sender}`;
  modal.classList.remove('hidden');
}

/**
 * Auto-refresh foto setiap 30 detik (polling untuk bot updates)
 */
let photoRefreshInterval;

function startPhotoRefresh(intervalMs = 30000) {
  console.log('📸 Starting photo auto-refresh every ' + intervalMs / 1000 + 's');
  
  photoRefreshInterval = setInterval(() => {
    loadBotPhotos();
  }, intervalMs);
}

function stopPhotoRefresh() {
  if (photoRefreshInterval) {
    clearInterval(photoRefreshInterval);
    console.log('⏹️ Stopped photo auto-refresh');
  }
}

// Load photos saat page load
document.addEventListener('DOMContentLoaded', () => {
  loadBotPhotos();
  // Auto-refresh setiap 30 detik
  startPhotoRefresh(30000);
});

// Stop refresh saat user meninggalkan halaman
window.addEventListener('beforeunload', () => {
  stopPhotoRefresh();
});
