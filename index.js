// index.js
const { GoogleSpreadsheet } = require('google-spreadsheet');
const creds = require('/etc/secrets/credentials.json');
const express = require('express');
const { Telegraf } = require('telegraf');
const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

const SHEET_ID = process.env.SPREADSHEET_ID;
let doc;

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

async function hasReceivedCodeToday(telegramID) {
  const sheet = doc.sheetsByTitle['Users'];
  const rows = await sheet.getRows();
  const today = new Date().toLocaleDateString();
  return rows.some(row => row.TelegramID === telegramID.toString() && new Date(row.Timestamp).toLocaleDateString() === today);
}

async function writeToSheet(name, username, telegramID, code, drinkCode = '') {
  const sheet = doc.sheetsByTitle['Users'];
  await sheet.addRow({ Timestamp: new Date().toLocaleString(), Name: name, Username: username, TelegramID: telegramID, Code: code, 'Drink code': drinkCode });
}

async function getMessage(sheetTitle, fixedFirst = 3) {
  const sheet = doc.sheetsByTitle[sheetTitle];
  const rows = await sheet.getRows();
  if (!rows.length) return '';
  const today = new Date().toLocaleDateString();
  const userRows = await doc.sheetsByTitle['Users'].getRows();
  const userCountToday = userRows.filter(row => new Date(row.Timestamp).toLocaleDateString() === today).length;
  if (userCountToday <= fixedFirst) return rows[userCountToday - 1]?._rawData[0] || rows[0]._rawData[0];
  const randomRow = rows[Math.floor(Math.random() * rows.length)];
  return randomRow._rawData[0];
}

bot.start((ctx) => {
  ctx.reply('Welcome! You scanned the QR code and activated your discount.');
});

bot.hears(/^(hi|pizza|discount)$/i, async (ctx) => {
  await loadSheet();
  const userId = ctx.from.id;
  const alreadyClaimed = await hasReceivedCodeToday(userId);
  const code = await getRandomCode('Code');
  if (!code) return ctx.reply("Sorry, we are out of pizza codes. Bring a friend and try their phone! 🍕");

  if (alreadyClaimed) {
    await ctx.reply("You already claimed your discount today.\nBut alright… I’m giving you one more. Don’t tell the boss. 😅\n🍕 Extra discount code: " + code);
  } else {
    await writeToSheet(ctx.from.first_name, ctx.from.username, ctx.from.id, code);
    await ctx.reply(`Here is your discount code: ${code}`);
    const drinkPrompt = await getMessage('Drink message', 1);
    if (drinkPrompt) await ctx.reply(drinkPrompt);
  }
});

bot.hears(/^(yes|drink)$/i, async (ctx) => {
  await loadSheet();
  const userId = ctx.from.id;
  const today = new Date().toLocaleDateString();
  const sheet = doc.sheetsByTitle['Users'];
  const rows = await sheet.getRows();
  const todayRows = rows.filter(row => row.TelegramID === userId.toString() && new Date(row.Timestamp).toLocaleDateString() === today);

  if (!todayRows.length) return ctx.reply("Please get your pizza discount first. Just say 'pizza'. 🍕");
  if (todayRows[0]['Drink code']) return ctx.reply("That's all for today! Come back tomorrow for another drink code. 🥤");

  const drinkCode = await getRandomCode('DrinkCode');
  if (!drinkCode) return ctx.reply("Sorry, drink codes are finished. 🥤");
  todayRows[0]['Drink code'] = drinkCode;
  await todayRows[0].save();
  await ctx.reply(`Here is your drink code: ${drinkCode}`);
});

bot.hears(/.*/, async (ctx) => {
  await loadSheet();
  const msg = ctx.message.text.toLowerCase();
  if (msg.includes('pizza') || msg.includes('hi') || msg.includes('drink')) return;
  const fallbackMsg = await getMessage('Messages', 3);
  await ctx.reply(fallbackMsg);
});

bot.launch();

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running...'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
