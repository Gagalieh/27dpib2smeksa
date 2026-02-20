const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');
const { downloadMedia, uploadPhotoToWebsite } = require('./commands/handler');

// Inisialisasi WhatsApp Client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

// Event: QR Code untuk login
client.on('qr', (qr) => {
  console.log('QR Code muncul. Scan dengan WhatsApp Anda:');
  qrcode.generate(qr, { small: true });
});

// Event: Client siap
client.on('ready', () => {
  console.log('✅ Bot WhatsApp siap digunakan!');
  console.log('📸 Gunakan command: !upload untuk kirim foto ke website');
});

// Event: Terima pesan
client.on('message', async (msg) => {
  const sender = msg.from;
  const text = msg.body.toLowerCase().trim();

  try {
    // Command: !upload - untuk menerima foto
    if (text === '!upload' || text.startsWith('!upload ')) {
      if (msg.hasMedia) {
        await handlePhotoUpload(msg, sender, client);
      } else {
        msg.reply('❌ Pesan ini tidak mengandung media. Kirim foto terlebih dahulu!');
      }
    }

    // Command: !help - tampilkan bantuan
    if (text === '!help' || text === '!bantuan') {
      const helpText = `
📸 *Perintah Bot Kelas 11 DPIB 2* 📸

🔹 *!upload* - Upload foto ke galeri website
   Balas pesan foto dengan "!upload"

🔹 *!bantuan* atau *!help* - Tampilkan menu ini

🔹 *!info* - Info tentang bot ini

Contoh:
1. Kirim foto
2. Balas dengan pesan "!upload"
3. Foto akan otomatis terupload ke galeri kelas

📌 Pastikan kualitas foto bagus agar tampilan website lebih baik!
      `;
      msg.reply(helpText);
    }

    // Command: !info
    if (text === '!info') {
      const infoText = `
ℹ️ *Tentang Bot Ini*

Bot WhatsApp Kelas 11 DPIB 2 SMKN 1 Kota Kediri
Untuk upload dan dokumentasi kenangan kelas secara otomatis.

Website: https://sebelasdpib2smeksa.netlify.app

Dikembangkan dengan cinta untuk kelas tercinta 💜
      `;
      msg.reply(infoText);
    }

  } catch (error) {
    console.error('Error handling message:', error);
    msg.reply('❌ Terjadi error. Coba lagi nanti.');
  }
});

// Fungsi: Handle upload foto
async function handlePhotoUpload(msg, sender, client) {
  try {
    // Cek apakah media adalah foto
    const media = await msg.downloadMedia();
    
    if (!media || !media.mimetype.includes('image')) {
      msg.reply('❌ File ini bukan foto. Kirim foto JPG atau PNG!');
      return;
    }

    msg.react('⏳'); // Tampilkan animasi loading

    // Download dan simpan foto
    const photoPath = await downloadMedia(media, sender);

    // Upload ke website
    const uploadResult = await uploadPhotoToWebsite(photoPath, sender);

    if (uploadResult.success) {
      msg.react('✅'); // Tampilkan checkmark
      msg.reply(`
✅ *Foto berhasil diupload!*

📸 Foto Anda sekarang ada di galeri kelas.

🔗 Lihat di: https://sebelasdpib2smeksa.netlify.app/#galeri

Terima kasih atas kontribusimu! 💜
      `);
      console.log(`✅ Foto dari ${sender} berhasil diupload`);
    } else {
      msg.react('❌');
      msg.reply(`❌ Gagal upload foto.\n\nError: ${uploadResult.error}`);
    }

  } catch (error) {
    console.error('Error uploading photo:', error);
    msg.react('❌');
    msg.reply('❌ Terjadi error saat upload. Coba lagi nanti.');
  }
}

// Event: Client disconnect
client.on('disconnected', () => {
  console.log('⚠️ Bot terputus. Restart bot...');
});

// Jalankan client
client.initialize();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down bot...');
  await client.destroy();
  process.exit(0);
});

console.log('🚀 Bot WhatsApp dimulai...');
