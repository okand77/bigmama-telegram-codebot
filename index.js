const { GoogleSpreadsheet } = require('google-spreadsheet');
const creds = require('/etc/secrets/credentials.json');
const express = require('express');
const { Telegraf } = require('telegraf');
const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

const SHEET_ID = process.env.SPREADSHEET_ID;
let doc;
const userUsage = new Map();
const drinkPromptCounter = new Map();
const pizzaMessageCounter = new Map();

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
    Timestamp: new Date().toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' }),
    Name: name,
    Username: username,
    TelegramID: telegramID,
    Code: code,
    'Drink code': drinkCode
  });
}

async function getDrinkPrompt() {
  const sheet = doc.sheetsByTitle['DrinkMessage'];
  const rows = await sheet.getRows();
  const numbered = rows.filter(row => row._rawData[0]);
  const index = drinkPromptCounter.get('drink') || 0;
  const msg = numbered[index % numbered.length]._rawData[1];
  drinkPromptCounter.set('drink', index + 1);
  return msg;
}

async function getFollowupMessage() {
  const sheet = doc.sheetsByTitle['Messages'];
  const rows = await sheet.getRows();
  const validRows = rows.filter(row => row._rawData[0]);
  const index = pizzaMessageCounter.get('pizza') || 0;
  let msg = '';

  if (index < 2) {
    msg = validRows[index]._rawData[1];
  } else {
    const rest = validRows.slice(2);
    msg = rest[Math.floor(Math.random() * rest.length)]._rawData[1];
  }

  pizzaMessageCounter.set('pizza', index + 1);
  return msg;
}

async function getDrinkFollowupMessage() {
  const sheet = doc.sheetsByTitle['DrinkFollowup'];
  const rows = await sheet.getRows();
  if (!rows.length) return '';
  const valid = rows.filter(row => row._rawData[1]);
  return valid[Math.floor(Math.random() * valid.length)]._rawData[1];
}

function isWithinTimeRange() {
  const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' });
  const hour = new Date(now).getHours();
  return hour >= 12 && hour < 24;
}

// -- BOT STARTS --

bot.start((ctx) => {
  ctx.reply('Welcome! You scanned the QR code and activated your discount.');
});

bot.hears(/^(hi|pizza|discount)$/i, async (ctx) => {
  if (!isWithinTimeRange()) return ctx.reply('Sorry, discount codes are only available between 12:00 and 00:00 (Phnom Penh time).');

  await loadSheet();
  const userId = ctx.from.id;
  const count = userUsage.get(userId) || 0;

  if (count === 0) {
    const code = await getRandomCode('Code');
    if (!code) return ctx.reply('Sorry, pizza codes are out. Bring a friend and try their phone! 🍕');
    userUsage.set(userId, 1);
    await writeToSheet(ctx.from.first_name, ctx.from.username, userId, code);
    await ctx.reply(`Here is your discount code: ${code}`);
    const drinkPrompt = await getDrinkPrompt();
    if (drinkPrompt) await ctx.reply(drinkPrompt);
  } else if (count === 1) {
    const code = await getRandomCode('Code');
    if (!code) return ctx.reply('Sorry, pizza codes are out. Bring a friend and try their phone! 🍕');
    userUsage.set(userId, 2);
    await writeToSheet(ctx.from.first_name, ctx.from.username, userId, code);
    await ctx.reply("You already claimed your discount today.\nBut alright… I’m giving you one more. Don’t tell the boss. 😅\n🍕 Extra discount code: " + code);
  } else {
    const followup = await getFollowupMessage();
    if (followup) await ctx.reply(followup);
  }
});

bot.hears(/^(yes|drink)$/i, async (ctx) => {
  await loadSheet();
  const userId = ctx.from.id;
  const drinkCode = await getRandomCode('DrinkCode');
  if (!drinkCode) return ctx.reply('Sorry, drink codes are finished.');

  await writeToSheet(ctx.from.first_name, ctx.from.username, userId, '', drinkCode);
  await ctx.reply(`Here is your drink code: ${drinkCode}`);
  const followup = await getDrinkFollowupMessage();
  if (followup) await ctx.reply(followup);
});

bot.launch();

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running...'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
