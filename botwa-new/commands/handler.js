const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const axios = require('axios');
const FormData = require('form-data');
const FetchBlob = require('fetch-blob');

// Cloudinary config
const CLOUDINARY_CLOUD_NAME = 'dlwrrojjw';
const CLOUDINARY_UPLOAD_PRESET = 'kelas-unsigned';

/**
 * Detect format dari magic bytes
 */
function detectImageFormat(buffer) {
  if (buffer.length < 4) return 'unknown';
  
  const magic = buffer.slice(0, 4);
  
  // JPEG: FF D8 FF
  if (magic[0] === 0xFF && magic[1] === 0xD8) return 'jpeg';
  
  // PNG: 89 50 4E 47
  if (magic[0] === 0x89 && magic[1] === 0x50) return 'png';
  
  // WEBP: RIFF ... WEBP
  if (magic[0] === 0x52 && magic[1] === 0x49 && buffer.slice(8, 12).toString() === 'WEBP') return 'webp';
  
  // GIF: 47 49 46
  if (magic[0] === 0x47 && magic[1] === 0x49) return 'gif';
  
  return 'unknown';
}

// Supabase config
const SUPABASE_URL = 'https://rsbeptndwdramrcegwhs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzYmVwdG5kd2RyYW1yY2Vnd2hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxNzg1NjgsImV4cCI6MjA4Mjc1NDU2OH0.ClELgv6nOMOdaI2EZWu-zmG19FAlx7iXDujMSCWHkU4';

// Path untuk menyimpan foto lokal (backup)
const PHOTOS_DIR = path.join(__dirname, '../../photos-upload');

// Pastikan folder ada
if (!fs.existsSync(PHOTOS_DIR)) {
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });
}

/**
 * Download media dari WhatsApp dan simpan ke folder lokal
 */
async function downloadMedia(media, sender) {
  try {
    const timestamp = new Date().getTime();
    const senderName = sender.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const filename = `${timestamp}-${senderName}.jpg`;
    const filepath = path.join(PHOTOS_DIR, filename);

    // Decode base64 dan simpan
    const buffer = Buffer.from(media.data, 'base64');
    
    // Compress foto dengan sharp
    await sharp(buffer)
      .resize(1920, 1080, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toFile(filepath);

    console.log(`📸 Foto tersimpan: ${filepath}`);
    return filepath;
  } catch (error) {
    console.error('Error downloading media:', error);
    throw error;
  }
}

/**
 * Upload foto ke Cloudinary - menggunakan FETCH seperti browser
 */
async function uploadPhotoToWebsite(photoPath, sender) {
  try {
    console.log('📤 Preparing upload...');
    
    const fileBuffer = fs.readFileSync(photoPath);
    console.log('📊 File size:', fileBuffer.length, 'bytes');
    
    // Buat Blob-like object untuk fetch
    const blob = new (require('fetch-blob'))(fileBuffer, { type: 'image/jpeg' });
    
    // FormData untuk fetch
    const formData = new (require('form-data'))();
    formData.append('file', blob);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('folder', 'kelas-11-dpib2');
    
    const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
    
    console.log('📤 Uploading to Cloudinary via fetch...');
    
    // Gunakan native fetch (Node 18+)
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });
    
    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch (e) {
      result = { raw: text };
    }
    
    if (!response.ok) {
      console.error('❌ Cloudinary error:', response.status);
      console.error('Response:', result);
      throw new Error(`Cloudinary ${response.status}: ${result.error?.message || 'Upload failed'}`);
    }
    
    console.log('✅ UPLOAD BERHASIL KE CLOUDINARY!');
    console.log('🔗 URL:', result.secure_url);
    
    updatePhotosIndex(path.basename(photoPath), sender, result.secure_url);
    
    return {
      success: true,
      message: 'Foto berhasil diupload',
      url: result.secure_url,
      cloudinary_id: result.public_id,
    };
  } catch (error) {
    console.error('❌ Upload error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Update file index JSON untuk tracking foto
 */
function updatePhotosIndex(filename, sender, url) {
  try {
    const indexPath = path.join(PHOTOS_DIR, 'index.json');
    let photos = [];

    if (fs.existsSync(indexPath)) {
      const data = fs.readFileSync(indexPath, 'utf8');
      photos = JSON.parse(data);
    }

    photos.push({
      id: filename,
      filename: filename,
      sender: sender,
      url: url || `/${filename}`,
      uploadedAt: new Date().toISOString(),
      source: 'whatsapp-bot',
    });

    fs.writeFileSync(indexPath, JSON.stringify(photos, null, 2));
    console.log(`✅ Index diupdate. Total foto: ${photos.length}`);
  } catch (error) {
    console.error('Error updating index:', error);
  }
}

/**
 * Get semua foto untuk ditampilkan di website
 */
function getAllPhotos() {
  try {
    const indexPath = path.join(PHOTOS_DIR, 'index.json');

    if (!fs.existsSync(indexPath)) {
      return [];
    }

    const data = fs.readFileSync(indexPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading photos:', error);
    return [];
  }
}

/**
 * Delete foto tertentu
 */
function deletePhoto(filename) {
  try {
    const filepath = path.join(PHOTOS_DIR, filename);
    const webPath = path.join(__dirname, `../../${PHOTOS_WEB_DIR}/${filename}`);

    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
    if (fs.existsSync(webPath)) {
      fs.unlinkSync(webPath);
    }

    // Update index
    const indexPath = path.join(PHOTOS_DIR, 'index.json');
    if (fs.existsSync(indexPath)) {
      let photos = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      photos = photos.filter((p) => p.filename !== filename);
      fs.writeFileSync(indexPath, JSON.stringify(photos, null, 2));
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting photo:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  downloadMedia,
  uploadPhotoToWebsite,
  getAllPhotos,
  deletePhoto,
};
