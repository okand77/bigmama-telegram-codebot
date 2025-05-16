const { GoogleSpreadsheet } = require('google-spreadsheet');
const creds = require('/etc/secrets/credentials.json');
const express = require('express');
const { Telegraf } = require('telegraf');
const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

const SHEET_ID = process.env.SPREADSHEET_ID;
let doc;
const userMessageMap = new Map();

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

async function getDrinkMessage() {
  const sheet = doc.sheetsByTitle['Drink message'];
  const rows = await sheet.getRows();
  const valid = rows.filter(row => row._rawData[0]);
  if (!valid.length) return '';
  return valid[Math.floor(Math.random() * valid.length)]._rawData[1];
}

async function getFollowupPizzaMessage() {
  const sheet = doc.sheetsByTitle['Messages'];
  const rows = await sheet.getRows();
  const valid = rows.filter(row => row._rawData[0] && !isNaN(parseInt(row._rawData[0])));
  const sorted = valid.sort((a, b) => parseInt(a._rawData[0]) - parseInt(b._rawData[0]));
  if (sorted.length <= 3) return sorted[0]._rawData[1];
  const count = userMessageMap.get('counter') || 0;
  const index = count < 3 ? count : Math.floor(Math.random() * (sorted.length - 3)) + 3;
  userMessageMap.set('counter', count + 1);
  return sorted[index]._rawData[1];
}

function isInActiveHours() {
  const now = new Date();
  const hour = now.getUTCHours() + 7; // Phnom Penh = UTC+7
  return hour >= 12 && hour < 24;
}

async function writeToSheet(name, username, telegramID, code = '', drinkCode = '') {
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

async function getTodayEntries(telegramID) {
  const sheet = doc.sheetsByTitle['Users'];
  const rows = await sheet.getRows();
  const today = new Date().toLocaleDateString();
  return rows.filter(row => row.TelegramID === telegramID.toString() && new Date(row.Timestamp).toLocaleDateString() === today);
}

bot.start(ctx => {
  ctx.reply('Welcome! You scanned the QR code and activated your discount.');
});

bot.hears(/^(hi|pizza|discount)$/i, async (ctx) => {
  await loadSheet();

  if (!isInActiveHours()) {
    return ctx.reply("Discounts are available between 12:00 PM and 12:00 AM Phnom Penh time. Please come back later!");
  }

  const userId = ctx.from.id;
  const name = ctx.from.first_name;
  const username = ctx.from.username;
  const todayEntries = await getTodayEntries(userId);
  const pizzaCodes = todayEntries.filter(r => r.Code);

  if (pizzaCodes.length === 0) {
    const code = await getRandomCode('Code');
    if (!code) return ctx.reply('Sorry, we are out of pizza codes. Bring a friend and try their phone! 🍕');
    await writeToSheet(name, username, userId, code);
    await ctx.reply(`Here is your discount code: ${code}`);
    const drinkPrompt = await getDrinkMessage();
    if (drinkPrompt) await ctx.reply(drinkPrompt);
  } else if (pizzaCodes.length === 1) {
    const code = await getRandomCode('Code');
    if (!code) return ctx.reply('Sorry, no more pizza codes available today.');
    await writeToSheet(name, username, userId, code);
    await ctx.reply("You already claimed your discount today.\nBut alright… I’m giving you one more. Don’t tell the boss. 😅\n🍕 Extra discount code: " + code);
  } else {
    const msg = await getFollowupPizzaMessage();
    if (msg) await ctx.reply(msg);
    await writeToSheet(name, username, userId);
  }
});

bot.hears(/^(yes|drink)$/i, async (ctx) => {
  await loadSheet();
  const userId = ctx.from.id;
  const name = ctx.from.first_name;
  const username = ctx.from.username;
  const todayEntries = await getTodayEntries(userId);
  const alreadyHasDrink = todayEntries.find(r => r['Drink code']);

  if (!todayEntries.length) return ctx.reply("Please get your pizza discount first. Just say 'pizza'. 🍕");
  if (alreadyHasDrink) return ctx.reply("That's all for today! Come back tomorrow for another drink code. 🥤");

  const drinkCode = await getRandomCode('DrinkCode');
  if (!drinkCode) return ctx.reply('Sorry, drink codes are finished. 🥤');

  await writeToSheet(name, username, userId, '', drinkCode);
  await ctx.reply(`Here is your drink code: ${drinkCode}`);
});

bot.launch();

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running...'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
