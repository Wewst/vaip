const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'db.json');

// Конфигурация Telegram Bot (опционально - если не указано, уведомления не будут отправляться)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8144916530:AAHk1iLZp7EFfgAZyzZxVhHsjSjCeUNBhF8'; // Токен бота от @BotFather
const SELLER_CHAT_ID = process.env.SELLER_CHAT_ID || '8050542983'; // Chat ID продавца (Telegram ID)

// Middleware
app.use(bodyParser.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Инициализация БД если нет файла
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ orders: [], products: [] }), 'utf8');
}

// Чтение БД
function readDB() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

// Запись БД
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data), 'utf8');
}

// Функция отправки уведомления в Telegram
function sendTelegramNotification(order) {
  // Если токен бота не указан, просто пропускаем отправку
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('Telegram Bot Token не указан. Уведомление не отправлено.');
    return;
  }

  // Форматирование даты и времени
  function formatDateTime(dateTimeString) {
    if (!dateTimeString) return 'Не указано';
    const date = new Date(dateTimeString);
    if (isNaN(date.getTime())) return dateTimeString;
    
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 
                    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${day} ${month}, ${hours}:${minutes}`;
  }

  const telegramLink = order.telegram_link ? (order.telegram_link.startsWith('@') ? order.telegram_link : `@${order.telegram_link}`) : 'Не указан';
  const message = `🆕 Новый заказ!

📦 Товар: ${order.product_name || 'Не указан'}
💰 Цена: ${order.price || 0} ₽
📍 Место: ${order.meet_place || 'Не указано'}
🕐 Время: ${formatDateTime(order.meet_time)}
💬 Telegram: ${telegramLink}

ID заказа: #${order.id}`;

  // Убеждаемся что chat_id это число
  const chatId = parseInt(SELLER_CHAT_ID);
  if (isNaN(chatId)) {
    console.error('Некорректный SELLER_CHAT_ID:', SELLER_CHAT_ID);
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const data = JSON.stringify({
    chat_id: chatId,
    text: message
    // Убираем parse_mode чтобы избежать проблем с экранированием
  });

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  const req = https.request(url, options, (res) => {
    let responseData = '';
    
    res.on('data', (chunk) => {
      responseData += chunk;
    });
    
    res.on('end', () => {
      if (res.statusCode !== 200) {
        console.error(`Ошибка отправки уведомления: ${res.statusCode}`);
        console.error('Ответ от Telegram API:', responseData);
      } else {
        console.log('Уведомление успешно отправлено');
      }
    });
  });

  req.on('error', (error) => {
    console.error('Ошибка при отправке уведомления в Telegram:', error.message);
  });

  req.write(data);
  req.end();
}

// Эндпоинты

// GET /products - получить список товаров (для покупателя)
app.get('/products', (req, res) => {
  const db = readDB();
  res.json(db.products);
});

// POST /products - добавить товар (для продавца, но пока не реализовано в фронте)
app.post('/products', (req, res) => {
  const db = readDB();
  const newProduct = req.body;
  newProduct.id = db.products.length + 1;
  db.products.push(newProduct);
  writeDB(db);
  res.json(newProduct);
});

// POST /orders - создать заказ
app.post('/orders', (req, res) => {
  const db = readDB();
  const newOrder = req.body;
  newOrder.id = db.orders.length + 1;
  newOrder.status = 'new'; // Начальный статус
  newOrder.seller_id = 8050542983; // Hardcode твоего seller_id (измени на свой Telegram ID)
  db.orders.push(newOrder);
  writeDB(db);
  
  // Отправляем уведомление продавцу (не блокируем ответ)
  try {
    sendTelegramNotification(newOrder);
  } catch (error) {
    console.error('Ошибка при отправке уведомления:', error);
    // Не прерываем выполнение, даже если уведомление не отправилось
  }
  
  res.json(newOrder);
});

// GET /orders - получить заказы (фильтр по user_id или seller_id)
app.get('/orders', (req, res) => {
  const db = readDB();
  const { user_id, seller_id } = req.query;
  let filtered = db.orders;
  if (user_id) {
    filtered = filtered.filter(o => o.user_id === parseInt(user_id));
  } else if (seller_id) {
    filtered = filtered.filter(o => o.seller_id === parseInt(seller_id));
  }
  res.json(filtered);
});

// PATCH /orders/:id - обновить статус
app.patch('/orders/:id', (req, res) => {
  const db = readDB();
  const orderId = parseInt(req.params.id);
  const order = db.orders.find(o => o.id === orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  order.status = req.body.status;
  writeDB(db);
  res.json(order);
});

// Добавляем маршрут для пинга (чтобы сервис не засыпал)
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Инициализируем тестовые продукты (если БД пустая)
const db = readDB();
if (db.products.length === 0) {
  db.products = [
    { id: 1, title: "Наркоз", desc: "Жижа наркоз со вкусом граната, 20 мг", price: 480, image: "https://psv4.userapi.com/s/v1/d2/SJx5pLjly9YEat6y6hyToLMEfiaJIJmm1Y3brDd3YiiCvc0AP4zBgs6U7zGCzvzVB7qXJcv4wrWe4NA7l9lUzKzZDVlk5BfFSFH7eu4RdocUtapD-bPly0MKJZiUn98xcQVZvKww-ZM8/4pAPPXAEg65L8c2z2HLw73_0-1000x1000.jpg" },
    { id: 2, title: "Кетсвил", desc: "Жижа кетствил со вкусом винограда, 20 мг", price: 500, image: "https://psv4.userapi.com/s/v1/d2/HBJ8AFxnc9KsWoERzhDipCaTBX8W-poKtrml_9N6WlCreThnQvAOHEZeCH60huqt3DkTCOoBi9DXnMha1YTByFGPad_vNWlp43NxZtc4LwhQcxfdKWlE5k2LRJcJ_D6QpmDowaWJnjVu/Catswill-salt-kislyj-vinogradnyj-chupa-chups-20-hard-M.webp" },
    { id: 3, title: "Подонки Малазия", desc: "Жижа со вкусом арбуза, 70 мг", price: 550, image: "https://psv4.userapi.com/s/v1/d2/-ISoFHpQ7H4cBilQZQAe1nRU9eL3mhTXebk16abbin-WujD077wq91O2Ekg-4e4Zn1aoFjlsnjvaj-qnF_9C5aKmUffmkhHNFb_5RIzqELTi8R8xL9Z5EFFCcpF04NXBd6soFB5ZQ8xU/hycsctr6ztvdog2hcd9vjac1x5krc32w.jpg" }
  ];
  writeDB(db);
}
