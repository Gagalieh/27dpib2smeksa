const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, isJidBroadcast, downloadMediaMessage } = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { downloadMedia, uploadPhotoToWebsite } = require('./commands/handler');

console.log('====================================');
console.log('🚀 Bot WhatsApp Starting...');
console.log('====================================\n');

const SESSION_PATH = path.join(__dirname, '.session');
const PHOTOS_PATH = path.join(__dirname, '../photos-upload');

// Ensure directories exist
[SESSION_PATH, PHOTOS_PATH].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  }
});

console.log(`📂 Session path: ${SESSION_PATH}`);
console.log(`📸 Photos path: ${PHOTOS_PATH}\n`);

/**
 * Download media dari WhatsApp using Baileys native method
 */
async function downloadMediaBaileys(sock, msgKey, quotedMsg) {
  try {
    console.log('🔍 Processing media dengan Baileys...');

    // Baileys auto-handles encryption/decryption
    // quotedMsg sudah contains encrypted media info
    const mediaBuffer = await downloadMediaMessage(quotedMsg, 'buffer', {}, {
      logger: console,
      reuploadRequest: sock.updateMediaMessage
    });

    if (!mediaBuffer || mediaBuffer.length === 0) {
      console.error('❌ Media buffer is empty');
      return null;
    }

    console.log('✅ Downloaded via Baileys, size:', mediaBuffer.length, 'bytes');

    // Save to file
    const timestamp = new Date().getTime();
    const senderName = msgKey.participant
      .split('@')[0]
      .replace(/[^a-z0-9]/gi, '-')
      .toLowerCase();
    const filename = `${timestamp}-${senderName}.jpg`;
    const filepath = path.join(__dirname, '../photos-upload', filename);

    // Create directory if not exists
    const dirPath = path.dirname(filepath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`📁 Created directory: ${dirPath}`);
    }

    // Save file
    fs.writeFileSync(filepath, mediaBuffer);
    const fileSize = fs.statSync(filepath).size;
    console.log(`✅ File saved: ${filepath} (${fileSize} bytes)`);

    return filepath;
  } catch (error) {
    console.error('❌ Download error:', error.message);
    return null;
  }
}

