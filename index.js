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
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Phnom_Penh' });
  return rows.filter(row => row.TelegramID === telegramID.toString() && new Date(row.Timestamp).toLocaleDateString('en-US', { timeZone: 'Asia/Phnom_Penh' }) === today);
}

async function writeToSheet(name, username, telegramID, code, drinkCode = '') {
  const sheet = doc.sheetsByTitle['Users'];
  await sheet.addRow({
    Timestamp: new Date().toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' }),
    Name: name,
    Username: username,
    TelegramID: telegramID,
    Code: code,
    'Drink code': drinkCode
  });
}

async function getFollowupPizzaMessage() {
  const sheet = doc.sheetsByTitle['Messages'];
  const rows = await sheet.getRows();
  const valid = rows.filter(row => row._rawData[0] && !isNaN(parseInt(row._rawData[0])));
  const sorted = valid.sort((a, b) => parseInt(a._rawData[0]) - parseInt(b._rawData[0]));

  const counter = userMessageMap.get('counter') || 0;
  userMessageMap.set('counter', counter + 1);

  if (counter < 2) return sorted[counter]?._rawData[1];
  const rest = sorted.slice(2);
  return rest[Math.floor(Math.random() * rest.length)]?._rawData[1];
}

// Şimdilik burası sabit yazıldı ki hata varsa anlayalım
async function getDrinkMessage() {
  return 'Would you like a code for a drink too? Pepsi is now just $0.50 instead of $2. 🥤 If you want, just say \"drink\".';
}

bot.start((ctx) => {
  ctx.reply('Welcome! You scanned the QR code and activated your discount.');
});

bot.hears(/^(hi|pizza|discount)$/i, async (ctx) => {
  const now = new Date();
  const phnomPenhTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' }));
  const hour = phnomPenhTime.getHours();
  if (hour < 12 || hour >= 24) return ctx.reply('Sorry, the discount campaign is only available from 12:00 to 00:00 Phnom Penh time.');

  await loadSheet();
  const userId = ctx.from.id;
  const todayRecords = await hasReceivedCodeToday(userId);
  const pizzaCount = todayRecords.filter(row => row.Code).length;

  if (pizzaCount >= 2) {
    const msg = await getFollowupPizzaMessage();
    if (msg) return ctx.reply(msg);
    return;
  }

  const code = await getRandomCode('Code');
  if (!code) return ctx.reply('Sorry, we are out of pizza codes. Bring a friend and try their phone! 🍕');

  await writeToSheet(ctx.from.first_name, ctx.from.username, userId, code);
  await ctx.reply(
    pizzaCount === 0
      ? `Here is your discount code: ${code}`
      : `You already claimed your discount today.\nBut alright... I’m giving you one more. Don’t tell the boss. 😅\n🍕 Extra discount code: ${code}`
  );

  if (pizzaCount === 0) {
    const drinkPrompt = await getDrinkMessage();
    if (drinkPrompt) await ctx.reply(drinkPrompt);
  }
});

bot.hears(/^(yes|drink)$/i, async (ctx) => {
  await loadSheet();
  const userId = ctx.from.id;
  const todayRows = await hasReceivedCodeToday(userId);

  if (!todayRows.length) {
    return ctx.reply("Please get your pizza discount first. Just say 'pizza'. 🍕");
  }

  const lastEntry = todayRows[todayRows.length - 1];
  if (lastEntry['Drink code']) {
    return ctx.reply("That's all for today! Come back tomorrow for another drink code. 🥤");
  }

  const drinkCode = await getRandomCode('DrinkCode');
  if (!drinkCode) return ctx.reply('Sorry, drink codes are finished. 🥤');

  lastEntry['Drink code'] = drinkCode;
  await lastEntry.save();
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
