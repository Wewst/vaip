const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const port = process.env.PORT || 3000;

// ← Токены ботов (обязательно замени!)
const BUYER_BOT_TOKEN = '8289215978:AAE8yPhfmAhmZ38N7DK25ntE9b0IN1cNxgY';      // токен бота покупателей
const SELLER_BOT_TOKEN = '8144916530:AAHk1iLZp7EFfgAZyzZxVhHsjSjCeUNBhF8';     // токен бота продавцов

const buyerBot = new TelegramBot(BUYER_BOT_TOKEN);
const sellerBot = new TelegramBot(SELLER_BOT_TOKEN);

// Хранение заказов в памяти (id → объект заказа)
const orders = new Map();           // Map<string, object>
let orderIdCounter = 1000;          // простой счётчик для id

app.use(bodyParser.json());
app.use(express.static('public'));  // если захочешь разместить html прямо здесь (опционально)

// Создание заказа (вызывается ботом покупателя)
app.post('/api/reserve', (req, res) => {
  const { product_name, price, meet_place, meet_time, buyer_id, seller_id } = req.body;

  if (!product_name || !price || !meet_place || !meet_time || !buyer_id) {
    return res.status(400).json({ error: 'Не хватает обязательных полей' });
  }

  const orderId = String(orderIdCounter++);
  const order = {
    id: orderId,
    product_name,
    price: Number(price),
    meet_place,
    meet_time,
    status: 'new',
    buyer_id: Number(buyer_id),
    seller_id: Number(seller_id || 123456789), // ← замени на реальный telegram id продавца, если фиксированный
    createdAt: new Date().toISOString()
  };

  orders.set(orderId, order);

  // Уведомляем покупателя
  buyerBot.sendMessage(buyer_id, 
    `✅ Бронь отправлена!\n\nТовар: ${product_name}\nЦена: ${price} ₽\nМесто: ${meet_place}\nВремя: ${meet_time}\n\nОжидайте подтверждения от продавца.`
  ).catch(console.error);

  // Уведомляем продавца
  sellerBot.sendMessage(seller_id || 123456789,
    `🛒 Новый заказ!\n\nТовар: ${product_name}\nЦена: ${price} ₽\nПокупатель: @${req.body.username || 'аноним'}\nМесто: ${meet_place}\nВремя: ${meet_time}\n\nОткройте мини-приложение, чтобы подтвердить или отменить.`
  ).catch(console.error);

  res.json({ success: true, orderId });
});

// Получить заказы продавца
app.get('/api/orders', (req, res) => {
  const seller_id = Number(req.query.seller_id);

  if (!seller_id) {
    return res.status(400).json({ error: 'seller_id обязателен' });
  }

  const sellerOrders = Array.from(orders.values())
    .filter(o => o.seller_id === seller_id);

  res.json(sellerOrders);
});

// Обновить статус заказа
app.post('/api/update-status', (req, res) => {
  const { order_id, status, seller_id } = req.body;

  if (!order_id || !status || !['confirmed', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Неверные данные' });
  }

  const order = orders.get(order_id);
  if (!order) {
    return res.status(404).json({ error: 'Заказ не найден' });
  }

  if (order.seller_id !== Number(seller_id)) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }

  order.status = status;
  order.updatedAt = new Date().toISOString();

  // Уведомляем покупателя
  const text = status === 'confirmed'
    ? `🎉 Бронь подтверждена!\n\nТовар: ${order.product_name}\nМесто: ${order.meet_place}\nВремя: ${order.meet_time}`
    : `❌ Бронь отменена продавцом.\nТовар: ${order.product_name}`;

  buyerBot.sendMessage(order.buyer_id, text).catch(console.error);

  // Можно уведомить и продавца, но необязательно
  // sellerBot.sendMessage(seller_id, `Статус заказа #${order_id} изменён на ${status}`);

  res.json({ success: true });
});

app.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
});
