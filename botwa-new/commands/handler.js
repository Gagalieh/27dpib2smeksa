require('dotenv').config();

const path = require('path');
const fs = require('fs');
const os = require('os');
const sharp = require('sharp');
const { v2: cloudinary } = require('cloudinary');
const { createClient } = require('@supabase/supabase-js');

const REQUIRED_ENV_VARS = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'CLOUDINARY_FOLDER',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SAVE_LOCAL_INDEX',
  'LOCAL_INDEX_DIR',
];

const missingEnvVars = REQUIRED_ENV_VARS.filter(
  (key) => !process.env[key] || !process.env[key].trim()
);

if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required environment variables in handler: ${missingEnvVars.join(', ')}`
  );
}

function parseBoolean(input) {
  const normalized = String(input || '')
    .trim()
    .toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SAVE_LOCAL_INDEX = parseBoolean(process.env.SAVE_LOCAL_INDEX);
const LOCAL_INDEX_DIR = path.resolve(process.env.LOCAL_INDEX_DIR);
const TEMP_WORK_DIR = path.join(os.tmpdir(), 'botwa-new-media');

if (!fs.existsSync(TEMP_WORK_DIR)) {
  fs.mkdirSync(TEMP_WORK_DIR, { recursive: true });
}
if (SAVE_LOCAL_INDEX && !fs.existsSync(LOCAL_INDEX_DIR)) {
  fs.mkdirSync(LOCAL_INDEX_DIR, { recursive: true });
}

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
  secure: true,
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function localIndexPath() {
  return path.join(LOCAL_INDEX_DIR, 'index.json');
}

function sanitizeForFilename(input) {
  return String(input || 'unknown')
    .replace(/[^a-z0-9]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function removeFileIfExists(filePath) {
  if (!filePath) {
    return;
  }
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.warn(`Failed deleting file ${filePath}:`, error.message);
  }
}

async function downloadMedia(media, sender) {
  try {
    const timestamp = Date.now();
    const senderName = sanitizeForFilename(sender);
    const filename = `${timestamp}-${senderName}.jpg`;
    const filepath = path.join(TEMP_WORK_DIR, filename);

    const buffer = Buffer.from(media.data, 'base64');
    await sharp(buffer)
      .resize(1920, 1080, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85, progressive: true })
      .toFile(filepath);

    return filepath;
  } catch (error) {
    console.error('Error downloading media:', error);
    throw error;
  }
}

async function optimizeImageBuffer(photoPath) {
  const sourceBuffer = fs.readFileSync(photoPath);

  try {
    return await sharp(sourceBuffer)
      .resize(1920, 1080, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toFormat('jpeg', { quality: 85, progressive: true })
      .toBuffer();
  } catch (error) {
    console.warn('Sharp optimization failed, using source buffer:', error.message);
    return sourceBuffer;
  }
}

async function rollbackCloudinaryUpload(publicId) {
  if (!publicId) {
    return;
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: 'image',
      invalidate: true,
    });

    if (result?.result !== 'ok' && result?.result !== 'not found') {
      console.warn('Unexpected Cloudinary rollback response:', result);
    }
  } catch (error) {
    console.error('Cloudinary rollback failed:', error.message);
  }
}

function buildGalleryPayload(sender, cloudinaryResult, fileSize, context = {}) {
  const senderShort = String(sender || '').split('@')[0] || 'unknown';
  const today = new Date().toISOString().split('T')[0];
  const quotedShort = context.quoted_participant
    ? String(context.quoted_participant).split('@')[0]
    : null;
  const defaultCaption = quotedShort
    ? `Dikirim via WhatsApp oleh ${senderShort} (quoted: ${quotedShort})`
    : `Dikirim via WhatsApp oleh ${senderShort}`;

  return {
    image_url: cloudinaryResult.secure_url,
    title: context.title || `Kiriman WhatsApp ${today}`,
    caption: context.caption || defaultCaption,
    status: 'public',
    file_size: Number(cloudinaryResult.bytes || fileSize || 0),
  };
}

function updatePhotosIndex(entry) {
  if (!SAVE_LOCAL_INDEX) {
    return;
  }

  const indexPath = localIndexPath();
  let photos = [];

  if (!fs.existsSync(LOCAL_INDEX_DIR)) {
    fs.mkdirSync(LOCAL_INDEX_DIR, { recursive: true });
  }

  if (fs.existsSync(indexPath)) {
    try {
      photos = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      if (!Array.isArray(photos)) {
        photos = [];
      }
    } catch (error) {
      console.warn('Failed reading existing local index, recreating file.');
      photos = [];
    }
  }

  photos.push(entry);
  fs.writeFileSync(indexPath, JSON.stringify(photos, null, 2));
}

async function uploadPhotoToWebsite(photoPath, sender, context = {}) {
  let tempPath = null;
  let cloudinaryResult = null;

  try {
    const jpegBuffer = await optimizeImageBuffer(photoPath);
    tempPath = `${photoPath}.upload.jpg`;
    fs.writeFileSync(tempPath, jpegBuffer);

    cloudinaryResult = await cloudinary.uploader.upload(tempPath, {
      folder: CLOUDINARY_FOLDER,
      resource_type: 'image',
      overwrite: false,
      unique_filename: true,
      use_filename: false,
    });

    const payload = buildGalleryPayload(sender, cloudinaryResult, jpegBuffer.length, context);
    const { data, error } = await supabase
      .from('gallery')
      .insert(payload)
      .select('id, created_at')
      .single();

    if (error) {
      await rollbackCloudinaryUpload(cloudinaryResult.public_id);
      return {
        success: false,
        error: `Supabase insert failed: ${error.message}`,
      };
    }

    const uploadedAt = data?.created_at || new Date().toISOString();

    updatePhotosIndex({
      id: data?.id || cloudinaryResult.public_id,
      filename: path.basename(photoPath),
      sender,
      url: cloudinaryResult.secure_url,
      cloudinary_public_id: cloudinaryResult.public_id,
      gallery_id: data?.id || null,
      uploadedAt,
      source: 'whatsapp-bot',
    });

    return {
      success: true,
      message: 'Foto berhasil diupload',
      image_url: cloudinaryResult.secure_url,
      url: cloudinaryResult.secure_url,
      cloudinary_public_id: cloudinaryResult.public_id,
      gallery_id: data?.id || null,
      uploaded_at: uploadedAt,
    };
  } catch (error) {
    console.error('Upload error:', error.message);

    if (cloudinaryResult?.public_id) {
      await rollbackCloudinaryUpload(cloudinaryResult.public_id);
    }

    return {
      success: false,
      error: error.message,
    };
  } finally {
    removeFileIfExists(tempPath);
  }
}

function getAllPhotos() {
  if (!SAVE_LOCAL_INDEX) {
    return [];
  }

  try {
    const indexPath = localIndexPath();
    if (!fs.existsSync(indexPath)) {
      return [];
    }

    const data = fs.readFileSync(indexPath, 'utf8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Error reading local photos index:', error);
    return [];
  }
}

function deletePhoto(identifier) {
  if (!SAVE_LOCAL_INDEX) {
    return { success: true, message: 'Local index is disabled.' };
  }

  try {
    const indexPath = localIndexPath();
    if (!fs.existsSync(indexPath)) {
      return { success: true };
    }

    const photos = getAllPhotos();
    const removed = photos.filter(
      (photo) =>
        photo.filename === identifier ||
        String(photo.id) === String(identifier) ||
        photo.cloudinary_public_id === identifier
    );

    const kept = photos.filter(
      (photo) =>
        photo.filename !== identifier &&
        String(photo.id) !== String(identifier) &&
        photo.cloudinary_public_id !== identifier
    );

    removed.forEach((photo) => {
      if (photo?.filename) {
        const localFilePath = path.join(LOCAL_INDEX_DIR, photo.filename);
        removeFileIfExists(localFilePath);
      }
    });

    fs.writeFileSync(indexPath, JSON.stringify(kept, null, 2));
    return { success: true };
  } catch (error) {
    console.error('Error deleting local photo index entry:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  downloadMedia,
  uploadPhotoToWebsite,
  getAllPhotos,
  deletePhoto,
};
