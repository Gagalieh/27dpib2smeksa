# 🤖 WhatsApp Bot - Kelas 11 DPIB 2

Bot WhatsApp otomatis untuk upload foto kenangan kelas ke website secara real-time.

## 🎯 Fitur

- ✅ **Terima Foto via WhatsApp** - Cukup kirim foto dengan caption `!upload`
- ✅ **Auto Upload ke Website** - Foto langsung terupload dan muncul di galeri
- ✅ **Kompresi Otomatis** - Foto otomatis di-compress untuk kualitas web optimal
- ✅ **Tracking Foto** - Semua foto tercatat dengan timestamp dan pengirim
- ✅ **Admin Panel** - Kelola foto yang diupload (opsional)

## 📋 Setup

### 1. Install Dependencies

```bash
cd botwa-new
npm install
```

### 2. Konfigurasi Environment

Buat file `.env` di folder `botwa-new/`:

```env
# WhatsApp
WHATSAPP_PHONE=628xxxxxxxxx  # Nomor WhatsApp Anda (opsional untuk group invite)

# Website
WEBSITE_URL=https://sebelasdpib2smeksa.netlify.app

# Storage
PHOTOS_FOLDER=photos-upload
```

### 3. Jalankan Bot

```bash
npm start
```

Bot akan menampilkan QR Code. **Scan dengan WhatsApp Anda di ponsel** untuk login.

## 🎮 Cara Menggunakan

### User/Anggota Kelas

1. **Kirim foto** ke chat bot (DM atau grup kelas)
2. **Balas pesan** foto dengan: `!upload`
3. **Tunggu konfirmasi** ✅ dari bot
4. **Lihat di website** - Foto akan muncul di galeri dalam beberapa detik

### Command Tersedia

```
!upload        - Upload foto yang baru dikirim
!help          - Tampilkan menu bantuan
!bantuan       - Alias dari !help
!info          - Info tentang bot ini
```

## 📁 Struktur Folder

```
botwa-new/
├── index.js              # Main bot logic
├── package.json          # Dependencies
├── commands/
│   └── handler.js        # Photo upload handler
├── .wwebjs_auth/         # WhatsApp session (auto-generated)
└── .env                  # Environment variables
```

```
root/
├── photos-upload/        # Folder penyimpanan foto
│   ├── index.json        # Metadata semua foto
│   ├── 1234567890-user.jpg
│   ├── 1234567891-user.jpg
│   └── ...
```

## 🚀 Integrasi dengan Website

### Tambah ke index.html

```html
<section id="galeri-bot">
  <h2>📸 Galeri Kiriman Kelas</h2>
  <div id="photo-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
</section>

<script src="js/load-bot-photos.js"></script>
```

### Buat file: `js/load-bot-photos.js`

```javascript
async function loadBotPhotos() {
  try {
    const response = await fetch('/photos-upload/index.json');
    const photos = await response.json();

    const grid = document.getElementById('photo-grid');
    grid.innerHTML = '';

    photos.reverse().forEach((photo) => {
      const img = document.createElement('img');
      img.src = `/photos-upload/${photo.filename}`;
      img.alt = `Foto dari ${photo.sender}`;
      img.className = 'w-full h-auto rounded-lg shadow-lg hover:shadow-xl transition';
      
      const div = document.createElement('div');
      div.className = 'group relative overflow-hidden rounded-lg';
      div.innerHTML = `
        <img src="/photos-upload/${photo.filename}" alt="Foto dari ${photo.sender}" 
             class="w-full h-auto object-cover rounded-lg">
        <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 translate-y-full group-hover:translate-y-0 transition">
          <p class="text-white text-sm">📱 ${photo.sender}</p>
          <p class="text-gray-300 text-xs">${new Date(photo.uploadedAt).toLocaleString('id-ID')}</p>
        </div>
      `;
      grid.appendChild(div);
    });
  } catch (error) {
    console.error('Error loading photos:', error);
  }
}

loadBotPhotos();
```

## ⚙️ Advanced Setup (Opsional)

### Menggunakan PM2 untuk Auto-Restart

```bash
npm install -g pm2
pm2 start index.js --name "dpib2-bot"
pm2 startup
pm2 save
```

### Deploy ke VPS/Server

```bash
# Gunakan screen atau tmux
screen -S bot-dpib2
npm start

# Ctrl+A, Ctrl+D untuk detach
```

## 🛠️ Troubleshooting

### Bot tidak respond
- Pastikan sudah login dengan scan QR code
- Cek konsol untuk error message
- Restart bot: `Ctrl+C` kemudian `npm start`

### Foto tidak terupload
- Periksa folder `photos-upload` sudah ada dan accessible
- Pastikan disk space cukup
- Cek error di console

### QR Code tidak keluar
- Update whatsapp-web.js: `npm update whatsapp-web.js`
- Coba delete folder `.wwebjs_auth` dan jalankan ulang

## 📚 Library yang Digunakan

- **whatsapp-web.js** - WhatsApp Web client
- **sharp** - Image compression
- **express** - API server (opsional)
- **multer** - File upload handling

## 📝 License

MIT

## 👥 Kontributor

Kelas 11 DPIB 2 SMKN 1 Kota Kediri

---

**Pertanyaan?** Hubungi admin atau buat issue di GitHub 💜
