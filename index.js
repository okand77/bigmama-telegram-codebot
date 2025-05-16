const { GoogleSpreadsheet } = require('google-spreadsheet');
const creds = require('/etc/secrets/credentials.json');
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
  await sheet.loadCells();
  const rows = await sheet.getRows();
  const unused = rows.filter(row => row._rawData[1] !== 'YES');

  if (unused.length === 0) return null;

  const random = unused[Math.floor(Math.random() * unused.length)];
  const rowIndex = random.rowIndex;
  const codeCell = sheet.getCell(rowIndex, 1); // B column

  codeCell.value = 'YES';
  codeCell.backgroundColor = { red: 1, green: 0, blue: 0 };
  codeCell.textFormat = { foregroundColor: { red: 1, green: 1, blue: 1 } };

  await sheet.saveUpdatedCells();
  return random._rawData[0];
}

async function writeToSheet(name, username, telegramID, code) {
  const userSheet = doc.sheetsByTitle['Users'];
  await userSheet.addRow({
    Timestamp: new Date().toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' }),
    Name: name || '',
    Username: username || '',
    TelegramID: telegramID || '',
    Code: code || ''
  });
}

bot.start((ctx) => {
  ctx.reply('Welcome! You scanned the QR code and activated your discount.');
});

bot.hears('hi', async (ctx) => {
  const userId = ctx.from.id;
  const today = new Date().toDateString();

  await loadSheet();

  let giveExtra = false;
  if (userMap.get(userId) === today) {
    await ctx.reply('Your daily limit has been reached.');
    await ctx.reply("I'm giving you one more code, don't tell the boss. 🤫");
    giveExtra = true;
  } else {
    userMap.set(userId, today);
  }

  const code = await getRandomCode();
  if (!code) return ctx.reply('Sorry, no codes are available at the moment.');

  await writeToSheet(ctx.from.first_name, ctx.from.username, ctx.from.id, code);
  await ctx.reply(`Here is your discount code: ${code}`);
  await ctx.reply('Would you like a code for a drink too? Pepsi is now just $0.50 instead of $2. 🥤');
});

bot.launch();

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running...'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