async function startBot() {
  try {
    console.log('📲 Initializing Baileys...\n');
    
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

    const sock = makeWASocket({
      auth: state,
      browser: ['Ubuntu', 'Chrome', '121.0'],
      syncFullHistory: false,
      shouldIgnoreJid: (jid) => isJidBroadcast(jid),
      logger: require('pino')({ level: 'error' }),
      markOnlineOnConnect: true,
      qrTimeout: 60000,
    });

    console.log('✅ Baileys initialized\n');

    // Event: QR Code & Pairing Code
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('\n' + '='.repeat(60));
        console.log('📱 SCAN QR CODE DENGAN WHATSAPP');
        console.log('='.repeat(60));
        console.log('1. Buka WhatsApp di phone Anda');
        console.log('2. Settings → Linked Devices → Link a Device');
        console.log('3. Scan QR Code di bawah ini ↓\n');
        
        const QRCode = require('qrcode');
        try {
          const qrString = await QRCode.toString(qr, {
            errorCorrectionLevel: 'L',
            type: 'terminal',
            margin: 2,
            width: 10
          });
          console.log(qrString);
          console.log('\n✅ QR Code ditampilkan di atas. Scan dengan ponsel Anda!');
        } catch (e) {
          console.log('⚠️ Buka WhatsApp → Settings → Linked Devices → Link a Device');
          console.log('QR Code string:', qr);
        }
        console.log('='.repeat(60) + '\n');
      }

      if (connection === 'connecting') {
        console.log('⏳ Connecting to WhatsApp...');
      }

      if (connection === 'open') {
        console.log('\n' + '='.repeat(60));
        console.log('✅ BOT IS READY!');
        console.log('='.repeat(60));
        console.log('📸 Commands Available:');
        console.log('  • !help - Show all commands');
        console.log('  • !info - Bot information');
        console.log('  • !upload - Upload photo to gallery');
        console.log('='.repeat(60) + '\n');
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        
        if (shouldReconnect) {
          console.log('⚠️ Connection lost. Reconnecting in 10 seconds...');
          // Delay lebih lama untuk menghindari infinite reconnect
          setTimeout(() => startBot(), 10000);
        } else {
          console.log('🔐 Logged out. Please scan/link device again.');
          process.exit(0);
        }
      }
    });

    // Event: Credentials update (PENTING! Harus di-set sebelum connection update)
    sock.ev.on('creds.update', saveCreds);

    // Event: Messages
    sock.ev.on('messages.upsert', async (m) => {
      const msg = m.messages[0];
      if (!msg.message || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast')
        return;

      const sender = msg.key.remoteJid;
      const text = (
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ''
      ).toLowerCase().trim();

      console.log('📨 Message received');
      console.log('👤 From:', sender);
      console.log('💬 Text:', text);
      console.log('📦 Message structure:', JSON.stringify(msg.message, null, 2).substring(0, 500));

      try {
        // Command: !help
        if (text === '!help' || text === '!bantuan') {
          const helpText = `📸 *Perintah Bot Kelas 11 DPIB 2* 📸

🔹 *!upload* - Upload foto ke galeri website
   Balas pesan foto dengan "!upload"

🔹 *!bantuan* atau *!help* - Tampilkan menu ini

🔹 *!info* - Info tentang bot ini

Contoh:
1. Kirim foto
2. Balas dengan pesan "!upload"
3. Foto akan otomatis terupload ke galeri kelas

📌 Pastikan kualitas foto bagus!`;

          await sock.sendMessage(sender, { text: helpText });
          return;
        }

        // Command: !info
        if (text === '!info') {
          const infoText = `ℹ️ *Tentang Bot Ini*

Bot WhatsApp Kelas 11 DPIB 2 SMKN 1 Kota Kediri
Untuk upload dan dokumentasi kenangan kelas secara otomatis.

Website: https://sebelasdpib2smeksa.netlify.app

Dikembangkan dengan cinta untuk kelas tercinta 💜`;

          await sock.sendMessage(sender, { text: infoText });
          return;
        }

        // Command: !upload
        if (text === '!upload') {
          console.log('🔍 Processing upload command...');
          
          // Cek apakah pesan sebelumnya adalah foto
          const quotedMsg = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;

          if (!quotedMsg) {
            console.log('❌ quotedMsg is null/undefined');
            await sock.sendMessage(sender, {
              text: '❌ Balas pesan foto dengan "!upload"!\n\nContoh:\n1. Kirim foto\n2. Balas foto dengan: !upload',
            });
            return;
          }

          console.log('✅ quotedMsg found, keys:', Object.keys(quotedMsg));
          const imageMsg = quotedMsg.imageMessage || quotedMsg.videoMessage;

          if (!imageMsg) {
            console.log('❌ No imageMsg or videoMsg');
            await sock.sendMessage(sender, {
              text: '❌ Pesan yang dibales bukan foto/video!\n\nKirim foto dulu, terus balas dengan: !upload',
            });
            return;
          }

          console.log('✅ Found media message type');

          try {
            await sock.sendMessage(sender, { text: '⏳ Sedang upload foto...' });

            // Download media
            const media = await downloadMediaBaileys(sock, msg.key, quotedMsg);

            if (!media) {
              console.error('Download media returned null');
              await sock.sendMessage(sender, {
                text: '❌ Gagal download foto. Pastikan foto sudah terdownload sepenuhnya. Coba lagi!',
              });
              return;
            }

            // Cek apakah file exist
            if (!fs.existsSync(media)) {
              console.error('Media file does not exist:', media);
              await sock.sendMessage(sender, {
                text: '❌ File foto tidak ditemukan. Coba lagi!',
              });
              return;
            }

            // Upload ke website
            const result = await uploadPhotoToWebsite(media, sender);

            if (result.success) {
              await sock.sendMessage(sender, {
                text: `✅ *Foto berhasil diupload!*

📸 Foto Anda sekarang ada di galeri kelas.

🔗 Lihat di: https://sebelasdpib2smeksa.netlify.app/#galeri`,
              });
            } else {
              await sock.sendMessage(sender, {
                text: `❌ Gagal upload: ${result.error}`,
              });
            }
          } catch (error) {
            console.error('Upload error:', error);
            await sock.sendMessage(sender, {
              text: `❌ Terjadi kesalahan: ${error.message}`,
            });
          }

          return;
        }

        // Default: unknown command
        if (text.startsWith('!')) {
          await sock.sendMessage(sender, {
            text: `❓ Command "${text}" tidak diketahui.\n\nKetik: *!help* untuk melihat daftar command`,
          });
        }
      } catch (error) {
        console.error('Error handling message:', error);
        await sock.sendMessage(sender, {
          text: '❌ Terjadi error. Coba lagi nanti.',
        });
      }
    });
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
    console.log('\n⏰ Restarting in 10 seconds...\n');
    setTimeout(startBot, 10000);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down bot...');
  process.exit(0);
});

// Start bot
startBot().catch((err) => {
  console.error('Failed to start bot:', err);
  process.exit(1);
});
