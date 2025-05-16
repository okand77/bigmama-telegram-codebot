const { GoogleSpreadsheet } = require('google-spreadsheet');
const creds = require('./credentials.json');
const express = require('express');
const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');
const { GoogleSpreadsheet } = require('google-spreadsheet');

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => {
  ctx.reply('Welcome! You scanned the QR code and activated your discount.');
});

bot.hears('hi', async (ctx) => {
  const code = generateCode();
  ctx.reply('Hello! 👋 Here is your discount code: ' + code);

  const name = ctx.from.first_name || '';
  const username = ctx.from.username || '';
  const telegramID = ctx.from.id;

  await writeToSheet(name, username, telegramID, code);
});

function generateCode() {
  const digits = '0123456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += digits[Math.floor(Math.random() * digits.length)];
  }
  return code;
}

bot.launch();
app.get('/', (req, res) => {
  res.send('Bot is running...');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
async function writeToSheet(name, username, telegramID, code) {
  const doc = new GoogleSpreadsheet('1D9ikPNR8kCKy1GC3jrDQRj5KnfZK5imSbsghNnQ7mXI');
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];
  await sheet.addRow({
    Timestamp: new Date().toLocaleString(),
    Name: name,
    Username: username,
    TelegramID: telegramID,
    Code: code
  });
}
