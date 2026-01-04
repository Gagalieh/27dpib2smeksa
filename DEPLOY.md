# 🚀 DEPLOY CHECKLIST - Digital Kenangan Kelas 11 DPIB 2

## Pre-Deploy

### 1. Database Setup (Supabase)
- [ ] Buat project Supabase baru
- [ ] Jalankan semua SQL dari `schema.sql` di SQL Editor (copy-paste keseluruhan)
  - Perhatikan: `IF NOT EXISTS` sudah diganti dengan `DROP POLICY IF EXISTS`
- [ ] Pastikan semua table dan RLS policies terbuat
- [ ] Test: SELECT dari `site_config`, `class_profile`, `tags`

### 2. Create Superadmin & Admin
```sql
-- Dapatkan UUID user dari Supabase Auth
-- Di Supabase Dashboard > Authentication > Users, copy UUID user

-- Run di SQL Editor:
INSERT INTO admins (user_id, email, role) VALUES ('<USER_UUID_ADMIN>', 'admin@example.com', 'admin');
INSERT INTO admins (user_id, email, role) VALUES ('<USER_UUID_SUPERADMIN>', 'muhammadgalihpakuan@gmail.com', 'superadmin');
```

### 3. Konfigurasi Environment
- [ ] Buat file `config.js`:
```javascript
window.CONFIG = {
  SUPABASE_URL: 'https://xxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
}
```
- [ ] Pastikan key PUBLIC (anon key), bukan secret key
- [ ] Jangan commit secret key ke git

### 4. Masukan Data Awal
- [ ] Update `site_config` table (di admin panel atau SQL):
  - `hero_title`, `hero_subtitle`, `hero_motto`, `footer_text`
  - Social media links: `instagram_url`, `youtube_url`, `tiktok_url`, `whatsapp_url`
- [ ] Update `class_profile` table:
  - Ketua, Wakil, Wali kelas (nama, foto, Instagram)
  - School name, total students
- [ ] Upload foto galeri di admin panel
- [ ] Buat memories dengan foto terkait
- [ ] Buat events mendatang
- [ ] Buat daftar siswa (superadmin only)

### 5. Test Fitur
- [ ] Homepage load tanpa error
- [ ] Navbar sticky saat scroll
- [ ] Theme toggle (dark, light, sunset, ocean) berfungsi
- [ ] Galeri foto muncul dan filter tag berfungsi
- [ ] Memories timeline tampil dengan rotating foto
- [ ] Event countdown jalan
- [ ] Guestbook dapat submit pesan
- [ ] Login admin berfungsi
- [ ] Siswa tab hanya muncul untuk superadmin
- [ ] CRUD siswa (tambah, edit, hapus) berfungsi
- [ ] SEO: buka di DevTools > Lighthouse, audit SEO minimal 90

---

## Deploy

### Opsi 1: Vercel (Recommended)
```bash
# 1. Push ke GitHub
git init
git add .
git commit -m "Initial commit"
git push -u origin main

# 2. Import di Vercel
# - Buka vercel.com
# - Klik "New Project"
# - Select GitHub repo
# - Vercel otomatis build & deploy

# 3. Setup custom domain
# - Vercel Dashboard > Settings > Domains
# - Tambah domain kamu
# - Update DNS records sesuai instruksi Vercel
```

### Opsi 2: Netlify
```bash
# 1. Install Netlify CLI
npm install -g netlify-cli

# 2. Deploy
netlify deploy --prod

# 3. Setup custom domain
# - Netlify Dashboard > Domain management
# - Tambah custom domain
# - Update DNS
```

### Opsi 3: GitHub Pages (Static Hosting)
```bash
# 1. Repository harus public
# 2. Settings > Pages
# 3. Build and deployment:
#    - Source: Deploy from a branch
#    - Branch: main
# 4. Vercel otomatis build & publish ke github.io
```

### Opsi 4: Hosting Manual (cPanel, Direct Server)
```bash
# 1. Upload file via FTP/SSH
# - index.html, style.css, script.js, admin.html, admin.js
# - config.js (jangan lupa ganti URL Supabase!)
# - robots.txt, sitemap.xml, .htaccess
# - assets folder (jika ada)

# 2. Pastikan server support:
# - PHP 7.4+ (jika pakai backend, sekarang gak perlu—Supabase sudah jadi backend)
# - HTTPS (penting untuk keamanan)
# - Gzip compression aktif

# 3. Aktifkan di cPanel:
# - AutoSSL (untuk HTTPS)
# - Gzip Compression
# - Rewrite rules dari .htaccess
```

---

## Post-Deploy

### 1. Test Production
- [ ] Buka website di domain final
- [ ] Test semua fitur (sama seperti Pre-Deploy #5)
- [ ] Test mobile responsiveness (buka di HP)
- [ ] Test performa di slow 3G (DevTools > Network)
- [ ] Check console di DevTools untuk error

### 2. SEO & Monitoring
- [ ] Submit sitemap.xml ke Google Search Console
- [ ] Submit ke Google Analytics (optional)
- [ ] Cek backlink & domain authority (optional)
- [ ] Monitor uptime (uptime robot, pingdom)

### 3. Security Check
- [ ] `config.js` tidak expose secret key ✅
- [ ] Admin page (`admin.html`) terlindungi RLS ✅
- [ ] Guestbook spam filter jalan ✅
- [ ] HTTPS aktif & certificate valid ✅

### 4. Backup Setup
- [ ] Set up automated backup Supabase (Project Settings > Database > Backups)
- [ ] Backup config.js & repository di GitHub

---

## Troubleshooting

### Error: "Cannot POST /rest/v1/..."
- [ ] Check SUPABASE_URL & ANON_KEY di config.js
- [ ] Pastikan Supabase project active

### Foto tidak muncul di galeri
- [ ] Check image URL valid & accessible
- [ ] Check gallery status = 'public' di database
- [ ] Check CORS di Supabase (biasanya auto, gak perlu setup)

### Siswa tab tidak muncul
- [ ] User harus login dengan email `muhammadgalihpakuan@gmail.com`
- [ ] User harus ada di `admins` table
- [ ] Check RLS policies di students table

### Filter tag tidak jalan
- [ ] Check tag checkbox event listener di index.html
- [ ] Verify tag.id match dengan gallery_tags.tag_id
- [ ] Check `currentPage` reset ke 1

### Admin login tidak berfungsi
- [ ] Verifikasi email di Supabase Auth
- [ ] Check password benar & akun aktif
- [ ] Check session valid (auth.getSession())

---

## Performance Tips

1. **Lazy Loading**: Aktif pada semua gambar (`loading="lazy"`)
2. **Image Optimization**: Gunakan WebP format jika memungkinkan
3. **Minify**: Sebelum deploy, run:
   ```bash
   # Install terlebih dahulu
   npm install -g terser csso-cli

   # Minify JS & CSS (optional)
   terser index.html -c -m -o index.min.html
   ```
4. **CDN**: Sudah pakai cdn.jsdelivr.net untuk Feather Icons & Masonry
5. **Caching**: `.htaccess` sudah setup cache headers

---

## Maintenance

- **Weekly**: Check guestbook, moderate spam
- **Monthly**: Review analytics, update content
- **Quarterly**: Update dependencies (jika pakai npm packages)
- **Yearly**: Renew SSL certificate, backup database

---

✅ **Siap Deploy!** Hubungi tech support jika ada yang tidak jelas.
