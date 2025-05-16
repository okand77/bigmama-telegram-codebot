const { GoogleSpreadsheet } = require('google-spreadsheet');
const creds = require('./credentials.json');
const express = require('express');
const { Telegraf } = require('telegraf');
const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

const SHEET_ID = '1D9ikPNR8kCKy1GC3jrDQRj5KnfZK5imSbsghNnQ7mXI';
let doc;

const userMap = new Map();

async function loadSheet() {
  doc = new GoogleSpreadsheet(SHEET_ID);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();
}

async function getRandomCode() {
  const sheet = doc.sheetsByTitle['Code'];
  await sheet.loadCells(); // Tüm hücreleri yükle
  const rows = await sheet.getRows();
  const unused = rows.filter(row => row._rawData[1] !== 'YES');

  if (unused.length === 0) return null;

  const random = unused[Math.floor(Math.random() * unused.length)];
  const rowIndex = random.rowIndex;
  const cell = sheet.getCell(rowIndex, 1); // B sütunu

  cell.value = 'YES';
  cell.backgroundColor = { red: 1, green: 0, blue: 0 };
  cell.textFormat = { foregroundColor: { red: 1, green: 1, blue: 1 } };

  await sheet.saveUpdatedCells();
  return random._rawData[0];
}

bot.start((ctx) => {
  ctx.reply('Welcome! You scanned the QR code and activated your discount.');
});

bot.hears('hi', async (ctx) => {
  const userId = ctx.from.id;
  const today = new Date().toDateString();

  if (userMap.get(userId) === today) {
    await ctx.reply('Günlük limitiniz aşılmış bulunuyor.');
    await ctx.reply('Ben size bir kod daha veriyorum, patrona söylemeyin.');
  } else {
    userMap.set(userId, today);
  }

  await loadSheet();
  const code = await getRandomCode();
  if (!code) return ctx.reply('Üzgünüz, şu anda mevcut kod kalmadı.');

  await ctx.reply(`Hello! 👋 Here is your discount code: ${code}`);
  await ctx.reply('İçecek için de bir kod ister misiniz? 2 dolarlık Pepsi şimdi sadece 0.50 cent.');
});

bot.launch();

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running...'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
