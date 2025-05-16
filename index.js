const express = require('express');
const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');
const { GoogleSpreadsheet } = require('google-spreadsheet');

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => {
  ctx.reply('Welcome! You scanned the QR code and activated your discount.');
});

bot.hears('hi', (ctx) => {
  ctx.reply('Hello! 👋 Here is your discount code: ' + generateCode());
});

function generateCode() {
  const digits = '0123456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += digits[Math.floor(Math.random() * digits.length)];
  }
  return code;
}

bot.launch();
app.get('/', (req, res) => {
  res.send('Bot is running...');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
