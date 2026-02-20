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

const SAVE_LOCAL_INDEX = parseBoolean(process.env.SAVE_LOCAL_INDEX);
const SESSION_PATH = path.resolve(process.env.BAILEYS_SESSION_DIR);
const LOCAL_INDEX_DIR = path.resolve(process.env.LOCAL_INDEX_DIR);
const TEMP_MEDIA_DIR = path.join(os.tmpdir(), 'botwa-new-media');
const WEBSITE_URL =
  process.env.WEBSITE_URL || 'https://sebelasdpib2smeksa.netlify.app/#galeri';

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

function buildQuotedEnvelope(msg) {
  const contextInfo = msg?.message?.extendedTextMessage?.contextInfo;
  const quotedMessage = contextInfo?.quotedMessage;

  if (!quotedMessage) {
    return { error: 'MISSING_QUOTED_MESSAGE' };
  }

  const participant =
    contextInfo.participant ||
    msg?.key?.participant ||
    msg?.key?.remoteJid ||
    'unknown';

  const quotedKey = {
    remoteJid: msg?.key?.remoteJid,
    fromMe: false,
    id: contextInfo.stanzaId,
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
  };
}

function getQuotedMediaType(quotedMessage) {
  if (quotedMessage?.imageMessage) {
    return 'image';
  }
  if (quotedMessage?.videoMessage) {
    return 'video';
  }
  return null;
}

async function downloadQuotedImageToFile(sock, msg, quotedData) {
  try {
    const mediaBuffer = await downloadMediaMessage(quotedData.envelope, 'buffer', {}, {
      logger: quietLogger,
      reuploadRequest: sock.updateMediaMessage,
    });

    if (!mediaBuffer || mediaBuffer.length === 0) {
      return { success: false, error: 'MEDIA_BUFFER_EMPTY' };
    }

    const senderId = quotedData.participant || resolveParticipantId(msg, 'unknown');
    const fileName = `${Date.now()}-${sanitizeForFilename(senderId)}.jpg`;
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
      const msg = event?.messages?.[0];
      if (!msg?.message || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') {
        return;
      }

      const senderJid = msg.key.remoteJid;
      const text = (
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ''
      )
        .toLowerCase()
        .trim();

      try {
        if (text === '!help' || text === '!bantuan') {
          await sock.sendMessage(senderJid, {
            text: `Perintah bot:\n- !upload (balas foto yang ingin diupload)\n- !help / !bantuan\n- !info`,
          });
          return;
        }

        if (text === '!info') {
          await sock.sendMessage(senderJid, {
            text: `Bot WhatsApp Kelas 11 DPIB 2.\nStatus: production-hardened (Railway + Cloudinary + Supabase).`,
          });
          return;
        }

        if (text === '!upload') {
          const quotedData = buildQuotedEnvelope(msg);
          if (quotedData.error) {
            await sock.sendMessage(senderJid, {
              text: 'Balas pesan foto dengan "!upload".',
            });
            return;
          }

          const mediaType = getQuotedMediaType(quotedData.quotedMessage);
          if (!mediaType) {
            await sock.sendMessage(senderJid, {
              text: 'Pesan yang dibalas bukan media. Balas sebuah foto dengan "!upload".',
            });
            return;
          }

          if (mediaType !== 'image') {
            await sock.sendMessage(senderJid, {
              text: 'Versi ini hanya mendukung upload foto (image), belum video.',
            });
            return;
          }

          quotedData.envelope.key.fromMe =
            quotedData.participant === sock.user?.id;

          await sock.sendMessage(senderJid, {
            text: 'Sedang memproses dan mengupload foto...',
          });

          let mediaFilePath = null;

          try {
            const downloadResult = await downloadQuotedImageToFile(sock, msg, quotedData);
            if (!downloadResult.success) {
              await sock.sendMessage(senderJid, {
                text: `Gagal download foto: ${downloadResult.error}`,
              });
              return;
            }

            mediaFilePath = downloadResult.filePath;

            const uploadResult = await uploadPhotoToWebsite(mediaFilePath, senderJid, {
              quoted_participant: downloadResult.senderId,
              quoted_message_id: quotedData.stanzaId,
            });

            if (!uploadResult.success) {
              await sock.sendMessage(senderJid, {
                text: `Gagal upload: ${uploadResult.error}`,
              });
              return;
            }

            await sock.sendMessage(senderJid, {
              text: `Foto berhasil diupload.\nGallery ID: ${uploadResult.gallery_id}\nURL: ${uploadResult.image_url}\n\nLihat galeri: ${WEBSITE_URL}`,
            });
          } finally {
            removeFileIfExists(mediaFilePath);
          }

          return;
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
