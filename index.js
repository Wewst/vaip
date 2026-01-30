// index.js
const { Telegraf } = require("telegraf");
const http = require("http");

// --- Настройки ---
const BOT_TOKEN = process.env.BOT_TOKEN; // токен должен быть в Environment Variables Render
const SELLER_CHAT_ID = parseInt(process.env.SELLER_CHAT_ID); // Telegram ID продавца (число)
if (!BOT_TOKEN || !SELLER_CHAT_ID) {
  console.error("❌ Не задан BOT_TOKEN или SELLER_CHAT_ID в переменных окружения");
  process.exit(1);
}

// --- Инициализация бота ---
const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => ctx.reply("Бот запущен!"));

// Обработка данных из Mini App
bot.on("text", (ctx) => {
  try {
    const data = JSON.parse(ctx.message.text);
    if (data.type === "reserve") {
      const message = `
🎩 Новая бронь
Кепка: ${data.product_name}
Цена: ${data.price} ₽
Место встречи: ${data.meet_place}
Время встречи: ${data.meet_time}
Покупатель: ${ctx.from.first_name} (@${ctx.from.username})
UID: ${ctx.from.id}
      `;
      ctx.telegram.sendMessage(SELLER_CHAT_ID, message);
      ctx.reply("✅ Бронь отправлена продавцу");
    }
  } catch (e) {
    // Не JSON — игнорируем
  }
});

// --- Запуск бота ---
bot.launch()
  .then(() => console.log("🤖 Бот запущен"))
  .catch(err => {
    console.error("❌ Ошибка запуска бота:", err);
    process.exit(1);
  });

// --- HTTP сервер для Render free plan ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("OK");
}).listen(PORT, () => console.log(`🌐 HTTP server listening on ${PORT}`));

// Graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
