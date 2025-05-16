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
  return rows.some(row => row.TelegramID === telegramID.toString() && new Date(row.Timestamp).toLocaleDateString() === today);
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

// SABİT içecek mesajı
async function getDrinkMessage() {
  return "Would you like a code for a drink too? Pepsi is now just $0.50 instead of $2. 🥤";
}

// SABİT esprili pizza mesajları
async function getFollowupPizzaMessage() {
  const messages = [
    "😬 My boss will fire me for this...",
    "Still too early to give another one 😅",
    "Come back tomorrow. Just a few hours to go! ⏳",
    "Bring a friend and they’ll get a code on their phone! 😉",
    "Too many pizzas today! Even the oven needs a break. 🔥",
    "You’re back?! You really love discounts huh? 😂",
    "Hang tight! I’m reloading codes for tomorrow. ⏱️",
    "You’ve reached max pizza joy for today! 🎉",
    "Okay okay… tomorrow is another delicious day! 🍕",
    "I feel like a discount dealer now 😄"
  ];

  return messages[Math.floor(Math.random() * messages.length)];
}

bot.start((ctx) => {
  ctx.reply('Welcome! You scanned the QR code and activated your discount.');
});

bot.hears(/^(hi|pizza|discount)$/i, async (ctx) => {
  try {
    await loadSheet();
    const userId = ctx.from.id;
    const alreadyClaimed = await hasReceivedCodeToday(userId);
    const code = await getRandomCode('Code');
    if (!code) return ctx.reply('Sorry, we are out of pizza codes. Bring a friend and try their phone! 🍕');

    if (alreadyClaimed) {
      await ctx.reply("You already claimed your discount today.\nBut alright… I’m giving you one more. Don’t tell the boss. 😅\n🍕 Extra discount code: " + code);
    } else {
      await writeToSheet(ctx.from.first_name, ctx.from.username, ctx.from.id, code);
      await ctx.reply(`Here is your discount code: ${code}`);

      const drinkPrompt = await getDrinkMessage();
      if (drinkPrompt) {
        await ctx.reply(drinkPrompt);
      }
    }
  } catch (error) {
    console.error('Main message error:', error);
    ctx.reply("Something went wrong. Please try again later.");
  }
});

bot.hears(/^(yes|drink)$/i, async (ctx) => {
  try {
    await loadSheet();
    const userId = ctx.from.id;
    const today = new Date().toLocaleDateString();
    const sheet = doc.sheetsByTitle['Users'];
    const rows = await sheet.getRows();
    const todayRows = rows.filter(row => row.TelegramID === userId.toString() && new Date(row.Timestamp).toLocaleDateString() === today);

    if (!todayRows.length) {
      return ctx.reply("Please get your pizza discount first. Just say 'pizza'. 🍕");
    }

    const alreadyHasDrink = todayRows[0]['Drink code'];
    if (alreadyHasDrink) {
      return ctx.reply("That's all for today! Come back tomorrow for another drink code. 🥤");
    }

    const drinkCode = await getRandomCode('DrinkCode');
    if (!drinkCode) return ctx.reply('Sorry, drink codes are finished. 🥤');

    todayRows[0]['Drink code'] = drinkCode;
    await todayRows[0].save();
    await ctx.reply(`Here is your drink code: ${drinkCode}`);
  } catch (error) {
    console.error('Drink message error:', error);
    ctx.reply("Something went wrong while processing your drink code.");
  }
});

bot.hears(/.*/, async (ctx) => {
  try {
    const msg = ctx.message.text.toLowerCase();
    if (msg.includes('pizza') || msg.includes('hi') || msg.includes('drink') || msg.includes('yes')) return;

    const response = await getFollowupPizzaMessage();
    if (response) await ctx.reply(response);
  } catch (error) {
    console.error('Fallback message error:', error);
  }
});

bot.launch();

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running...'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
