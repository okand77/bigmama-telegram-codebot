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

async function getRandomCode(sheetTitle, columnIndex = 1) {
  const sheet = doc.sheetsByTitle[sheetTitle];
  await sheet.loadCells();
  const rows = await sheet.getRows();
  const unused = rows.filter(row => row._rawData[columnIndex] !== 'YES');

  if (unused.length === 0) return null;

  const random = unused[Math.floor(Math.random() * unused.length)];
  const rowIndex = random.rowIndex;
  const cell = sheet.getCell(rowIndex, columnIndex);

  cell.value = 'YES';
  cell.backgroundColor = { red: 1, green: 0, blue: 0 };
  cell.textFormat = { foregroundColor: { red: 1, green: 1, blue: 1 } };
  await sheet.saveUpdatedCells();

  return random._rawData[0];
}

async function writeToSheet(name, username, telegramID, code, drinkCode = '') {
  const sheet = doc.sheetsByTitle['Users'];
  await sheet.addRow({
    Timestamp: new Date().toLocaleString(),
    Name: name,
    Username: username,
    TelegramID: telegramID,
    Code: code,
    'Drink code': drinkCode
  });
}

bot.start((ctx) => {
  ctx.reply('Welcome! You scanned the QR code and activated your discount.');
});

bot.hears(/^(hi|pizza|discount)$/i, async (ctx) => {
  const userId = ctx.from.id;
  const today = new Date().toDateString();
  await loadSheet();

  if (userMap.get(userId) === today) {
    const code = await getRandomCode('Code');
    if (!code) return ctx.reply('Sorry, we are out of codes.');

    await ctx.reply("You already claimed your discount today.\nBut alright… I’m giving you one more. Don’t tell the boss. 😅\n🍕 Extra discount code: " + code);
    return;
  } else {
    userMap.set(userId, today);
  }

  const code = await getRandomCode('Code');
  if (!code) return ctx.reply('Sorry, we are out of codes.');

  await writeToSheet(ctx.from.first_name, ctx.from.username, ctx.from.id, code);
  await ctx.reply(`Here is your discount code: ${code}`);
  await ctx.reply('Would you like a code for a drink too? Pepsi is now just $0.50 instead of $2. 🥤');
});

bot.hears(/^(yes|drink)$/i, async (ctx) => {
  await loadSheet();
  const drinkCode = await getRandomCode('DrinkCode');
  if (!drinkCode) return ctx.reply('Sorry, drink codes are finished.');

  const rows = await doc.sheetsByTitle['Users'].getRows();
  const latestRow = rows.reverse().find(row => row.TelegramID == ctx.from.id);
  if (latestRow) {
    latestRow['Drink code'] = drinkCode;
    await latestRow.save();
  }

  await ctx.reply(`Here is your drink code: ${drinkCode}`);
});

bot.launch();

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running...'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
