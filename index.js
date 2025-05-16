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
  const count = rows.filter(row => row.TelegramID === telegramID.toString() && new Date(row.Timestamp).toLocaleDateString() === today);
  return count.length;
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

async function getDrinkMessage() {
  const sheet = doc.sheetsByTitle['Drink message'];
  const rows = await sheet.getRows();
  const valid = rows.filter(row => row._rawData[0]);
  if (!valid.length) return '';
  return valid[Math.floor(Math.random() * valid.length)]._rawData[0];
}

async function getFollowupPizzaMessage(count) {
  const sheet = doc.sheetsByTitle['Messages'];
  const rows = await sheet.getRows();
  const valid = rows.filter(row => row._rawData[0] && !isNaN(parseInt(row._rawData[0])) && row._rawData[1]);

  if (count === 1) return valid.find(row => row._rawData[0] === '1')?._rawData[1];
  if (count === 2) return valid.find(row => row._rawData[0] === '2')?._rawData[1];

  const rest = valid.filter(row => parseInt(row._rawData[0]) > 2);
  return rest[Math.floor(Math.random() * rest.length)]?._rawData[1];
}

bot.start((ctx) => {
  ctx.reply('Welcome! You scanned the QR code and activated your discount.');
});

bot.hears(/^(hi|pizza|discount)$/i, async (ctx) => {
  await loadSheet();
  const userId = ctx.from.id;

  const phnomPenhTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' });
  const hour = new Date(phnomPenhTime).getHours();
  if (hour < 12 || hour >= 24) {
    return ctx.reply('Discount codes are only available between 12:00 PM and 12:00 AM Phnom Penh time.');
  }

  const countToday = await hasReceivedCodeToday(userId);
  const code = await getRandomCode('Code');
  if (!code) return ctx.reply('Sorry, we are out of pizza codes. Bring a friend and try their phone! 🍕');

  if (countToday === 0) {
    await writeToSheet(ctx.from.first_name, ctx.from.username, ctx.from.id, code);
    await ctx.reply(`Here is your discount code: ${code}`);
    const drinkPrompt = await getDrinkMessage();
    if (drinkPrompt) await ctx.reply(drinkPrompt);
  } else if (countToday === 1) {
    await writeToSheet(ctx.from.first_name, ctx.from.username, ctx.from.id, code);
    await ctx.reply("You already claimed your discount today.\nBut alright… I’m giving you one more. Don’t tell the boss. 😅\n🍕 Extra discount code: " + code);
  } else {
    const msg = await getFollowupPizzaMessage(countToday);
    if (msg) await ctx.reply(msg);
  }
});

bot.hears(/^(yes|drink)$/i, async (ctx) => {
  await loadSheet();
  const userId = ctx.from.id;
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Phnom_Penh' });

  const sheet = doc.sheetsByTitle['Users'];
  const rows = await sheet.getRows();
  const todayRows = rows.filter(row => row.TelegramID === userId.toString() && new Date(row.Timestamp).toLocaleDateString() === today);

  const alreadyHasDrink = todayRows.some(row => row['Drink code']);
  if (alreadyHasDrink) {
    return ctx.reply("That's all for today! Come back tomorrow for another drink code. 🥤");
  }

  const drinkCode = await getRandomCode('DrinkCode');
  if (!drinkCode) return ctx.reply('Sorry, drink codes are finished. 🥤');

  await writeToSheet(ctx.from.first_name, ctx.from.username, ctx.from.id, '', drinkCode);
  await ctx.reply(`Here is your drink code: ${drinkCode}`);
});

bot.hears(/.*/, async (ctx) => {
  // Ignore known keywords
  const msg = ctx.message.text.toLowerCase();
  if (msg.includes('pizza') || msg.includes('hi') || msg.includes('drink') || msg.includes('yes')) return;

  const count = await hasReceivedCodeToday(ctx.from.id);
  const msgText = await getFollowupPizzaMessage(count + 1);
  if (msgText) await ctx.reply(msgText);
});

bot.launch();

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running...'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
