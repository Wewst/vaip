const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'db.json');

// Конфигурация Telegram Bot (опционально - если не указано, уведомления не будут отправляться)
// 
// ИНСТРУКЦИЯ ПО НАСТРОЙКЕ:
// 1. Создайте бота через @BotFather в Telegram
// 2. Получите токен (формат: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz)
// 3. Задайте токен одним из способов:
//    - Через переменную окружения: TELEGRAM_BOT_TOKEN=ваш_токен
//    - Или замените пустую строку '' на ваш токен в строке ниже
//
// 4. ВАЖНО: Пользователь (продавец) должен сначала начать диалог с ботом (отправить /start),
//    иначе бот не сможет отправлять сообщения!
//
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8144916530:AAHk1iLZp7EFfgAZyzZxVhHsjSjCeUNBhF8'; // Токен бота от @BotFather
const SELLER_CHAT_ID = process.env.SELLER_CHAT_ID || '8050542983'; // Chat ID продавца (Telegram ID)

// Логирование конфигурации (без токена для безопасности)
console.log('Telegram Bot настроен:', TELEGRAM_BOT_TOKEN ? 'Да (токен установлен)' : 'Нет (токен не установлен)');
console.log('SELLER_CHAT_ID:', SELLER_CHAT_ID);

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
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.trim() === '') {
    console.log('Telegram Bot Token не указан. Уведомление не отправлено.');
    return;
  }

  // Форматирование даты и времени
  function formatDateTime(dateTimeString) {
    if (!dateTimeString) return 'Не указано';
    try {
      const date = new Date(dateTimeString);
      if (isNaN(date.getTime())) return dateTimeString;
      
      const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 
                      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
      const day = date.getDate();
      const month = months[date.getMonth()];
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      
      return `${day} ${month}, ${hours}:${minutes}`;
    } catch (e) {
      return dateTimeString;
    }
  }

  const telegramLink = order.telegram_link ? (order.telegram_link.startsWith('@') ? order.telegram_link : `@${order.telegram_link}`) : 'Не указан';
  const message = `🆕 Новый заказ!

📦 Товар: ${order.product_name || 'Не указан'}
💰 Цена: ${order.price || 0} ₽
📍 Место: ${order.meet_place || 'Не указано'}
🕐 Время: ${formatDateTime(order.meet_time)}
💬 Telegram: ${telegramLink}

ID заказа: #${order.id}`;

  // Используем seller_id из заказа, если он есть, иначе используем SELLER_CHAT_ID
  let chatId = order.seller_id || SELLER_CHAT_ID;
  
  // Преобразуем в число, если это строка с числом
  if (typeof chatId === 'string') {
    const parsed = parseInt(chatId);
    if (!isNaN(parsed)) {
      chatId = parsed;
    }
  }
  
  if (!chatId || (typeof chatId !== 'number' && typeof chatId !== 'string')) {
    console.error('❌ Некорректный chat_id для отправки уведомления');
    console.error('seller_id из заказа:', order.seller_id);
    console.error('SELLER_CHAT_ID из конфига:', SELLER_CHAT_ID);
    return;
  }
  
  console.log('📨 Отправка уведомления продавцу (chat_id):', chatId);

  // Валидация токена (должен быть в формате числа:буквы)
  const cleanToken = TELEGRAM_BOT_TOKEN.trim();
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(cleanToken)) {
    console.error('❌ Некорректный формат Telegram Bot Token. Формат должен быть: число:буквы');
    console.error('Пример правильного токена: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz');
    return;
  }

  console.log('📤 Отправка уведомления продавцу...');
  console.log('Chat ID продавца:', chatId);
  console.log('Токен бота (первые 10 символов):', cleanToken.substring(0, 10) + '...');

  const url = `https://api.telegram.org/bot${cleanToken}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: message
  };

  const data = JSON.stringify(payload);

  const urlObj = new URL(url);
  const options = {
    hostname: urlObj.hostname,
    port: 443,
    path: urlObj.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data, 'utf8')
    }
  };

  const req = https.request(options, (res) => {
    let responseData = '';
    
    res.on('data', (chunk) => {
      responseData += chunk.toString();
    });
    
    res.on('end', () => {
      try {
        const response = JSON.parse(responseData);
        if (res.statusCode === 200 && response.ok) {
          console.log('✅ Уведомление успешно отправлено в Telegram');
        } else {
          console.error(`❌ Ошибка отправки уведомления продавцу: ${res.statusCode}`);
          console.error('Полный ответ от Telegram API:', JSON.stringify(response, null, 2));
          if (response.description) {
            console.error('📋 Описание ошибки:', response.description);
            
            // Полезные подсказки для частых ошибок
            if (response.description.includes('chat not found') || response.description.includes('chat_id is empty')) {
              console.error('💡 ВАЖНО: Пользователь (продавец) должен сначала начать диалог с ботом!');
              console.error('💡 Отправьте команду /start боту в Telegram, чтобы он мог отправлять вам сообщения.');
            } else if (response.description.includes('Unauthorized')) {
              console.error('💡 ВАЖНО: Неверный токен бота! Проверьте TELEGRAM_BOT_TOKEN.');
            } else if (response.description.includes('Bad Request')) {
              console.error('💡 ВАЖНО: Неверный формат запроса. Проверьте chat_id и токен.');
            }
          }
          if (response.error_code) {
            console.error('Код ошибки:', response.error_code);
          }
        }
      } catch (e) {
        console.error('Ошибка парсинга ответа:', responseData);
      }
    });
  });

  req.on('error', (error) => {
    console.error('Ошибка при отправке уведомления в Telegram:', error.message);
  });

  req.write(data);
  req.end();
}

// Функция отправки напоминания о встрече
function sendMeetingReminder(order, isSeller = true) {
  // Если токен бота не указан, просто пропускаем отправку
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.trim() === '') {
    return;
  }

  // Форматирование даты и времени
  function formatDateTime(dateTimeString) {
    if (!dateTimeString) return 'Не указано';
    try {
      const date = new Date(dateTimeString);
      if (isNaN(date.getTime())) return dateTimeString;
      
      const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 
                      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
      const day = date.getDate();
      const month = months[date.getMonth()];
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      
      return `${day} ${month}, ${hours}:${minutes}`;
    } catch (e) {
      return dateTimeString;
    }
  }

  const telegramLink = order.telegram_link ? (order.telegram_link.startsWith('@') ? order.telegram_link : `@${order.telegram_link}`) : 'Не указан';
  
  let message;
  let chatId;
  
  if (isSeller) {
    // Сообщение для продавца
    message = `⏰ Напоминание: встреча через 15 минут!

