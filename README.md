# 📚 Digital Kenangan Kelas 11 DPIB 2

Website single-page interaktif modern untuk mengarsipkan kenangan, galeri foto, timeline memories, dan manajemen kelas dengan admin panel lengkap. Dibangun dengan vanilla HTML/CSS/JS + Supabase backend.

## 🌟 Fitur Utama

### Halaman Publik (Public)
- ✨ **Hero Section** - Judul, motto, tautan media sosial yang dinamis
- 👥 **Profil Kelas** - Informasi ketua, wakil, wali kelas dengan foto
- 🖼️ **Galeri Foto** - Layout masonry responsif dengan filter tag real-time dan lightbox
- 🎬 **Memories Timeline** - Timeline vertikal modern dengan rotating foto, info, dan tanggal
- 📅 **Event Countdown** - Kegiatan mendatang dengan real-time countdown timer
- 📝 **Guestbook** - Buku tamu interaktif dengan moderasi pesan
- 🎨 **Dark/Light/Custom Themes** - Tema gelap, terang, sunset, ocean yang dapat ditukar

### Admin Panel (Private)
- 🔐 **Login Aman** - Autentikasi Supabase dengan email/password
- 📊 **Dashboard** - Statistik real-time (total foto, memory, event)
- ⚙️ **Site Configuration** - Edit hero title, motto, footer, social links
- 👤 **Class Profile** - Kelola ketua/wakil/wali dengan foto & Instagram
- 📸 **Gallery Manager** - Upload foto, tagging, bulk actions, preview lightbox
- 🎞️ **Memories CRUD** - Buat memory dengan multiple foto, timeline sorting
- 📋 **Student List** (Superadmin Only) - CRUD daftar siswa dengan validasi
- 📰 **News Management** - Publish/draft artikel
- 🗓️ **Event Management** - CRUD kegiatan dengan date/time
- 💬 **Guestbook Moderasi** - Approve/delete pesan dari pengunjung

## 📁 Struktur File

```
web/
├── index.html              # Halaman publik utama (responsive)
├── admin.html              # Admin panel (akses terbatas)
├── script.js               # Logic halaman publik (legacy)
├── admin.js                # Logic admin panel dengan Supabase
├── config.js               # Konfigurasi API Supabase (IMPORTANT)
├── schema.sql              # Database schema lengkap + RLS policies
├── robots.txt              # SEO: disallow admin & config
├── sitemap.xml             # SEO: daftar halaman untuk search engine
├── .htaccess               # Server: gzip, cache, security headers, redirects
├── DEPLOY.md               # Panduan lengkap deploy & setup (BACA INI!)
└── README.md               # File ini
```

## 🔧 Setup Cepat (Development)

### 1. Persiapan Database Supabase

