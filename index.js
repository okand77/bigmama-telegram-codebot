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
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Phnom_Penh' });
  return rows.filter(row => row.TelegramID === telegramID.toString() && new Date(row.Timestamp).toLocaleDateString('en-US', { timeZone: 'Asia/Phnom_Penh' }) === today);
}

async function writeToSheet(name, username, telegramID, code, drinkCode = '') {
  const sheet = doc.sheetsByTitle['Users'];
  await sheet.addRow({ Timestamp: new Date().toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' }), Name: name, Username: username, TelegramID: telegramID, Code: code, 'Drink code': drinkCode });
}

async function getFollowupPizzaMessage(counter) {
  const sheet = doc.sheetsByTitle['Messages'];
  const rows = await sheet.getRows();
  const numbered = rows.filter(row => row._rawData[0] && !isNaN(parseInt(row._rawData[0])));
  const sorted = numbered.sort((a, b) => parseInt(a._rawData[0]) - parseInt(b._rawData[0]));

  if (counter === 0) return sorted[0]._rawData[1];
  if (counter === 1) return sorted[1]._rawData[1];

  const randomIndex = Math.floor(Math.random() * (sorted.length - 2)) + 2;
  return sorted[randomIndex]?._rawData[1];
}

const userMessageCounter = new Map();

bot.start((ctx) => {
  ctx.reply('Welcome! You scanned the QR code and activated your discount.');
});

bot.hears(/^(hi|pizza|discount)$/i, async (ctx) => {
  const now = new Date().toLocaleTimeString('en-US', { hour12: false, timeZone: 'Asia/Phnom_Penh' });
  const hour = parseInt(now.split(":")[0]);
  if (hour < 12 || hour >= 24) return ctx.reply('Codes are only available from 12:00 PM to 12:00 AM (Phnom Penh time).');

  await loadSheet();
  const userId = ctx.from.id;
  const records = await hasReceivedCodeToday(userId);
  const counter = userMessageCounter.get(userId) || 0;

  if (records.length === 0) {
    const code = await getRandomCode('Code');
    if (!code) return ctx.reply('Sorry, we are out of pizza codes. Bring a friend and try their phone! 🍕');
    await writeToSheet(ctx.from.first_name, ctx.from.username, ctx.from.id, code);
    await ctx.reply(`Here is your discount code: ${code}`);
    await ctx.reply('Would you like a code for a drink too? Pepsi is now just $0.50 instead of $2. 🥤 If you want, just say "drink".');
  } else if (records.length === 1) {
    const code = await getRandomCode('Code');
    if (!code) return ctx.reply('Sorry, pizza codes are finished. 🍕');
    await writeToSheet(ctx.from.first_name, ctx.from.username, ctx.from.id, code);
    await ctx.reply("You already claimed your discount today.\nBut alright… I’m giving you one more. Don’t tell the boss. 😅\n🍕 Extra discount code: " + code);
  } else {
    const msg = await getFollowupPizzaMessage(counter);
    userMessageCounter.set(userId, counter + 1);
    await ctx.reply(msg);
  }
});

bot.hears(/^(yes|drink)$/i, async (ctx) => {
  await loadSheet();
  const userId = ctx.from.id;
  const records = await hasReceivedCodeToday(userId);

  if (!records.length) {
    return ctx.reply("Please get your pizza discount first. Just say 'pizza'. 🍕");
  }

  const latest = records[records.length - 1];
  if (latest['Drink code']) {
    return ctx.reply("That's all for today! Come back tomorrow for another drink code. 🥤");
  }

  const drinkCode = await getRandomCode('DrinkCode');
  if (!drinkCode) return ctx.reply('Sorry, drink codes are finished. 🥤');

  latest['Drink code'] = drinkCode;
  await latest.save();
  await ctx.reply(`Here is your drink code: ${drinkCode}`);
});

bot.hears(/.*/, async (ctx) => {
  const msg = ctx.message.text.toLowerCase();
  if (msg.includes('pizza') || msg.includes('hi') || msg.includes('drink') || msg.includes('yes')) return;

  const counter = userMessageCounter.get(ctx.from.id) || 0;
  const msgText = await getFollowupPizzaMessage(counter);
  userMessageCounter.set(ctx.from.id, counter + 1);
  await ctx.reply(msgText);
});

bot.launch();

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running...'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