📦 Товар: ${order.product_name || 'Не указан'}
💰 Цена: ${order.price || 0} ₽
📍 Место: ${order.meet_place || 'Не указано'}
🕐 Время встречи: ${formatDateTime(order.meet_time)}
💬 Telegram покупателя: ${telegramLink}

ID заказа: #${order.id}

Не забудьте о встрече!`;
    chatId = order.seller_id || SELLER_CHAT_ID;
  } else {
    // Сообщение для покупателя (если нужно будет в будущем)
    message = `⏰ Напоминание: встреча через 15 минут!

📦 Товар: ${order.product_name || 'Не указан'}
💰 Цена: ${order.price || 0} ₽
📍 Место: ${order.meet_place || 'Не указано'}
🕐 Время встречи: ${formatDateTime(order.meet_time)}

ID заказа: #${order.id}

Не забудьте о встрече!`;
    chatId = order.user_id;
  }

  // Преобразуем chat_id в число
  if (typeof chatId === 'string') {
    const parsed = parseInt(chatId);
    if (!isNaN(parsed)) {
      chatId = parsed;
    }
  }

  if (!chatId) {
    return;
  }

  const cleanToken = TELEGRAM_BOT_TOKEN.trim();
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(cleanToken)) {
    return;
  }

  const url = `https://api.telegram.org/bot${cleanToken}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: message
  };

  const data = JSON.stringify(payload);
  const urlObj = new URL(url);
  const options = {
    hostname: urlObj.hostname,
    port: 443,
    path: urlObj.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data, 'utf8')
    }
  };

  const req = https.request(options, (res) => {
    let responseData = '';
    res.on('data', (chunk) => {
      responseData += chunk.toString();
    });
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log(`✅ Напоминание о встрече отправлено для заказа #${order.id} (${isSeller ? 'продавцу' : 'покупателю'})`);
      }
    });
  });

  req.on('error', (error) => {
    // Тихая обработка ошибок для напоминаний
  });

  req.write(data);
  req.end();
}

