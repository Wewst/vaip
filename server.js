const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const port = process.env.PORT || 3000;

// Токен бота (для уведомлений тебе/покупателю). Можно использовать один бот.
const BOT_TOKEN = '8144916530:AAHk1iLZp7EFfgAZyzZxVhHsjSjCeUNBhF8';  // ← замени
const bot = new TelegramBot(BOT_TOKEN);

// Твой Telegram ID — куда слать уведомления о новых заказах
const YOUR_TELEGRAM_ID = 8050542983;  // ← вставь свой ID от @userinfobot

const orders = new Map();
let orderIdCounter = 1000;

app.use(bodyParser.json());

// Эндпоинт для брони от покупателя
app.post('/api/reserve', (req, res) => {
  const { product_name, price, meet_place, meet_time, buyer_id, username } = req.body;

  if (!product_name || !price || !meet_place || !meet_time) {
    return res.status(400).json({ error: 'Не все поля заполнены' });
  }

  const orderId = String(orderIdCounter++);
  const order = {
    id: orderId,
    product_name,
    price: Number(price),
    meet_place,
    meet_time,
    status: 'new',
    buyer_id: Number(buyer_id) || 0,
    username: username || 'аноним',
    createdAt: new Date().toISOString()
  };

  orders.set(orderId, order);

  // Уведомление тебе
  bot.sendMessage(YOUR_TELEGRAM_ID,
    `🛒 НОВАЯ БРОНЬ #${orderId}\n\n${product_name} — ${price} ₽\n@${order.username}\nМесто: ${meet_place}\nВремя: ${meet_time}`
  ).catch(err => console.error('Не удалось отправить уведомление:', err));

  res.json({ success: true, orderId });
});

// Для продавца — все заказы
app.get('/api/orders', (req, res) => {
  res.json(Array.from(orders.values()));
});

// Обновление статуса
app.post('/api/update-status', (req, res) => {
  const { order_id, status } = req.body;

  if (!order_id || !['confirmed', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Неверные параметры' });
  }

  const order = orders.get(order_id);
  if (!order) return res.status(404).json({ error: 'Заказ не найден' });

  order.status = status;

  if (order.buyer_id > 0) {
    const msg = status === 'confirmed'
      ? `✅ Бронь подтверждена!\n${order.product_name} — ${order.meet_place} в ${order.meet_time}`
      : `❌ Бронь отменена.\n${order.product_name}`;

    bot.sendMessage(order.buyer_id, msg).catch(() => {});
  }

  res.json({ success: true });
});

app.listen(port, () => {
  console.log(`Бекенд работает на порту ${port}`);
});
