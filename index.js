const { Telegraf } = require("telegraf");
const express = require("express");

const BOT_TOKEN = process.env.BOT_TOKEN;
const SELLER_CHAT_ID = parseInt(process.env.SELLER_CHAT_ID);
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN || !SELLER_CHAT_ID) {
  console.error("❌ Не задан BOT_TOKEN или SELLER_CHAT_ID");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();
app.use(express.json());

// --- Endpoint для мини приложения ---
app.post("/reserve", async (req, res) => {
  try {
    const data = req.body;
    if (data.type === "reserve") {
      const message = `
🎩 Новая бронь
Кепка: ${data.product_name}
Цена: ${data.price} ₽
Место встречи: ${data.meet_place}
Время встречи: ${data.meet_time}
UID покупателя: ${data.user_id}
      `;
      await bot.telegram.sendMessage(SELLER_CHAT_ID, message);
      res.json({ ok: true });
    } else {
      res.json({ ok: false, error: "Неверный тип" });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- Для проверки ---
app.get("/", (req, res) => res.send("Bot server is running"));

// --- Запуск сервера ---
app.listen(PORT, () => {
  console.log(`🌐 HTTP server listening on ${PORT}`);
});

// --- НЕ запускать bot.launch() ---
// Все обращения идут через webhook / POST на Render