// Функция проверки и отправки напоминаний о встречах (за 15 минут до встречи)
function checkAndSendReminders() {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.trim() === '') {
    return;
  }

  try {
    const db = readDB();
    const now = new Date();
    
    // Проверяем заказы со статусом 'new' или 'confirmed' (активные заказы)
    const activeOrders = db.orders.filter(order => 
      order.status === 'new' || order.status === 'confirmed'
    );
    
    if (activeOrders.length === 0) {
      return;
    }

    let remindersSent = 0;
    
    activeOrders.forEach(order => {
      if (!order.meet_time) {
        return; // Пропускаем заказы без времени встречи
      }

      try {
        const meetTime = new Date(order.meet_time);
        if (isNaN(meetTime.getTime())) {
          console.log(`⚠️ Невалидная дата для заказа #${order.id}: ${order.meet_time}`);
          return; // Пропускаем невалидные даты
        }

        // Вычисляем разницу во времени до встречи (в миллисекундах)
        const timeDiff = meetTime.getTime() - now.getTime();
        const minutesUntilMeeting = timeDiff / (1000 * 60);

        // Логируем для отладки (только для заказов, где до встречи меньше 20 минут)
        if (minutesUntilMeeting > 0 && minutesUntilMeeting < 20) {
          console.log(`🔍 Заказ #${order.id}: до встречи ${Math.round(minutesUntilMeeting)} минут (встреча: ${meetTime.toLocaleString('ru-RU')}, сейчас: ${now.toLocaleString('ru-RU')})`);
        }

        // Отправляем напоминание, если до встречи осталось от 14 до 16 минут
        // (небольшой диапазон, чтобы не отправлять несколько раз)
        // Расширяем диапазон до 13-17 минут для большей надежности
        if (minutesUntilMeeting >= 13 && minutesUntilMeeting <= 17) {
          // Проверяем, не отправляли ли уже напоминание (чтобы не спамить)
          if (!order.reminder_sent) {
            console.log(`📤 Отправка напоминания для заказа #${order.id} (до встречи: ${Math.round(minutesUntilMeeting)} минут)`);
            console.log(`   Время встречи: ${meetTime.toLocaleString('ru-RU')}`);
            console.log(`   Текущее время: ${now.toLocaleString('ru-RU')}`);
            sendMeetingReminder(order, true); // Отправляем продавцу
            // Помечаем, что напоминание отправлено
            order.reminder_sent = true;
            remindersSent++;
          } else {
            console.log(`⏭️ Напоминание для заказа #${order.id} уже было отправлено ранее`);
          }
        }
      } catch (e) {
        console.error(`❌ Ошибка при обработке заказа #${order.id}:`, e.message);
        console.error('Данные заказа:', JSON.stringify(order, null, 2));
      }
    });

    // Сохраняем изменения в БД, если были отправлены напоминания
    if (remindersSent > 0) {
      writeDB(db);
      console.log(`📨 Отправлено ${remindersSent} напоминаний о встречах`);
    }
  } catch (error) {
    console.error('❌ Ошибка при проверке заказов для напоминаний:', error);
    console.error('Stack trace:', error.stack);
  }
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
  
  // Запускаем периодическую проверку заказов для напоминаний о встречах
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_TOKEN.trim() !== '') {
    console.log('⏰ Система напоминаний о встречах запущена (проверка каждую минуту)');
    // Первая проверка сразу при запуске
    checkAndSendReminders();
    // Проверяем каждую минуту, чтобы точно поймать момент за 15 минут до встречи
    setInterval(checkAndSendReminders, 60 * 1000); // 1 минута = 60000 мс
  } else {
    console.log('⚠️ Telegram Bot Token не установлен. Напоминания о встречах отключены.');
  }
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
