const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const axios = require('axios');
const FormData = require('form-data');

// Path untuk menyimpan foto
const PHOTOS_DIR = path.join(__dirname, '../../photos-upload');
const PHOTOS_WEB_DIR = 'photos-upload'; // Folder di root website

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
 * Upload foto ke website (via API atau direct file)
 */
async function uploadPhotoToWebsite(photoPath, sender) {
  try {
    const filename = path.basename(photoPath);
    const filedata = fs.readFileSync(photoPath);

    // Opsi 1: Jika ada backend API
    // (Uncomment jika sudah ada backend API untuk handle upload)
    /*
    const formData = new FormData();
    formData.append('file', filedata, filename);
    formData.append('sender', sender);

    const response = await axios.post(
      'https://sebelasdpib2smeksa.netlify.app/api/upload',
      formData,
      { headers: formData.getHeaders() }
    );

    return { success: true, data: response.data };
    */

    // Opsi 2: Simpan langsung ke folder yang bisa diakses website
    // (Lebih sederhana untuk setup awal)
    const webPath = path.join(
      __dirname,
      `../../${PHOTOS_WEB_DIR}/${filename}`
    );

    fs.copyFileSync(photoPath, webPath);

    // Update atau buat file index JSON untuk tracking
    updatePhotosIndex(filename, sender);

    return {
      success: true,
      message: 'Foto berhasil disimpan',
      filename: filename,
      url: `/${PHOTOS_WEB_DIR}/${filename}`,
    };
  } catch (error) {
    console.error('Error uploading to website:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Update file index JSON untuk tracking foto
 */
function updatePhotosIndex(filename, sender) {
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
      uploadedAt: new Date().toISOString(),
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