1. Buka [Supabase Dashboard](https://app.supabase.com)
2. Buat project baru atau gunakan existing
3. Catat **Project URL** dan **Anon Key** (di Settings > API)
4. Buka **SQL Editor** → **New Query**
5. Copy-paste seluruh `schema.sql`
6. Jalankan (Run)
7. Tunggu sampai semua table, function, policy terbuat

### 2. Setup config.js

Buat file `config.js` di folder `web/`:

```javascript
window.CONFIG = {
  SUPABASE_URL: 'https://xxxxx.supabase.co',  // dari Supabase Settings > API
  SUPABASE_ANON_KEY: 'eyJhbGc...'             // dari Supabase Settings > API (public key)
}
```

⚠️ **JANGAN** gunakan SECRET KEY! Hanya ANON KEY yang bersifat public.

### 3. Setup Admin User

Di Supabase Dashboard > Authentication > Users:
1. Buat user baru dengan email: `muhammadgalihpakuan@gmail.com`, password: `742009gal`
2. Copy UUID user tersebut
3. Buka SQL Editor, jalankan:

```sql
INSERT INTO admins (user_id, email, role) VALUES ('<PASTE_UUID_HERE>', 'muhammadgalihpakuan@gmail.com', 'superadmin');
```

### 4. Local Testing

```bash
# Opsi 1: Python server
cd web
python -m http.server 8000

# Opsi 2: Node http-server (install terlebih dahulu)
npm install -g http-server
http-server web -p 8000

# Buka browser: http://localhost:8000
```

## 🎯 Cara Menggunakan

### Login Admin
1. Buka `http://localhost:8000/admin.html`
2. Login dengan email/password (yang sudah dibuat di Supabase)
3. Tunggu dashboard muncul

### Upload Galeri
- Klik tab "📸 Galeri Upload"
- Pilih foto, isi judul/caption
- Assign tags (Outing, Kegiatan, dll)
- Klik "Upload"

### Kelola Memories
- Klik tab "🎬 Memories"
- Klik "Tambah Memory"
- Isi judul, tanggal, deskripsi
- Pilih foto dari galeri yang sudah upload
- Klik "Simpan"

### Kelola Siswa (Superadmin Only)
- Login dengan `muhammadgalihpakuan@gmail.com`
- Klik tab "📋 Siswa" (hanya muncul untuk superadmin)
- Klik "Tambah Siswa"
- Isi nomor, nama, email, telepon, Instagram, alamat
- Klik "Simpan"

## ⚙️ Teknologi

- **Frontend**: HTML5, CSS3 (custom properties), Vanilla JavaScript (ES6+)
- **Backend**: Supabase (PostgreSQL + REST API + RLS)
- **Auth**: Supabase Auth (email/password)
- **Storage**: Supabase Storage (image upload)
- **UI Components**: Feather Icons (CDN), Masonry Layout (CDN)
- **Styling**: CSS Grid, Flexbox, Media Queries, CSS Variables

## 🔒 Security

- ✅ Row-Level Security (RLS) di semua table
- ✅ Admin & superadmin roles terpisah
- ✅ Password terenkripsi (Supabase Auth)
- ✅ Public data: site_config, class_profile, gallery (public), memories, events
- ✅ Protected data: students (admin only), guestbook (moderated)
- ✅ Robots.txt: block admin & config dari crawlers
- ✅ HTTPS redirect di .htaccess

## 📱 Responsiveness

- ✅ Mobile-first design (tested 320px - 1400px)
- ✅ Navbar sticky dengan icon-only mode saat scroll
- ✅ Galeri: 1 kolom (mobile), 2-3 (tablet), 3-4 (desktop)
- ✅ Timeline memories: vertical flex di mobile, alternating di desktop
- ✅ Touch-friendly buttons & inputs

## 🌈 Themes Tersedia

1. **Dark** (default) - Purple primary
2. **Light** - Indigo primary
3. **Sunset** - Orange & pink
4. **Ocean** - Cyan & blue

Tema disimpan di localStorage, auto-load saat revisit.

## 📊 Database Schema

### Main Tables
- `site_config` - Konfigurasi site (title, motto, footer, social links)
- `class_profile` - Profil kelas (ketua, wakil, wali, student count)
- `gallery` - Foto galeri (image_url, title, caption, status)
- `tags` - Tag galeri (name, slug, color)
- `gallery_tags` - Relasi foto & tag (many-to-many)
- `memories` - Memories timeline (title, description, date)
- `memory_photos` - Foto per memory (memory_id, gallery_id, position)
- `events` - Kegiatan (title, date, time, location)
- `guestbook` - Buku tamu (name, email, message, approved)
- `students` - Daftar siswa (name, nomor, email, phone, instagram, address) [Admin Only]
- `admins` - Authorised users (user_id, email, role)

### Helper Functions
- `set_updated_at_column()` - Trigger untuk update `updated_at` field
- `is_admin_user()` - Check apakah user ada di `admins` table

## 🚀 Deploy

**BACA FILE `DEPLOY.md` UNTUK PANDUAN LENGKAP!**

Opsi deploy:
1. **Vercel** (recommended) - Push ke GitHub, auto-deploy
2. **Netlify** - Similar dengan Vercel
3. **GitHub Pages** - Static hosting gratis
4. **Traditional Hosting** - cPanel, direct server, VPS

## 🐛 Troubleshooting

### Q: Foto tidak muncul di galeri
**A**: Check gallery `status = 'public'` di database, atau upload ulang

### Q: Filter tag tidak jalan
**A**: Pastikan checkbox event listener aktif (sudah fixed di index.html line ~1775)

### Q: Admin login gagal
**A**: Pastikan user sudah di `admins` table, dan email verified di Supabase Auth

### Q: Siswa tab tidak muncul
**A**: Hanya superadmin (`muhammadgalihpakuan@gmail.com`) yang bisa lihat tab ini

### Q: Config not found error
**A**: Pastikan `config.js` ada di folder root `web/` dengan content yang benar

## 📞 Support

- Check `DEPLOY.md` untuk panduan lengkap
- Check browser console (F12 > Console) untuk error messages
- Verifikasi di Supabase Dashboard bahwa project & data sudah setup

## 📄 License

Project ini dibuat untuk Kelas 11 DPIB 2 SMKN 1 Kota Kediri. Bebas dimodifikasi sesuai kebutuhan.

### 2. Setup Cloudinary Upload

1. Buka [Cloudinary Dashboard](https://cloudinary.com/console)
2. Cari **Upload Presets** di Settings
3. Buat preset baru dengan nama: `kenangan_kelas`
4. Set Type: **Unsigned**
5. Simpan nama preset di `config.js`

### 3. Serve Locally

```bash
# Python 3
cd web
python -m http.server 8000

# Atau dengan Node
npx http-server web -p 8000
```

Buka `http://localhost:8000`

### 4. Deploy ke Hosting

Pilih salah satu:

**Vercel / Netlify** (Recommended)
- Push folder `web` ke GitHub
- Connect ke Vercel/Netlify
- Deploy otomatis

**GitHub Pages**
```bash
# Ganti USERNAME dan REPO_NAME
git remote set-url origin https://github.com/USERNAME/REPO_NAME.git
git push -u origin main
```

Aktifkan Pages di repository settings.

## 🔑 Login Admin

**Email:** `27dpib2@smeksa.com`
**Password:** `27dpib2.smeksa`

> Ganti password setelah login pertama!

## 📋 Konfigurasi

Edit `config.js` jika diperlukan:

```javascript
window.CONFIG = {
  SUPABASE_URL: 'https://rsbeptndwdramrcegwhs.supabase.co',
  SUPABASE_ANON_KEY: '...', // Your key here
  CLOUDINARY: {
    CLOUD_NAME: 'dlwrrojjw',
    UPLOAD_PRESET: 'kenangan_kelas'
  }
};
```

## 🎨 Customization

### Warna Tema
Edit `:root` di `style.css`:
```css
:root {
  --primary: #7c3aed;      /* Ungu */
  --secondary: #0ea5e9;    /* Biru */
  --danger: #ef4444;       /* Merah */
}
```

### Logo & Brand
- Ubah hero title di **Admin > Site Config**
- Upload logo di Cloudinary, set URL di config form

### Social Media
Edit di **Admin > Site Config** > Instagram, YouTube, WhatsApp

## 📸 Upload Foto

1. Login ke admin
2. Pilih **Gallery**
3. Drag-and-drop atau browse file
4. Foto otomatis dikompresi dan diupload ke Cloudinary
5. URL disimpan ke Supabase

## 🎬 Membuat Memories

1. **Admin > Memories**
2. Klik **+ Tambah Memory Baru**
3. Masukkan judul
4. Pilih foto dari galeri (bisa multiple)
5. Atur urutan tampil di **position**

## 📰 Membuat Berita

1. **Admin > Berita**
2. **+ Tambah Berita Baru**
3. Isi judul, ringkasan, konten
4. Set status: **Draft** atau **Publish**
5. Hanya berita publish yang tampil di publik

## 🗓️ Kegiatan & Event

1. **Admin > Kegiatan**
2. **+ Tambah Kegiatan Baru**
3. Masukkan judul, deskripsi, tanggal
4. Countdown otomatis untuk event mendatang

## 💬 Guestbook

- Pengunjung bisa mengirim pesan tanpa login
- Admin bisa moderasi (hapus pesan)
- Pesan tidak bisa diedit oleh pengunjung

## 🌐 Browser Support

- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

## 📞 Support & Troubleshooting

### Upload foto tidak bisa
- Pastikan upload preset Cloudinary sudah dibuat
- Check preset name di `config.js`
- Verify CORS di Cloudinary settings

### Login gagal
- Pastikan user sudah terdaftar di Supabase Auth
- Check email & password
- Verify RLS policies di Supabase

### Foto tidak muncul
- Pastikan status foto: **public** (di database)
- Check URL Cloudinary masih valid
- Verify Supabase anon key

## 📝 License

Created for Kelas 11 DPIB 2 - SMKN 1 Kota Kediri

---

**Made with ❤️ for your class memories**
