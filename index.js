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
  return rows.filter(row => row.TelegramID === telegramID.toString() && new Date(row.Timestamp).toLocaleDateString() === today);
}

async function writeToSheet(name, username, telegramID, code, drinkCode = '') {
  const sheet = doc.sheetsByTitle['Users'];
  await sheet.addRow({ Timestamp: new Date().toLocaleString(), Name: name, Username: username, TelegramID: telegramID, Code: code, 'Drink code': drinkCode });
}

async function getDrinkMessage() {
  const sheet = doc.sheetsByTitle['Drink message'];
  const rows = await sheet.getRows();
  const valid = rows.filter(row => row._rawData[0] && !isNaN(parseInt(row._rawData[0])));
  if (!valid.length) return '';
  return valid[Math.floor(Math.random() * valid.length)]._rawData[1];
}

async function getFollowupPizzaMessage() {
  const sheet = doc.sheetsByTitle['Messages'];
  const rows = await sheet.getRows();
  const valid = rows.filter(row => row._rawData[0] && !isNaN(parseInt(row._rawData[0])));
  const sorted = valid.sort((a, b) => parseInt(a._rawData[0]) - parseInt(b._rawData[0]));

  const userId = userMessageMap.get('counter') || 0;
  let index = userId < 3 ? userId : Math.floor(Math.random() * (sorted.length - 3)) + 3;

  userMessageMap.set('counter', userId + 1);
  return sorted[index]?._rawData[1];
}

const userMessageMap = new Map();
const userCodeMap = new Map();

bot.start((ctx) => {
  ctx.reply('Welcome! You scanned the QR code and activated your discount.');
});

bot.hears(/^(hi|pizza|discount)$/i, async (ctx) => {
  await loadSheet();
  const userId = ctx.from.id;
  const name = ctx.from.first_name;
  const username = ctx.from.username;
  const now = new Date();
  const phnomPenhHour = now.getUTCHours() + 7;
  if (phnomPenhHour < 12 || phnomPenhHour >= 24) return;

  const todayEntries = await hasReceivedCodeToday(userId);

  if (todayEntries.length === 0) {
    const code = await getRandomCode('Code');
    if (!code) return ctx.reply('Sorry, we are out of pizza codes. 🍕');
    await writeToSheet(name, username, userId, code);
    await ctx.reply(`Here is your discount code: ${code}`);

    const drinkPrompt = await getDrinkMessage();
    if (drinkPrompt) await ctx.reply(drinkPrompt);
    userCodeMap.set(userId, 1);
  } else if (userCodeMap.get(userId) === 1) {
    const code = await getRandomCode('Code');
    if (!code) return ctx.reply('Sorry, we are out of pizza codes. 🍕');
    await writeToSheet(name, username, userId, code);
    await ctx.reply("You already claimed your discount today.\nBut alright... I’m giving you one more. Don’t tell the boss. 😅\n🍕 Extra discount code: " + code);
    userCodeMap.set(userId, 2);
  } else {
    const response = await getFollowupPizzaMessage();
    if (response) await ctx.reply(response);
  }
});

bot.hears(/^(yes|drink)$/i, async (ctx) => {
  await loadSheet();
  const userId = ctx.from.id;
  const today = new Date().toLocaleDateString();

  const sheet = doc.sheetsByTitle['Users'];
  const rows = await sheet.getRows();
  const todayRows = rows.filter(row => row.TelegramID === userId.toString() && new Date(row.Timestamp).toLocaleDateString() === today);

  if (!todayRows.length) {
    return ctx.reply("Please get your pizza discount first. Just say 'pizza'. 🍕");
  }

  const alreadyHasDrink = todayRows[todayRows.length - 1]['Drink code'];
  if (alreadyHasDrink) {
    return ctx.reply("That's all for today! Come back tomorrow for another drink code. 🥤");
  }

  const drinkCode = await getRandomCode('DrinkCode');
  if (!drinkCode) return ctx.reply('Sorry, drink codes are finished. 🥤');

  todayRows[todayRows.length - 1]['Drink code'] = drinkCode;
  await todayRows[todayRows.length - 1].save();
  await ctx.reply(`Here is your drink code: ${drinkCode}`);
});

bot.hears(/.*/, async (ctx) => {
  const msg = ctx.message.text.toLowerCase();
  if (msg.includes('pizza') || msg.includes('hi') || msg.includes('drink') || msg.includes('yes')) return;
  const response = await getFollowupPizzaMessage();
  if (response) await ctx.reply(response);
});

bot.launch();

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running...'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
