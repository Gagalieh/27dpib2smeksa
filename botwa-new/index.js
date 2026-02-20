require('dotenv').config();

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  isJidBroadcast,
  downloadMediaMessage,
} = require('@whiskeysockets/baileys');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const QRCode = require('qrcode');

const REQUIRED_ENV_VARS = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'CLOUDINARY_FOLDER',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'PORT',
  'BAILEYS_SESSION_DIR',
  'SAVE_LOCAL_INDEX',
  'LOCAL_INDEX_DIR',
];

const missingEnvVars = REQUIRED_ENV_VARS.filter(
  (key) => !process.env[key] || !process.env[key].trim()
);

if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:');
  missingEnvVars.forEach((key) => console.error(`- ${key}`));
  process.exit(1);
}

const PORT = Number(process.env.PORT);
if (!Number.isInteger(PORT) || PORT <= 0) {
  console.error(`Invalid PORT value: "${process.env.PORT}"`);
  process.exit(1);
}

function parseBoolean(input) {
  const normalized = String(input || '')
    .trim()
    .toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function parsePositiveInt(input, fallback) {
  const value = Number(input);
  if (!Number.isInteger(value) || value <= 0) {
    return fallback;
  }
  return value;
}

const SAVE_LOCAL_INDEX = parseBoolean(process.env.SAVE_LOCAL_INDEX);
const SESSION_PATH = path.resolve(process.env.BAILEYS_SESSION_DIR);
const LOCAL_INDEX_DIR = path.resolve(process.env.LOCAL_INDEX_DIR);
const TEMP_MEDIA_DIR = path.join(os.tmpdir(), 'botwa-new-media');
const WEBSITE_URL =
  process.env.WEBSITE_URL || 'https://sebelasdpib2smeksa.netlify.app/#galeri';
const MAX_RECENT_IMAGE_CACHE = parsePositiveInt(
  process.env.MAX_RECENT_IMAGE_CACHE,
  250
);
const ALBUM_FALLBACK_WINDOW_SECONDS = parsePositiveInt(
  process.env.ALBUM_FALLBACK_WINDOW_SECONDS,
  45
);
const ALBUM_CACHE_TTL_SECONDS = parsePositiveInt(
  process.env.ALBUM_CACHE_TTL_SECONDS,
  86400
);

if (!fs.existsSync(SESSION_PATH)) {
  fs.mkdirSync(SESSION_PATH, { recursive: true });
}
if (!fs.existsSync(TEMP_MEDIA_DIR)) {
  fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}
if (SAVE_LOCAL_INDEX && !fs.existsSync(LOCAL_INDEX_DIR)) {
  fs.mkdirSync(LOCAL_INDEX_DIR, { recursive: true });
}

const { uploadPhotoToWebsite } = require('./commands/handler');

console.log('====================================');
console.log('WhatsApp Bot Starting...');
console.log('====================================');
console.log(`Session path      : ${SESSION_PATH}`);
console.log(`Temp media path   : ${TEMP_MEDIA_DIR}`);
console.log(`Local index path  : ${LOCAL_INDEX_DIR}`);
console.log(`Save local index  : ${SAVE_LOCAL_INDEX}`);

let connectionState = 'close';
let reconnectTimer = null;
let currentSocket = null;
let healthServer = null;
let recentImageMessages = [];

const quietLogger = pino({ level: 'silent' });

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function startHealthServer() {
  if (healthServer) {
    return;
  }

  healthServer = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);

    if (requestUrl.pathname === '/health') {
      writeJson(res, 200, {
        status: 'ok',
        uptime_seconds: Math.round(process.uptime()),
        pid: process.pid,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (requestUrl.pathname === '/ready') {
      const ready = connectionState === 'open';
      writeJson(res, ready ? 200 : 503, {
        status: ready ? 'ready' : 'not_ready',
        connection_state: connectionState,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    writeJson(res, 404, {
      status: 'not_found',
      path: requestUrl.pathname,
    });
  });

  healthServer.listen(PORT, () => {
    console.log(`Health server listening on port ${PORT}`);
  });
}

function sanitizeForFilename(input) {
  return String(input || 'unknown')
    .replace(/[^a-z0-9]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function resolveParticipantId(msg, fallback = 'unknown') {
  return msg?.key?.participant || msg?.key?.remoteJid || fallback;
}

function normalizeMessageContent(rawMessage) {
  let content = rawMessage || {};
  let keepUnwrapping = true;

  while (keepUnwrapping && content) {
    keepUnwrapping = false;
    if (content?.ephemeralMessage?.message) {
      content = content.ephemeralMessage.message;
      keepUnwrapping = true;
      continue;
    }
    if (content?.viewOnceMessage?.message) {
      content = content.viewOnceMessage.message;
      keepUnwrapping = true;
      continue;
    }
    if (content?.viewOnceMessageV2?.message) {
      content = content.viewOnceMessageV2.message;
      keepUnwrapping = true;
      continue;
    }
    if (content?.viewOnceMessageV2Extension?.message) {
      content = content.viewOnceMessageV2Extension.message;
      keepUnwrapping = true;
      continue;
    }
    if (content?.documentWithCaptionMessage?.message) {
      content = content.documentWithCaptionMessage.message;
      keepUnwrapping = true;
      continue;
    }
  }

  return content || {};
}

function getImageMessage(rawMessage) {
  const content = normalizeMessageContent(rawMessage);
  return content?.imageMessage || null;
}

function getVideoMessage(rawMessage) {
  const content = normalizeMessageContent(rawMessage);
  return content?.videoMessage || null;
}

function getAlbumMessage(rawMessage) {
  const content = normalizeMessageContent(rawMessage);
  return content?.albumMessage || null;
}

function bytesToBase64(input) {
  if (!input) {
    return null;
  }
  if (typeof input === 'string') {
    return input;
  }
  if (Buffer.isBuffer(input)) {
    return input.toString('base64');
  }
  if (input instanceof Uint8Array) {
    return Buffer.from(input).toString('base64');
  }
  return null;
}

function extractAlbumGroupId(rawMessage) {
  const content = normalizeMessageContent(rawMessage);
  const imageContext = content?.imageMessage?.contextInfo || {};
  const albumContext = content?.albumMessage?.contextInfo || {};
  const messageContext = content?.messageContextInfo || {};

  const candidates = [
    imageContext?.mediaGroupId,
    imageContext?.groupId,
    imageContext?.groupedId,
    imageContext?.parentGroupId,
    imageContext?.placeholderKey?.id
      ? `placeholder:${imageContext.placeholderKey.id}`
      : null,
    imageContext?.messageSecret
      ? `image-secret:${bytesToBase64(imageContext.messageSecret)}`
      : null,
    albumContext?.messageSecret
      ? `album-secret:${bytesToBase64(albumContext.messageSecret)}`
      : null,
    messageContext?.messageSecret
      ? `message-secret:${bytesToBase64(messageContext.messageSecret)}`
      : null,
    albumContext?.stanzaId ? `album-stanza:${albumContext.stanzaId}` : null,
  ];

  const match = candidates.find((value) => typeof value === 'string' && value.trim());
  return match || null;
}

function getMessageTimestampSeconds(msg) {
  const raw = msg?.messageTimestamp;
  if (!raw) {
    return Math.floor(Date.now() / 1000);
  }
  if (typeof raw === 'number') {
    return raw;
  }
  if (typeof raw === 'bigint') {
    return Number(raw);
  }
  if (typeof raw === 'object' && typeof raw.low === 'number') {
    return raw.low;
  }
  return Number(raw) || Math.floor(Date.now() / 1000);
}

function trimImageCache() {
  const now = Math.floor(Date.now() / 1000);
  recentImageMessages = recentImageMessages.filter(
    (entry) => now - entry.timestampSec <= ALBUM_CACHE_TTL_SECONDS
  );
  if (recentImageMessages.length > MAX_RECENT_IMAGE_CACHE) {
    recentImageMessages = recentImageMessages.slice(-MAX_RECENT_IMAGE_CACHE);
  }
}

function trackIncomingImageMessage(msg) {
  if (!msg?.message || !msg?.key?.id) {
    return;
  }

  const normalizedMessage = normalizeMessageContent(msg.message);
  if (!getImageMessage(normalizedMessage)) {
    return;
  }

  const participant = resolveParticipantId(msg, 'unknown');
  const remoteJid = msg?.key?.remoteJid || null;
  if (!remoteJid) {
    return;
  }

  const trackedEnvelope = {
    key: {
      remoteJid,
      fromMe: Boolean(msg?.key?.fromMe),
      id: msg.key.id,
      participant,
    },
    message: normalizedMessage,
  };

  const trackedEntry = {
    messageId: msg.key.id,
    remoteJid,
    participant,
    timestampSec: getMessageTimestampSeconds(msg),
    albumGroupId: extractAlbumGroupId(normalizedMessage),
    envelope: trackedEnvelope,
  };

  recentImageMessages = recentImageMessages.filter((entry) => entry.messageId !== msg.key.id);
  recentImageMessages.push(trackedEntry);
  trimImageCache();
}

function sortTrackedEntries(entries) {
  return entries.sort((a, b) => {
    if (a.timestampSec !== b.timestampSec) {
      return a.timestampSec - b.timestampSec;
    }
    return String(a.messageId).localeCompare(String(b.messageId));
  });
}

function dedupeTrackedEntries(entries) {
  const byId = new Map();
  entries.forEach((entry) => {
    if (!entry?.messageId) {
      return;
    }
    byId.set(entry.messageId, entry);
  });
  return sortTrackedEntries(Array.from(byId.values()));
}

function findTrackedById(messageId, remoteJid) {
  if (!messageId) {
    return null;
  }
  return (
    recentImageMessages.find(
      (entry) => entry.messageId === messageId && (!remoteJid || entry.remoteJid === remoteJid)
    ) || null
  );
}

function buildQuotedEnvelope(msg) {
  const contextInfo = msg?.message?.extendedTextMessage?.contextInfo;
  const quotedMessageRaw = contextInfo?.quotedMessage;

  if (!quotedMessageRaw) {
    return { error: 'MISSING_QUOTED_MESSAGE' };
  }

  const quotedMessage = normalizeMessageContent(quotedMessageRaw);
  const participant =
    contextInfo.participant ||
    msg?.key?.participant ||
    msg?.key?.remoteJid ||
    'unknown';

  const quotedKey = {
    remoteJid: msg?.key?.remoteJid,
    fromMe: false,
    id: contextInfo.stanzaId || null,
    participant,
  };

  return {
    envelope: {
      key: quotedKey,
      message: quotedMessage,
    },
    quotedMessage,
    participant,
    stanzaId: contextInfo.stanzaId || null,
    albumGroupId: extractAlbumGroupId(quotedMessage),
  };
}

function getQuotedMediaType(quotedMessage) {
  if (getImageMessage(quotedMessage)) {
    return 'image';
  }
  if (getAlbumMessage(quotedMessage)) {
    return 'album';
  }
  if (getVideoMessage(quotedMessage)) {
    return 'video';
  }
  return null;
}

function collectAlbumTargets(msg, quotedData) {
  const senderJid = msg?.key?.remoteJid || null;
  if (!senderJid) {
    return [];
  }

  const candidates = [];
  const quotedTracked = findTrackedById(quotedData.stanzaId, senderJid);

  if (quotedTracked?.albumGroupId) {
    candidates.push(
      ...recentImageMessages.filter(
        (entry) =>
          entry.remoteJid === senderJid && entry.albumGroupId === quotedTracked.albumGroupId
      )
    );
  }

  if (candidates.length === 0 && quotedData.albumGroupId) {
    candidates.push(
      ...recentImageMessages.filter(
        (entry) =>
          entry.remoteJid === senderJid && entry.albumGroupId === quotedData.albumGroupId
      )
    );
  }

  if (candidates.length === 0 && quotedTracked) {
    candidates.push(
      ...recentImageMessages.filter((entry) => {
        const sameSender = entry.remoteJid === senderJid && entry.participant === quotedTracked.participant;
        const closeTimestamp =
          Math.abs(entry.timestampSec - quotedTracked.timestampSec) <= ALBUM_FALLBACK_WINDOW_SECONDS;
        return sameSender && closeTimestamp;
      })
    );
  }

  if (candidates.length === 0 && getQuotedMediaType(quotedData.quotedMessage) === 'album') {
    const commandTimestamp = getMessageTimestampSeconds(msg);
    candidates.push(
      ...recentImageMessages.filter((entry) => {
        const sameSender = entry.remoteJid === senderJid && entry.participant === quotedData.participant;
        const closeTimestamp =
          Math.abs(entry.timestampSec - commandTimestamp) <= ALBUM_FALLBACK_WINDOW_SECONDS;
        return sameSender && closeTimestamp;
      })
    );
  }

  return dedupeTrackedEntries(candidates).map((entry) => ({
    messageId: entry.messageId,
    participant: entry.participant,
    envelope: {
      key: {
        ...entry.envelope.key,
        fromMe: entry.participant === currentSocket?.user?.id,
      },
      message: entry.envelope.message,
    },
    fromCache: true,
  }));
}

function resolveUploadTargets(msg, quotedData) {
  const mediaType = getQuotedMediaType(quotedData.quotedMessage);

  if (mediaType === 'video') {
    return {
      error: 'VIDEO_NOT_SUPPORTED',
      targets: [],
    };
  }

  if (mediaType !== 'image' && mediaType !== 'album') {
    return {
      error: 'UNSUPPORTED_MEDIA',
      targets: [],
    };
  }

  const albumTargets = collectAlbumTargets(msg, quotedData);
  if (albumTargets.length > 0) {
    return {
      error: null,
      targets: albumTargets,
      mode: albumTargets.length > 1 ? 'batch' : 'single',
    };
  }

  if (mediaType === 'album') {
    return {
      error: 'ALBUM_TARGETS_NOT_FOUND',
      targets: [],
    };
  }

  return {
    error: null,
    mode: 'single',
    targets: [
      {
        messageId: quotedData.stanzaId || `quoted-${Date.now()}`,
        participant: quotedData.participant,
        envelope: {
          key: {
            ...quotedData.envelope.key,
            fromMe: quotedData.participant === currentSocket?.user?.id,
          },
          message: quotedData.quotedMessage,
        },
        fromCache: false,
      },
    ],
  };
}

async function downloadImageEnvelopeToFile(sock, envelope, senderId, suffix = '') {
  try {
    const mediaBuffer = await downloadMediaMessage(envelope, 'buffer', {}, {
      logger: quietLogger,
      reuploadRequest: sock.updateMediaMessage,
    });

    if (!mediaBuffer || mediaBuffer.length === 0) {
      return { success: false, error: 'MEDIA_BUFFER_EMPTY' };
    }

    const safeSuffix = suffix ? `-${sanitizeForFilename(suffix)}` : '';
    const fileName = `${Date.now()}-${sanitizeForFilename(senderId)}${safeSuffix}.jpg`;
    const filePath = path.join(TEMP_MEDIA_DIR, fileName);

    fs.writeFileSync(filePath, mediaBuffer);

    return {
      success: true,
      filePath,
      senderId,
      bytes: mediaBuffer.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
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
    console.warn(`Failed to remove temp file: ${filePath}`, error.message);
  }
}

function scheduleReconnect(delayMs = 10000) {
  if (reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startBot().catch((error) => {
      console.error('Reconnect attempt failed:', error.message);
      scheduleReconnect(10000);
    });
  }, delayMs);
}

async function startBot() {
  try {
    console.log('Initializing Baileys...');
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

    const sock = makeWASocket({
      auth: state,
      browser: ['Railway', 'Chrome', '121.0'],
      syncFullHistory: false,
      shouldIgnoreJid: (jid) => isJidBroadcast(jid),
      logger: pino({ level: 'error' }),
      markOnlineOnConnect: true,
      qrTimeout: 60000,
    });

    currentSocket = sock;

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('\n' + '='.repeat(60));
        console.log('SCAN THIS QR CODE USING WHATSAPP');
        console.log('='.repeat(60));
        try {
          const qrString = await QRCode.toString(qr, {
            errorCorrectionLevel: 'L',
            type: 'terminal',
            margin: 2,
            width: 10,
          });
          console.log(qrString);
        } catch (error) {
          console.log('QR string:', qr);
        }
        console.log('='.repeat(60) + '\n');
      }

      if (connection === 'connecting') {
        connectionState = 'connecting';
        console.log('Connecting to WhatsApp...');
      }

      if (connection === 'open') {
        connectionState = 'open';
        console.log('Bot is ready.');
      }

      if (connection === 'close') {
        connectionState = 'close';
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;

        if (isLoggedOut) {
          console.error('WhatsApp session logged out. Waiting for fresh login...');
        } else {
          console.error('Connection closed. Reconnecting in 10 seconds...');
        }
        scheduleReconnect(10000);
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (event) => {
      const incomingMessages = event?.messages || [];
      for (const msg of incomingMessages) {
        if (!msg?.message || msg.key.remoteJid === 'status@broadcast') {
          continue;
        }

        trackIncomingImageMessage(msg);

        if (msg.key.fromMe) {
          continue;
        }

        const senderJid = msg.key.remoteJid;
        const normalizedMessage = normalizeMessageContent(msg.message);
        const text = (
          normalizedMessage.conversation ||
          normalizedMessage.extendedTextMessage?.text ||
          ''
        )
          .toLowerCase()
          .trim();

        if (!text) {
          continue;
        }

        try {
          if (text === '!help' || text === '!bantuan') {
            await sock.sendMessage(senderJid, {
              text: `Perintah bot:\n- !upload (balas foto atau album foto)\n- !help / !bantuan\n- !info`,
            });
            continue;
          }

          if (text === '!info') {
            await sock.sendMessage(senderJid, {
              text: `Bot WhatsApp Kelas 11 DPIB 2.\nStatus: production-hardened (Railway + Cloudinary + Supabase).\nAlur upload: masuk antrean admin dulu, lalu di-approve ke galeri publik.`,
            });
            continue;
          }

          if (text === '!upload') {
            const quotedData = buildQuotedEnvelope(msg);
            if (quotedData.error) {
              await sock.sendMessage(senderJid, {
                text: 'Balas pesan foto atau album foto dengan "!upload".',
              });
              continue;
            }

            const mediaType = getQuotedMediaType(quotedData.quotedMessage);
            if (!mediaType) {
              await sock.sendMessage(senderJid, {
                text: 'Pesan yang dibalas bukan media. Balas foto/album lalu kirim "!upload".',
              });
              continue;
            }

            if (mediaType === 'video') {
              await sock.sendMessage(senderJid, {
                text: 'Versi ini hanya mendukung upload foto (image), belum video.',
              });
              continue;
            }

            const resolved = resolveUploadTargets(msg, quotedData);
            if (resolved.error === 'ALBUM_TARGETS_NOT_FOUND') {
              await sock.sendMessage(senderJid, {
                text: 'Album terdeteksi, tapi item fotonya tidak ditemukan di cache bot. Coba reply salah satu foto album yang baru dikirim lalu ketik !upload lagi.',
              });
              continue;
            }
            if (resolved.error || !resolved.targets.length) {
              await sock.sendMessage(senderJid, {
                text: 'Gagal membaca target upload. Coba ulang dengan reply foto/album yang valid.',
              });
              continue;
            }

            const totalTargets = resolved.targets.length;
            const currentDate = new Date().toISOString().split('T')[0];

            await sock.sendMessage(senderJid, {
              text:
                totalTargets > 1
                  ? `Terdeteksi ${totalTargets} foto. Sedang upload ke antrean admin...`
                  : 'Sedang memproses dan mengupload foto ke antrean admin...',
            });

            let successCount = 0;
            const failures = [];

            for (let index = 0; index < totalTargets; index += 1) {
              const target = resolved.targets[index];
              let mediaFilePath = null;

              try {
                const downloadResult = await downloadImageEnvelopeToFile(
                  sock,
                  target.envelope,
                  target.participant || resolveParticipantId(msg, 'unknown'),
                  `batch-${index + 1}`
                );

                if (!downloadResult.success) {
                  failures.push({
                    index: index + 1,
                    reason: `download gagal (${downloadResult.error})`,
                  });
                  continue;
                }

                mediaFilePath = downloadResult.filePath;

                const uploadResult = await uploadPhotoToWebsite(mediaFilePath, senderJid, {
                  quoted_participant: target.participant || downloadResult.senderId,
                  quoted_message_id: target.messageId || quotedData.stanzaId,
                  batch_index: index + 1,
                  batch_total: totalTargets,
                  title: `Kiriman WhatsApp ${currentDate} #${index + 1}`,
                });

                if (!uploadResult.success) {
                  failures.push({
                    index: index + 1,
                    reason: `upload gagal (${uploadResult.error})`,
                  });
                  continue;
                }

                successCount += 1;
              } finally {
                removeFileIfExists(mediaFilePath);
              }
            }

            if (successCount === 0) {
              const firstError = failures[0]?.reason || 'unknown error';
              await sock.sendMessage(senderJid, {
                text: `Semua foto gagal diupload. Error pertama: ${firstError}`,
              });
              continue;
            }

            if (failures.length === 0) {
              await sock.sendMessage(senderJid, {
                text:
                  totalTargets > 1
                    ? `Berhasil upload ${successCount} foto ke antrean admin.\nSemua foto menunggu approval sebelum tampil di galeri.\nLink galeri: ${WEBSITE_URL}`
                    : `Foto berhasil diupload ke antrean admin.\nMenunggu approval sebelum tampil di galeri.\nLink galeri: ${WEBSITE_URL}`,
              });
              continue;
            }

            const failedPreview = failures
              .slice(0, 3)
              .map((item) => `#${item.index}: ${item.reason}`)
              .join('\n');

            await sock.sendMessage(senderJid, {
              text: `Upload selesai sebagian.\nBerhasil: ${successCount}\nGagal: ${failures.length}\n\nDetail:\n${failedPreview}`,
            });
            continue;
          }

          if (text.startsWith('!')) {
            await sock.sendMessage(senderJid, {
              text: `Command "${text}" tidak dikenali. Gunakan !help.`,
            });
          }
        } catch (error) {
          console.error('Message handler error:', error);
          await sock.sendMessage(senderJid, {
            text: 'Terjadi kesalahan internal. Coba lagi beberapa saat.',
          });
        }
      }
    });
  } catch (error) {
    connectionState = 'close';
    console.error('Fatal startup error:', error.message);
    scheduleReconnect(10000);
  }
}

function shutdown(signal) {
  console.log(`${signal} received. Shutting down...`);
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  try {
    if (currentSocket?.ws) {
      currentSocket.ws.close();
    }
  } catch (error) {
    console.error('Error while closing WhatsApp socket:', error.message);
  }

  if (healthServer) {
    healthServer.close(() => process.exit(0));
    return;
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startHealthServer();
startBot().catch((error) => {
  console.error('Failed to start bot:', error.message);
  scheduleReconnect(10000);
});
