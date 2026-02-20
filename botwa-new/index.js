const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, isJidBroadcast } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const path = require('path');
const fs = require('fs');
const { downloadMedia, uploadPhotoToWebsite } = require('./commands/handler');

console.log('🚀 Bot WhatsApp dimulai...');

const SESSION_PATH = path.join(__dirname, '.session');

if (!fs.existsSync(SESSION_PATH)) {
  fs.mkdirSync(SESSION_PATH, { recursive: true });
}

async function startBot() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      browser: ['Ubuntu', 'Chrome', '121.0'],
      syncFullHistory: false,
      shouldIgnoreJid: (jid) => isJidBroadcast(jid),
    });

    // Event: QR Code
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('\n📱 Scan QR Code dengan WhatsApp Anda:');
        console.log('Atau gunakan WhatsApp Web di perangkat lain untuk login.\n');
      }

      if (connection === 'connecting') {
        console.log('⏳ Connecting to WhatsApp...');
      }

      if (connection === 'open') {
        console.log('✅ Bot WhatsApp siap digunakan!');
        console.log('📸 Gunakan command: !upload untuk kirim foto ke website');
        console.log('Gunakan: !help untuk melihat semua command\n');
      }

      if (connection === 'close') {
        if (
          lastDisconnect?.error?.output?.statusCode !==
          DisconnectReason.loggedOut
        ) {
          startBot();
        } else {
          console.log('⚠️ Connection closed. Please scan QR code again.');
        }
      }
    });

    // Event: Credentials update
    sock.ev.on('creds.update', saveCreds);

    // Event: Messages
    sock.ev.on('messages.upsert', async (m) => {
      console.log('📨 Message received');

      const msg = m.messages[0];
      if (!msg.message || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast')
        return;

      const sender = msg.key.remoteJid;
      const text = (
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ''
      ).toLowerCase().trim();

      console.log(`👤 From: ${sender}`);
      console.log(`💬 Text: ${text}`);

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
          // Cek apakah pesan sebelumnya adalah foto
          const quotedMsg = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;

          if (!quotedMsg) {
            await sock.sendMessage(sender, {
              text: '❌ Balas pesan foto dengan "!upload"!\n\nContoh:\n1. Kirim foto\n2. Balas foto dengan: !upload',
            });
            return;
          }

          const imageMsg = quotedMsg.imageMessage || quotedMsg.videoMessage;

          if (!imageMsg) {
            await sock.sendMessage(sender, {
              text: '❌ Pesan yang dibales bukan foto/video!\n\nKirim foto dulu, terus balas dengan: !upload',
            });
            return;
          }

          try {
            await sock.sendMessage(sender, { text: '⏳ Sedang upload foto...' });

            // Download media
            const media = await downloadMediaBaileys(sock, msg.key, quotedMsg);

            if (!media) {
              await sock.sendMessage(sender, {
                text: '❌ Gagal download foto. Coba lagi!',
              });
              return;
            }

            // Upload ke website
            const result = await uploadPhotoToWebsite(media, sender);

            if (result.success) {
              await sock.sendMessage(sender, {
                text: `✅ *Foto berhasil diupload!*

📸 Foto Anda sekarang ada di galeri kelas.

🔗 Lihat di: https://sebelasdpib2smeksa.netlify.app/#galeri

Terima kasih atas kontribusimu! 💜`,
              });
              console.log(`✅ Foto dari ${sender} berhasil diupload`);
            } else {
              await sock.sendMessage(sender, {
                text: `❌ Gagal upload foto.\n\nError: ${result.error}`,
              });
            }
          } catch (error) {
            console.error('Error uploading photo:', error);
            await sock.sendMessage(sender, {
              text: '❌ Terjadi error saat upload. Coba lagi nanti.',
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
    console.error('❌ Fatal error:', error);
    console.log('Restarting in 5 seconds...');
    setTimeout(startBot, 5000);
  }
}

/**
 * Download media dari Baileys
 */
async function downloadMediaBaileys(sock, msgKey, quotedMsg) {
  try {
    const imageMsg = quotedMsg.imageMessage;
    if (!imageMsg) return null;

    // Get stream
    const stream = await sock.downloadMediaMessage(quotedMsg);
    
    if (!stream) return null;

    // Save to file
    const timestamp = new Date().getTime();
    const senderName = msgKey.participant
      .split('@')[0]
      .replace(/[^a-z0-9]/gi, '-')
      .toLowerCase();
    const filename = `${timestamp}-${senderName}.jpg`;
    const filepath = path.join(__dirname, '../photos-upload', filename);

    // Create directory if not exists
    if (!fs.existsSync(path.dirname(filepath))) {
      fs.mkdirSync(path.dirname(filepath), { recursive: true });
    }

    // Save file
    fs.writeFileSync(filepath, stream);
    console.log(`📸 Foto tersimpan: ${filepath}`);

    return filepath;
  } catch (error) {
    console.error('Error downloading media:', error);
    return null;
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
