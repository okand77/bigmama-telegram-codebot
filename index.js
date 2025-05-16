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

async function getTodayPizzaClaims(telegramID) {
  const sheet = doc.sheetsByTitle['Users'];
  const rows = await sheet.getRows();
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Phnom_Penh' });
  return rows.filter(row => row.TelegramID === telegramID.toString() && new Date(row.Timestamp).toLocaleDateString('en-US', { timeZone: 'Asia/Phnom_Penh' }) === today);
}

async function writeToSheet(name, username, telegramID, code, drinkCode = '') {
  const sheet = doc.sheetsByTitle['Users'];
  await sheet.addRow({ Timestamp: new Date().toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' }), Name: name, Username: username, TelegramID: telegramID, Code: code, 'Drink code': drinkCode });
}

function getDrinkMessageFallback() {
  return 'Would you like a code for a drink too? Pepsi is now just $0.50 instead of $2. 🥤 If you want, just say "drink".';
}

async function getFollowupPizzaMessage() {
  const sheet = doc.sheetsByTitle['Messages'];
  const rows = await sheet.getRows();
  const valid = rows.filter(row => row._rawData[0] && !isNaN(parseInt(row._rawData[0])));
  const sorted = valid.sort((a, b) => parseInt(a._rawData[0]) - parseInt(b._rawData[0]));
  if (sorted.length <= 3) return sorted[0]._rawData[1];
  return sorted[Math.floor(Math.random() * (sorted.length - 3)) + 3]._rawData[1];
}

bot.start((ctx) => {
  ctx.reply('Welcome! You scanned the QR code and activated your discount.');
});

bot.hears(/^(hi|pizza|discount)$/i, async (ctx) => {
  await loadSheet();
  const userId = ctx.from.id;
  const todayClaims = await getTodayPizzaClaims(userId);

  if (todayClaims.length >= 2) {
    const followup = await getFollowupPizzaMessage();
    return ctx.reply(followup);
  }

  const code = await getRandomCode('Code');
  if (!code) return ctx.reply('Sorry, we are out of pizza codes. Bring a friend and try their phone! 🍕');

  await writeToSheet(ctx.from.first_name, ctx.from.username, ctx.from.id, code);

  if (todayClaims.length === 0) {
    await ctx.reply(`Here is your discount code: ${code}`);
    const drinkMessage = getDrinkMessageFallback();
    await ctx.reply(drinkMessage);
  } else {
    await ctx.reply("You already claimed your discount today.\nBut alright... I'm giving you one more. Don't tell the boss. 😅\n🍕 Extra discount code: " + code);
  }
});

bot.hears(/^(yes|drink)$/i, async (ctx) => {
  await loadSheet();
  const userId = ctx.from.id;
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Phnom_Penh' });

  const sheet = doc.sheetsByTitle['Users'];
  const rows = await sheet.getRows();
  const todayRows = rows.filter(row => row.TelegramID === userId.toString() && new Date(row.Timestamp).toLocaleDateString('en-US', { timeZone: 'Asia/Phnom_Penh' }) === today);

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
