const { GoogleSpreadsheet } = require('google-spreadsheet');
const creds = require('/etc/secrets/credentials.json');
const express = require('express');
const { Telegraf } = require('telegraf');
const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

const SHEET_ID = process.env.SPREADSHEET_ID;
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
  await sheet.addRow({ Timestamp: new Date().toLocaleString(), Name: name, Username: username, TelegramID: telegramID, Code: code, 'Drink code': drinkCode });
}

async function getDrinkMessage() {
  const sheet = doc.sheetsByTitle['Drink message'];
  const rows = await sheet.getRows();
  if (rows.length === 0) return null;
  return rows[0]._rawData[0];
}

async function getRandomExtraMessage() {
  const sheet = doc.sheetsByTitle['Messages'];
  const rows = await sheet.getRows();
  if (rows.length <= 3) return null;
  const index = Math.floor(Math.random() * (rows.length - 3)) + 3;
  return rows[index]._rawData[0];
}

bot.start((ctx) => {
  ctx.reply('Welcome! You scanned the QR code and activated your discount.');
});

bot.hears(/^(hi|pizza|discount)$/i, async (ctx) => {
  const userId = ctx.from.id;
  const today = new Date().toDateString();
  await loadSheet();

  const name = ctx.from.first_name;
  const username = ctx.from.username;

  if (userMap.get(userId) === today) {
    const code = await getRandomCode('Code');
    if (!code) return ctx.reply("Sorry, we're out of pizza codes. Bring a friend and claim from their phone! 🍕");

    await ctx.reply("You already claimed your discount today.\nBut alright… I’m giving you one more. Don’t tell the boss. 😅\n🍕 Extra discount code: " + code);
    const drinkMessage = await getDrinkMessage();
    if (drinkMessage) await ctx.reply(drinkMessage);
    return;
  } else {
    userMap.set(userId, today);
  }

  const code = await getRandomCode('Code');
  if (!code) return ctx.reply("Sorry, we're out of pizza codes. Bring a friend and claim from their phone! 🍕");

  await writeToSheet(name, username, userId, code);
  await ctx.reply(`Here is your discount code: ${code}`);

  const drinkMessage = await getDrinkMessage();
  if (drinkMessage) await ctx.reply(drinkMessage);
});

bot.hears(/^(yes|drink)$/i, async (ctx) => {
  await loadSheet();
  const drinkCode = await getRandomCode('DrinkCode');
  if (!drinkCode) return ctx.reply('Sorry, drink codes are finished.');

  const rows = await doc.sheetsByTitle['Users'].getRows();
  const latestRow = rows.reverse().find(row => row.TelegramID === ctx.from.id.toString());
  if (latestRow) {
    latestRow['Drink code'] = drinkCode;
    await latestRow.save();
  }

  await ctx.reply(`Here is your drink code: ${drinkCode}`);
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const today = new Date().toDateString();
  if (userMap.get(userId) === today) {
    await loadSheet();
    const message = await getRandomExtraMessage();
    if (message) await ctx.reply(message);
  }
});

bot.launch();

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running...'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
