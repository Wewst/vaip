const { Telegraf, Markup } = require("telegraf");

/* ================= НАСТРОЙКИ ================= */

// 🔴 ВСТАВЬ СЮДА НОВЫЙ ТОКЕН (НЕ ПАЛИ ЕГО)
const BOT_TOKEN = "8289215978:AAE8yPhfmAhmZ38N7DK25ntE9b0IN1cNxgY";

// 🔴 chat_id продавца
const SELLER_CHAT_ID = 8050542983;

/* ============================================= */

const bot = new Telegraf(BOT_TOKEN);

/**
 * Простейшее хранилище броней
 * (пока в памяти, можно заменить на БД)
 */
const orders = new Map();

/* ---------- ПОЛУЧЕНИЕ ДАННЫХ ИЗ MINI APP ---------- */
bot.on("message", async (ctx) => {
  const msg = ctx.message;

  if (!msg.web_app_data) return;

  let data;
  try {
    data = JSON.parse(msg.web_app_data.data);
  } catch {
    return;
  }

  if (data.type !== "reserve") return;

  // жёсткая проверка
  if (!data.meet_place || !data.meet_time) {
    await ctx.reply("❌ Не указано место или время.");
    return;
  }

  const user = msg.from;
  const orderId = data.product_id || `${user.id}_${Date.now()}`;

  const order = {
    id: orderId,
    product: data.product_name,
    price: data.price,
    place: data.meet_place,
    time: data.meet_time,
    user_id: user.id,
    username: user.username || null,
    status: "pending"
  };

  orders.set(orderId, order);

  const text =
`🧢 НОВАЯ БРОНЬ

Товар: ${order.product}
Цена: ${order.price} ₽

📍 Место: ${order.place}
⏰ Время: ${order.time}

👤 Покупатель:
ID: ${order.user_id}
${order.username ? "@" + order.username : "без username"}
`;

  await ctx.telegram.sendMessage(
    SELLER_CHAT_ID,
    text,
    Markup.inlineKeyboard([
      [
        Markup.button.callback("✅ Подтвердить", `confirm_${orderId}`),
        Markup.button.callback("❌ Отклонить", `reject_${orderId}`)
      ]
    ])
  );

  await ctx.reply("✅ Бронь отправлена продавцу. Ожидай подтверждения.");
});

/* ---------- ОБРАБОТКА КНОПОК ПРОДАВЦА ---------- */
bot.on("callback_query", async (ctx) => {
  const action = ctx.callbackQuery.data;

  if (!action.includes("_")) return;

  const [type, orderId] = action.split("_");
  const order = orders.get(orderId);

  if (!order) {
    await ctx.answerCbQuery("Бронь не найдена");
    return;
  }

  if (order.status !== "pending") {
    await ctx.answerCbQuery("Эта бронь уже обработана");
    return;
  }

  if (type === "confirm") {
    order.status = "confirmed";

    await ctx.telegram.sendMessage(
      order.user_id,
      "✅ Твоя бронь подтверждена! Продавец скоро напишет тебе."
    );

    await ctx.editMessageText(
      ctx.callbackQuery.message.text + "\n\n✅ БРОНЬ ПОДТВЕРЖДЕНА"
    );

    await ctx.answerCbQuery("Подтверждено");
  }

  if (type === "reject") {
    order.status = "rejected";

    await ctx.telegram.sendMessage(
      order.user_id,
      "❌ Бронь отклонена продавцом."
    );

    await ctx.editMessageText(
      ctx.callbackQuery.message.text + "\n\n❌ БРОНЬ ОТКЛОНЕНА"
    );

    await ctx.answerCbQuery("Отклонено");
  }
});

const http = require("http");

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("OK");
}).listen(PORT, () => {
  console.log(`🌐 HTTP server listening on ${PORT}`);
});

/* ---------- СЛУЖЕБНО ---------- */
bot.launch();
console.log("🤖 Бот запущен");
