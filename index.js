const { GoogleSpreadsheet } = require('google-spreadsheet');
const creds = require('/etc/secrets/credentials.json');
const express = require('express');
const { Telegraf } = require('telegraf');
const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

const SHEET_ID = process.env.SPREADSHEET_ID;
let doc;

let drinkMessageIndex = 0; // Drink mesajlarını sırayla göstermek için

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
  return rows.filter(row => row.TelegramID === telegramID.toString() && new Date(row.Timestamp).toLocaleDateString() === today);
}

async function writeToSheet(name, username, telegramID, code, drinkCode = '') {
  const sheet = doc.sheetsByTitle['Users'];
  await sheet.addRow({ Timestamp: new Date().toLocaleString(), Name: name, Username: username, TelegramID: telegramID, Code: code, 'Drink code': drinkCode });
}

async function getNextDrinkMessage() {
  const sheet = doc.sheetsByTitle['DrinkMessage'];
  const rows = await sheet.getRows();
  if (!rows.length) return '';

  const message = rows[drinkMessageIndex % rows.length]._rawData[0];
  drinkMessageIndex++;
  return message;
}

async function getRandomFollowupMessage() {
  const sheet = doc.sheetsByTitle['DrinkFollowup'];
  const rows = await sheet.getRows();
  if (!rows.length) return '';
  return rows[Math.floor(Math.random() * rows.length)]._rawData[0];
}

bot.start((ctx) => {
  ctx.reply('Welcome! You scanned the QR code and activated your discount.');
});

bot.hears(/^(hi|pizza|discount)$/i, async (ctx) => {
  await loadSheet();
  const userId = ctx.from.id;
  const todayCodes = await hasReceivedCodeToday(userId);
  const code = await getRandomCode('Code');
  if (!code) return ctx.reply('Sorry, we are out of pizza codes. Bring a friend and try their phone! 🍕');

  if (todayCodes.length === 0) {
    await writeToSheet(ctx.from.first_name, ctx.from.username, ctx.from.id, code);
    await ctx.reply(`Here is your discount code: ${code}`);

    const drinkPrompt = await getNextDrinkMessage();
    if (drinkPrompt) await ctx.reply(drinkPrompt);
  } else if (todayCodes.length === 1) {
    await writeToSheet(ctx.from.first_name, ctx.from.username, ctx.from.id, code);
    await ctx.reply("You already claimed your discount today.\nBut alright… I’m giving you one more. Don’t tell the boss. 😅\n🍕 Extra discount code: " + code);
  } else {
    await ctx.reply('Too many pizza codes for today! Come back tomorrow. 🍕');
  }
});

bot.hears(/^(yes|drink)$/i, async (ctx) => {
  await loadSheet();
  const userId = ctx.from.id;
  const todayRows = await hasReceivedCodeToday(userId);
  if (!todayRows.length) {
    return ctx.reply("Please get your pizza discount first. Just say 'pizza'. 🍕");
  }

  const latest = todayRows[todayRows.length - 1];
  if (latest['Drink code']) {
    return ctx.reply("That's all for today! Come back tomorrow for another drink code. 🥤");
  }

  const drinkCode = await getRandomCode('DrinkCode');
  if (!drinkCode) return ctx.reply('Sorry, drink codes are finished. 🥤');

  latest['Drink code'] = drinkCode;
  await latest.save();

  await ctx.reply(`Here is your drink code: ${drinkCode}`);

  const followup = await getRandomFollowupMessage();
  if (followup) await ctx.reply(followup);
});

bot.launch();

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running...'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
