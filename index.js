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

async function hasReceivedCodeToday(telegramID, codeType = 'Code') {
  const sheet = doc.sheetsByTitle['Users'];
  const rows = await sheet.getRows();
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Phnom_Penh' });
  const todayRows = rows.filter(row => row.TelegramID === telegramID.toString() && new Date(row.Timestamp).toLocaleDateString('en-US', { timeZone: 'Asia/Phnom_Penh' }) === today);

  if (codeType === 'DrinkCode') return todayRows.length >= 1 && todayRows[0]['Drink code'];
  return todayRows.length >= 2;
}

async function writeToSheet(name, username, telegramID, code, drinkCode = '') {
  const sheet = doc.sheetsByTitle['Users'];
  await sheet.addRow({ Timestamp: new Date().toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' }), Name: name, Username: username, TelegramID: telegramID, Code: code, 'Drink code': drinkCode });
}

async function getMessageFromSheet(sheetTitle) {
  const sheet = doc.sheetsByTitle[sheetTitle];
  const rows = await sheet.getRows();
  const valid = rows.filter(row => row._rawData[0] && !isNaN(parseInt(row._rawData[0])));
  const sorted = valid.sort((a, b) => parseInt(a._rawData[0]) - parseInt(b._rawData[0]));
  const counter = userMessageMap.get(sheetTitle) || 0;
  const message = sorted[counter]?._rawData[1];
  userMessageMap.set(sheetTitle, counter + 1);
  return message;
}

async function getFollowupDrinkMessage() {
  const sheet = doc.sheetsByTitle['DrinkFollowup'];
  const rows = await sheet.getRows();
  const valid = rows.filter(row => row._rawData[0] && !isNaN(parseInt(row._rawData[0])));
  const sorted = valid.sort((a, b) => parseInt(a._rawData[0]) - parseInt(b._rawData[0]));
  const random = sorted[Math.floor(Math.random() * sorted.length)];
  return random?._rawData[1];
}

bot.start(async (ctx) => {
  await loadSheet();
  const userId = ctx.from.id;
  const code = await getRandomCode('Code');
  const message = await getMessageFromSheet('Messages');
  const drinkMessage = await getMessageFromSheet('DrinkMessage');

  if (code) {
    await ctx.reply(`${message}: ${code}`);
    await writeToSheet(ctx.from.first_name, ctx.from.username, ctx.from.id, code);
  }
  if (drinkMessage) {
    await ctx.reply(drinkMessage);
  }
});

bot.hears(/^(hi|pizza|discount)$/i, async (ctx) => {
  await loadSheet();
  const userId = ctx.from.id;
  const alreadyClaimed = await hasReceivedCodeToday(userId);

  if (alreadyClaimed) {
    const extraCodeGiven = userMessageMap.get('extra') || false;
    if (!extraCodeGiven) {
      const code = await getRandomCode('Code');
      await ctx.reply('You already claimed your discount today.\nBut alright… I’m giving you one more. Don’t tell the boss. 😅\n🍕 Extra discount code: ' + code);
      await writeToSheet(ctx.from.first_name, ctx.from.username, ctx.from.id, code);
      userMessageMap.set('extra', true);
    } else {
      const msg = await getMessageFromSheet('Messages');
      if (msg) await ctx.reply(msg);
    }
  } else {
    const code = await getRandomCode('Code');
    const message = await getMessageFromSheet('Messages');
    if (code) await ctx.reply(`${message}: ${code}`);
    await writeToSheet(ctx.from.first_name, ctx.from.username, ctx.from.id, code);
    const drinkPrompt = await getMessageFromSheet('DrinkMessage');
    if (drinkPrompt) await ctx.reply(drinkPrompt);
  }
});

bot.hears(/^(yes|drink)$/i, async (ctx) => {
  await loadSheet();
  const userId = ctx.from.id;
  const hasDrink = await hasReceivedCodeToday(userId, 'DrinkCode');

  if (hasDrink) {
    const followup = await getFollowupDrinkMessage();
    if (followup) return ctx.reply(followup);
    return ctx.reply("That's all for today! Come back tomorrow for another drink code. 🥤");
  }

  const drinkCode = await getRandomCode('DrinkCode');
  if (!drinkCode) return ctx.reply('Sorry, drink codes are finished. 🥤');

  await writeToSheet(ctx.from.first_name, ctx.from.username, ctx.from.id, '', drinkCode);
  await ctx.reply(`Here is your drink code: ${drinkCode}`);
});

bot.launch();

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running...'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
