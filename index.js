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

async function hasReceivedCodeToday(telegramID) {
  const sheet = doc.sheetsByTitle['Users'];
  const rows = await sheet.getRows();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' });
  return rows.filter(row => row.TelegramID === telegramID.toString() && new Date(row.Timestamp).toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' }) === today);
}

async function writeToSheet(name, username, telegramID, code, drinkCode = '') {
  const sheet = doc.sheetsByTitle['Users'];
  await sheet.addRow({ Timestamp: new Date().toLocaleString('en-CA', { timeZone: 'Asia/Phnom_Penh' }), Name: name, Username: username, TelegramID: telegramID, Code: code, 'Drink code': drinkCode });
}

async function getPizzaMessage() {
  const sheet = doc.sheetsByTitle['Messages'];
  const rows = await sheet.getRows();
  const valid = rows.filter(row => row._rawData[0] && !isNaN(parseInt(row._rawData[0])));
  const sorted = valid.sort((a, b) => parseInt(a._rawData[0]) - parseInt(b._rawData[0]));

  const userCount = userMessageMap.get('counter') || 0;
  let message;

  if (userCount === 0) message = sorted[0]._rawData[1];
  else if (userCount === 1) message = sorted[1]._rawData[1];
  else message = sorted[Math.floor(Math.random() * (sorted.length - 2)) + 2]._rawData[1];

  userMessageMap.set('counter', userCount + 1);
  return message;
}

async function getDrinkMessage() {
  const sheet = doc.sheetsByTitle['Drink message'];
  const rows = await sheet.getRows();
  const valid = rows.filter(row => row._rawData[0] && !isNaN(parseInt(row._rawData[0])));
  return valid.length > 0 ? valid[0]._rawData[1] : '';
}

function isWithinTimeRange() {
  const now = new Date().toLocaleTimeString('en-GB', { hour12: false, timeZone: 'Asia/Phnom_Penh' });
  return now >= '12:00:00' && now <= '23:59:59';
}

bot.start((ctx) => {
  ctx.reply('Welcome! You scanned the QR code and activated your discount.');
});

bot.hears(/^(hi|pizza|discount)$/i, async (ctx) => {
  await loadSheet();
  if (!isWithinTimeRange()) return ctx.reply("Sorry, discounts are available between 12:00 PM and midnight (Phnom Penh time).");

  const userId = ctx.from.id;
  const todayEntries = await hasReceivedCodeToday(userId);
  const alreadyClaimed = todayEntries.length > 0;
  const alreadyClaimedTwice = todayEntries.length > 1;
  const code = await getRandomCode('Code');
  if (!code) return ctx.reply('Sorry, we are out of pizza codes. Bring a friend and try their phone! 🍕');

  if (alreadyClaimedTwice) {
    const msg = await getPizzaMessage();
    return ctx.reply(msg);
  }

  await writeToSheet(ctx.from.first_name, ctx.from.username, ctx.from.id, code);

  if (!alreadyClaimed) {
    await ctx.reply(`Here is your discount code: ${code}`);
    const drinkPrompt = await getDrinkMessage();
    if (drinkPrompt) await ctx.reply(drinkPrompt);
  } else {
    await ctx.reply(`You already claimed your discount today.\nBut alright... I’m giving you one more. Don’t tell the boss. 😅\n🍕 Extra discount code: ${code}`);
  }
});

bot.hears(/^(yes|drink)$/i, async (ctx) => {
  await loadSheet();
  const userId = ctx.from.id;
  const todayEntries = await hasReceivedCodeToday(userId);
  if (todayEntries.length === 0) return ctx.reply("Please get your pizza discount first. Just say 'pizza'. 🍕");

  const latest = todayEntries[todayEntries.length - 1];
  if (latest['Drink code']) return ctx.reply("That's all for today! Come back tomorrow for another drink code. 🥤");

  const drinkCode = await getRandomCode('DrinkCode');
  if (!drinkCode) return ctx.reply('Sorry, drink codes are finished. 🥤');

  latest['Drink code'] = drinkCode;
  await latest.save();
  await ctx.reply(`Here is your drink code: ${drinkCode}`);
});

bot.hears(/.*/, async (ctx) => {
  const msg = ctx.message.text.toLowerCase();
  if (msg.includes('pizza') || msg.includes('hi') || msg.includes('drink') || msg.includes('yes')) return;
  const response = await getPizzaMessage();
  if (response) await ctx.reply(response);
});

bot.launch();

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running...'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
