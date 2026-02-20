# Railway.app Deployment Guide

## 🚀 Deploy ke Railway (Gratis & Mudah)

Railway adalah platform cloud yang bagus untuk host bot 24/7. Berikut caranya:

### Step 1: Persiapan

1. **Buat akun Railway**
   - Kunjungi: https://railway.app
   - Daftar dengan GitHub (lebih mudah)

2. **Setup Git Repository**
   ```bash
   git add .
   git commit -m "Add cloud deployment config"
   git push
   ```

### Step 2: Deploy Project

1. **Login ke Railway.app**

2. **Klik "New Project"** → "Deploy from GitHub"

3. **Pilih repository:** `10dpib2smekas/27dpib2smeksa`

4. **Select "botwa-new" folder as root** (jika diminta)

5. **Railway akan otomatis detect & deploy**

### Step 3: Login WhatsApp (First Time Only)

1. **Buka Railway Dashboard** → Pilih project → View Logs
2. **Cari QR Code** di terminal output
3. **Scan QR Code dengan WhatsApp ponsel Anda** (sama seperti login lokal)
4. **Setelah login, bot siap berjalan 24/7** ✅

### Step 4: Monitor Bot

**Cek status di Railway Dashboard:**
- Logs → Lihat output & error
- Environment → Set variables (jika perlu)
- Deployments → Riwayat deploy

---

## ⚙️ Konfigurasi Environment (Optional)

Jika ingin set environment variables di Railway:

1. **Di Railway Dashboard**, klik project
2. **Tab "Variables"**
3. **Add:**
   ```
   WEBSITE_URL=https://sebelasdpib2smeksa.netlify.app
   PHOTOS_FOLDER=photos-upload
   ```

---

## 💾 Persistent Storage (Penting!)

Karena Railway menggunakan ephemeral storage, folder photos-upload akan hilang setiap restart.

**Solusi:**
- **Option 1:** Upload foto ke cloud storage (Google Drive, AWS S3, Cloudinary)
- **Option 2:** Gunakan Railway Database
- **Option 3:** Sync ke GitHub setiap upload (advanced)

Untuk sekarang, foto disimpan di container dan akan reset saat Railway restart (jarang terjadi).

---

## 🔄 Auto-Restart & Monitoring

Railway otomatis restart bot jika crash. Untuk monitoring lebih baik:

1. **Set Health Check** (sudah ada di Dockerfile)
2. **Enable restart policy** (default di Railway)
3. **Monitor di logs secara berkala**

---

## 💰 Biaya Railway

- **Free tier:** 5 GB / bulan (cukup untuk bot)
- **Paid:** $5/bulan untuk unlimited

---

## Alternatif: Deploy ke Render.com

Sama seperti Railway, tapi interface berbeda:

1. Kunjungi: https://render.com
2. Connect GitHub
3. Create "New Web Service"
4. Select repository
5. Build command: `npm install`
6. Start command: `node index.js`
7. Deploy!

---

## Troubleshooting

### Bot tidak auto-restart
- Cek Railway logs untuk error
- Pastikan `index.js` tidak crash

### QR Code tidak muncul
- Cek Railway logs (biasanya ada)
- Restart deployment dari Railway dashboard

### Foto tidak tersimpan
- Normal untuk Railway ephemeral storage
- Upload ke cloud storage untuk persistent

---

## Next: Upload Foto ke Cloud Storage

Jika mau foto persistent, update `commands/handler.js` untuk upload ke:
- **Google Drive**
- **Cloudinary** (free tier 25GB)
- **AWS S3**
- **Supabase Storage**

Mau saya bantu setup salah satu? 🚀
