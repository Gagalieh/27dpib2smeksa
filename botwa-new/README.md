# WhatsApp Bot - Kelas 11 DPIB 2

Bot WhatsApp berbasis Baileys untuk alur:
`reply foto -> !upload -> upload Cloudinary (signed) -> insert Supabase gallery`.

## Fitur Production
- Signed upload ke Cloudinary (API key + API secret).
- Insert langsung ke tabel Supabase `gallery` via service role key.
- Rollback Cloudinary jika insert Supabase gagal.
- Health endpoint `GET /health` dan readiness endpoint `GET /ready`.
- Session WhatsApp persisten via `BAILEYS_SESSION_DIR` (disarankan Railway Volume).
- Local index opsional untuk debug (`SAVE_LOCAL_INDEX=true`).

## Requirement
- Node.js 20+
- NPM 10+
- Akun Cloudinary
- Project Supabase

## Environment Variables (Wajib)
Buat file `.env` dari `.env.example`.

```env
NODE_ENV=production
PORT=3000
WEBSITE_URL=https://sebelasdpib2smeksa.netlify.app/#galeri

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_FOLDER=kelas-11-dpib2

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

BAILEYS_SESSION_DIR=/data/session
SAVE_LOCAL_INDEX=false
LOCAL_INDEX_DIR=/data/photos-upload
```

## Local Run
```bash
cd botwa-new
npm install
npm start
```

Saat pertama kali start, scan QR dari terminal.

## Command Bot
- `!help` / `!bantuan`
- `!info`
- `!upload` (wajib reply pesan foto, video ditolak di versi ini)

## Contract Output Upload
`uploadPhotoToWebsite()` akan mengembalikan:
- `success`
- `image_url`
- `cloudinary_public_id`
- `gallery_id`
- `uploaded_at`

## Endpoint Monitoring
- `GET /health` -> status proses hidup
- `GET /ready` -> status koneksi WhatsApp (`open` = ready)

## Catatan Supabase
Bot memakai `SUPABASE_SERVICE_ROLE_KEY`, jadi pastikan key ini hanya disimpan di backend (Railway Variables), jangan di frontend.

## Security Checklist
Setelah deploy:
1. Rotate semua key lama yang pernah hardcoded di source.
2. Pastikan Cloudinary unsigned preset tidak dipakai bot ini.
3. Pastikan `SUPABASE_SERVICE_ROLE_KEY` tidak pernah masuk repo.
