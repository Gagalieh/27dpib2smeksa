# Railway Deployment Guide (Production Hardened)

Guide ini untuk deploy bot `botwa-new` dengan konfigurasi:
- Cloudinary signed upload
- Supabase service role
- Session WhatsApp persisten via Railway Volume
- Healthcheck `/health`

## 1. Deploy Service
1. Push repo ke GitHub.
2. Buat project di Railway dari repo ini.
3. Pastikan `railway.json` terbaca (builder Dockerfile + watch pattern `botwa-new/**`).

## 2. Tambah Volume (Wajib untuk session WA)
1. Di service Railway, tambahkan volume.
2. Mount path: `/data`.
3. Session akan disimpan di `/data/session` agar tidak scan QR ulang setiap restart.

## 3. Set Environment Variables
Isi semua variabel berikut di tab Variables Railway:

```env
NODE_ENV=production
PORT=3000
WEBSITE_URL=https://sebelasdpib2smeksa.netlify.app/#galeri

CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
CLOUDINARY_FOLDER=kelas-11-dpib2

SUPABASE_URL=https://...supabase.co
SUPABASE_SERVICE_ROLE_KEY=...

BAILEYS_SESSION_DIR=/data/session
SAVE_LOCAL_INDEX=false
LOCAL_INDEX_DIR=/data/photos-upload
```

## 4. First Login WhatsApp
1. Buka Logs deployment.
2. Scan QR pertama dari logs.
3. Setelah connect, cek readiness:
   - `/health` harus `200`
   - `/ready` harus `200`

## 5. Runtime Behavior
- `restartPolicyType=ALWAYS`
- `numReplicas=1` (hindari konflik session WA)
- `requiredMountPath=/data`
- `healthcheckPath=/health`

## 6. Verification Checklist
1. Startup tanpa env wajib -> gagal (expected fail-fast).
2. Bot connect dan bisa `!help`.
3. Reply foto + `!upload` -> sukses.
4. Row baru masuk tabel `gallery` Supabase.
5. Foto terlihat di website (yang membaca `gallery` dari Supabase).
6. Restart deployment -> session tetap login (tanpa scan QR lagi).

## 7. Security Post-Deploy (Wajib)
1. Rotate key lama yang pernah hardcoded.
2. Jangan expose `SUPABASE_SERVICE_ROLE_KEY` ke frontend.
3. Batasi akses Cloudinary API key/secret hanya di Railway.
