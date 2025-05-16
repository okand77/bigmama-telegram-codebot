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

async function getMessageFromSheet(sheetTitle) {
  const sheet = doc.sheetsByTitle[sheetTitle];
  const rows = await sheet.getRows();
  const valid = rows.filter(row => row._rawData[0] && !isNaN(parseInt(row._rawData[0])));
  if (valid.length === 0) return '';
  const randomRow = valid[Math.floor(Math.random() * valid.length)];
  return randomRow._rawData[1];
}

bot.start((ctx) => {
  ctx.reply('Welcome! You scanned the QR code and activated your discount.');
});

const pizzaClaimCount = new Map();

bot.hears(/^(hi|pizza|discount)$/i, async (ctx) => {
  await loadSheet();
  const userId = ctx.from.id;
  const name = ctx.from.first_name;
  const username = ctx.from.username || '';

  const claimed = pizzaClaimCount.get(userId) || 0;

  if (claimed >= 2) {
    const funnyMessage = await getMessageFromSheet('Messages');
    return ctx.reply(funnyMessage);
  }

  const pizzaCode = await getRandomCode('Code');
  if (!pizzaCode) return ctx.reply('Sorry, we are out of pizza codes. Bring a friend and try their phone! 🍕');

  pizzaClaimCount.set(userId, claimed + 1);

  await writeToSheet(name, username, userId, pizzaCode);
  if (claimed === 1) {
    await ctx.reply("You already claimed your discount today.\nBut alright… I’m giving you one more. Don’t tell the boss. 😅\n🍕 Extra discount code: " + pizzaCode);
  } else {
    await ctx.reply(`Here is your discount code: ${pizzaCode}`);
  }

  // DRINK mesaji eklendi
  const drinkPromo = await getMessageFromSheet('DrinkMessage');
  if (drinkPromo) {
    await ctx.reply(drinkPromo);
  }
});

bot.hears(/^(yes|drink)$/i, async (ctx) => {
  await loadSheet();
  const userId = ctx.from.id;
  const name = ctx.from.first_name;
  const username = ctx.from.username || '';

  const drinkCode = await getRandomCode('DrinkCode');
  if (!drinkCode) return ctx.reply('Sorry, drink codes are finished. 🥤');

  await writeToSheet(name, username, userId, '', drinkCode);

  const drinkMsg = await getMessageFromSheet('DrinkMessage');
  await ctx.reply(`Here is your drink code: ${drinkCode}`);
  if (drinkMsg) {
    await ctx.reply(drinkMsg);
  }
});

bot.launch();

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running...'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
