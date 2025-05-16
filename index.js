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

async function getTodayCodes(userId) {
  const sheet = doc.sheetsByTitle['Users'];
  const rows = await sheet.getRows();
  const today = new Date().toLocaleDateString();
  return rows.filter(row => row.TelegramID === userId.toString() && new Date(row.Timestamp).toLocaleDateString() === today);
}

async function getOrderedMessage(sheetTitle, countUsed) {
  const sheet = doc.sheetsByTitle[sheetTitle];
  const rows = await sheet.getRows();
  const valid = rows.filter(row => row._rawData[0] && !isNaN(parseInt(row._rawData[0])));
  const sorted = valid.sort((a, b) => parseInt(a._rawData[0]) - parseInt(b._rawData[0]));

  if (countUsed < 2) return sorted[countUsed]?._rawData[1];
  const random = sorted[Math.floor(Math.random() * (sorted.length - 2)) + 2];
  return random?._rawData[1];
}

async function getDrinkFollowupMessage() {
  const sheet = doc.sheetsByTitle['DrinkFollowup'];
  const rows = await sheet.getRows();
  if (!rows.length) return '';
  const numbered = rows.filter(row => row._rawData[0] && !isNaN(parseInt(row._rawData[0])));
  const random = numbered[Math.floor(Math.random() * numbered.length)];
  return random?._rawData[1];
}

async function getDrinkAdMessage() {
  const sheet = doc.sheetsByTitle['DrinkMessage'];
  const rows = await sheet.getRows();
  const valid = rows.filter(row => row._rawData[0] && !isNaN(parseInt(row._rawData[0])));
  const sorted = valid.sort((a, b) => parseInt(a._rawData[0]) - parseInt(b._rawData[0]));
  const index = userMessageMap.get('drinkAdCounter') || 0;
  const message = sorted[index]?._rawData[1];
  userMessageMap.set('drinkAdCounter', index + 1);
  return message;
}

bot.start(async (ctx) => {
  await ctx.reply('Welcome! You scanned the QR code and activated your discount.');
});

bot.hears(/^(hi|pizza|discount)$/i, async (ctx) => {
  await loadSheet();
  const userId = ctx.from.id;
  const name = ctx.from.first_name;
  const username = ctx.from.username;

  const todayRows = await getTodayCodes(userId);
  const pizzaCount = todayRows.filter(row => row.Code).length;

  if (pizzaCount >= 2) {
    const message = await getOrderedMessage('Messages', 2);
    return ctx.reply(message);
  }

  const code = await getRandomCode('Code');
  if (!code) return ctx.reply('Sorry, we are out of pizza codes. Bring a friend and try their phone! 🍕');

  await writeToSheet(name, username, userId, code);
  await ctx.reply(`Here is your discount code: ${code}`);

  if (pizzaCount === 0) {
    const ad = await getDrinkAdMessage();
    if (ad) await ctx.reply(ad);
  } else if (pizzaCount === 1) {
    const message = await getOrderedMessage('Messages', 1);
    if (message) await ctx.reply(`${message}\n🍕 Extra discount code: ${code}`);
  } else {
    const message = await getOrderedMessage('Messages', 2);
    if (message) await ctx.reply(message);
  }
});

bot.hears(/^(yes|drink)$/i, async (ctx) => {
  await loadSheet();
  const userId = ctx.from.id;
  const todayRows = await getTodayCodes(userId);
  const latest = todayRows[todayRows.length - 1];

  if (!latest) return ctx.reply("Please get your pizza discount first. Just say 'pizza'. 🍕");

  if (latest['Drink code']) {
    return ctx.reply("That's all for today! Come back tomorrow for another drink code. 🥤");
  }

  const drinkCode = await getRandomCode('DrinkCode');
  if (!drinkCode) return ctx.reply('Sorry, drink codes are finished. 🥤');

  latest['Drink code'] = drinkCode;
  await latest.save();
  await ctx.reply(`Here is your drink code: ${drinkCode}`);

  const followup = await getDrinkFollowupMessage();
  if (followup) await ctx.reply(followup);
});

bot.launch();

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running...'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
