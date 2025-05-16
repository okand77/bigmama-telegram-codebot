const { GoogleSpreadsheet } = require('google-spreadsheet');
const creds = require('/etc/secrets/credentials.json');
const express = require('express');
const { Telegraf } = require('telegraf');
const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

const SHEET_ID = process.env.SPREADSHEET_ID;
let doc;
const messageCountMap = new Map(); // Kullanıcı başına pizza mesaj sayaçları

async function loadSheet() {
  doc = new GoogleSpreadsheet(SHEET_ID);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();
}

function isWithinTimeWindow() {
  const now = new Date();
  const phnomPenhTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' }));
  const hour = phnomPenhTime.getHours();
  return hour >= 12 && hour < 24;
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

async function writeToSheet(name, username, telegramID, code = '', drinkCode = '') {
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

async function hasReceivedCodeCountToday(telegramID) {
  const sheet = doc.sheetsByTitle['Users'];
  const rows = await sheet.getRows();
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Phnom_Penh' });
  return rows.filter(row =>
    row.TelegramID === telegramID.toString() &&
    new Date(row.Timestamp).toLocaleDateString('en-US', { timeZone: 'Asia/Phnom_Penh' }) === today &&
    row.Code
  ).length;
}

async function getFollowupPizzaMessage(userId) {
  const sheet = doc.sheetsByTitle['Messages'];
  const rows = await sheet.getRows();
  const validRows = rows.filter(row => row._rawData[0] && !isNaN(parseInt(row._rawData[0])));
  const sorted = validRows.sort((a, b) => parseInt(a._rawData[0]) - parseInt(b._rawData[0]));

  const counter = messageCountMap.get(userId) || 0;
  let message;

  if (counter < 2) {
    message = sorted[counter]?._rawData[1];
  } else {
    const randomIndex = Math.floor(Math.random() * (sorted.length - 2)) + 2;
    message = sorted[randomIndex]?._rawData[1];
  }

  messageCountMap.set(userId, counter + 1);
  return message || "Oops! No message found.";
}

async function getDrinkMessage() {
  const sheet = doc.sheetsByTitle['Drink message'];
  const rows = await sheet.getRows();
  const validRows = rows.filter(row => row._rawData[0] && !isNaN(parseInt(row._rawData[0])));
  const sorted = validRows.sort((a, b) => parseInt(a._rawData[0]) - parseInt(b._rawData[0]));
  const randomIndex = Math.floor(Math.random() * sorted.length);
  return sorted[randomIndex]?._rawData[1] || "Would you like a drink too? 🥤";
}

bot.start((ctx) => {
  ctx.reply('Welcome! You scanned the QR code and activated your discount.');
});

bot.hears(/^(hi|pizza|discount)$/i, async (ctx) => {
  await loadSheet();
  if (!isWithinTimeWindow()) {
    return ctx.reply("Sorry! Discount codes are only available from 12:00 PM to 12:00 AM Phnom Penh time. ⏰");
  }

  const userId = ctx.from.id;
  const codeCount = await hasReceivedCodeCountToday(userId);

  if (codeCount === 0) {
    const code = await getRandomCode('Code');
    if (!code) return ctx.reply("Sorry, pizza codes are finished. Bring a friend and try their phone. 🍕");
    await writeToSheet(ctx.from.first_name, ctx.from.username, userId, code);
    await ctx.reply(`Here is your discount code: ${code}`);

    const drinkPrompt = await getDrinkMessage();
    await ctx.reply(drinkPrompt);

  } else if (codeCount === 1) {
    const code = await getRandomCode('Code');
    if (!code) return ctx.reply("Sorry, pizza codes are finished. 🍕");
    await writeToSheet(ctx.from.first_name, ctx.from.username, userId, code);
    await ctx.reply("You already claimed your discount today.\nBut alright… I’m giving you one more. Don’t tell the boss. 😅\n🍕 Extra discount code: " + code);
  } else {
    const response = await getFollowupPizzaMessage(userId);
    await ctx.reply(response);
  }
});

bot.hears(/^(yes|drink)$/i, async (ctx) => {
  await loadSheet();
  if (!isWithinTimeWindow()) {
    return ctx.reply("Drink promo is only available between 12:00 PM and 12:00 AM. 🕛");
  }

  const userId = ctx.from.id;
  const drinkCode = await getRandomCode('DrinkCode');
  if (!drinkCode) return ctx.reply('Sorry, drink codes are finished. 🥤');
  await writeToSheet(ctx.from.first_name, ctx.from.username, userId, '', drinkCode);
  const msg = await getDrinkMessage();
  await ctx.reply(`Here is your drink code: ${drinkCode}`);
  await ctx.reply(msg);
});

bot.hears(/.*/, async (ctx) => {
  const msg = ctx.message.text.toLowerCase();
  if (msg.includes('pizza') || msg.includes('hi') || msg.includes('discount') || msg.includes('drink') || msg.includes('yes')) return;
  const response = await getFollowupPizzaMessage(ctx.from.id);
  if (response) await ctx.reply(response);
});

bot.launch();

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running...'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
