const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const axios = require('axios');
const FormData = require('form-data');

// Cloudinary config
const CLOUDINARY_CLOUD_NAME = 'dlwrrojjw';
const CLOUDINARY_UPLOAD_PRESET = 'kelas-unsigned';

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
 * Upload foto ke Cloudinary (media) + Supabase (metadata)
 */
async function uploadPhotoToWebsite(photoPath, sender) {
  try {
    // Baca file dan convert ke base64
    const filedata = fs.readFileSync(photoPath);
    const filename = path.basename(photoPath);
    const base64 = filedata.toString('base64');
    
    console.log('📤 Uploading to Cloudinary...');

    // Upload ke Cloudinary dengan base64
    const formData = new FormData();
    formData.append('file', `data:image/jpeg;base64,${base64}`);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('folder', 'kelas-11-dpib2');
    formData.append('tags', 'whatsapp-bot');

    const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
    
    console.log('🔗 Cloudinary URL:', cloudinaryUrl);
    console.log('📁 Preset:', CLOUDINARY_UPLOAD_PRESET);
    console.log('📊 File size:', filedata.length, 'bytes');

    const cloudResponse = await axios.post(cloudinaryUrl, formData, {
      headers: formData.getHeaders(),
      timeout: 60000,
    });

    const cloudinaryResult = cloudResponse.data;
    console.log('✅ Uploaded to Cloudinary');
    console.log('🔗 URL:', cloudinaryResult.secure_url);

    // Simpan juga ke folder lokal sebagai backup
    const localPath = path.join(PHOTOS_DIR, filename);
    fs.copyFileSync(photoPath, localPath);
    
    // Update index dengan URL Cloudinary
    updatePhotosIndex(filename, sender, cloudinaryResult.secure_url);

    return {
      success: true,
      message: 'Foto berhasil diupload',
      filename: filename,
      url: cloudinaryResult.secure_url,
      cloudinary_id: cloudinaryResult.public_id,
      localPath: localPath,
    };
  } catch (error) {
    console.error('❌ Error uploading to Cloudinary:');
    console.error('  Status:', error.response?.status);
    console.error('  Message:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message,
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
