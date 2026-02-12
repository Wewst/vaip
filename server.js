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
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8144916530:AAHk1iLZp7EFfgAZyzZxVhHsjSjCeUNBhF8'; // Токен бота для продавца (уведомления о заказах и напоминания)
const SELLER_CHAT_ID = process.env.SELLER_CHAT_ID || '8050542983'; // Chat ID продавца (Telegram ID)

// Второй бот — только для напоминаний покупателям за 15 минут до встречи.
// Создай отдельного бота через @BotFather; покупатель должен один раз написать ему /start.
const BUYER_BOT_TOKEN = process.env.BUYER_BOT_TOKEN || '8289215978:AAGO7FscrCaQhSwCvF12Is-MXEGn9tmcw3w'; // Токен бота для покупателей (оставь '' если не нужен)

// Пермский край, Россия — UTC+5. Время с фронта (datetime-local) приходит без пояса;
// сервер в UTC воспринимает его как UTC. Переводим: "15:47" у пользователя = 15:47 Пермь = 10:47 UTC.
const PERM_UTC_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Парсит meet_time как местное время Пермского края (UTC+5) и возвращает момент в UTC. */
function meetTimeToUTC(meetTimeString) {
  if (!meetTimeString) return null;
  const parsed = new Date(meetTimeString);
  if (isNaN(parsed.getTime())) return null;
  return new Date(parsed.getTime() - PERM_UTC_OFFSET_MS);
}

// Логирование конфигурации (без токена для безопасности)
console.log('Telegram Bot (продавец):', TELEGRAM_BOT_TOKEN ? 'Да' : 'Нет');
console.log('Telegram Bot (покупатели, напоминания):', BUYER_BOT_TOKEN ? 'Да' : 'Нет');
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

// Функция отправки напоминания о встрече (продавцу — бот продавца, покупателю — отдельный бот)
function sendMeetingReminder(order, isSeller = true) {
  const token = isSeller ? TELEGRAM_BOT_TOKEN : BUYER_BOT_TOKEN;
  if (!token || token.trim() === '') {
    if (isSeller) console.error('❌ Токен бота продавца не установлен');
    else console.log('⏭️ Токен бота для покупателей не задан — напоминание покупателю пропущено');
    return false;
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
    console.error(`❌ Нет chat_id для отправки напоминания (заказ #${order.id})${isSeller ? '' : ' (у заказа нет user_id — покупатель заходил из приложения?)'}`);
    return false;
  }

  const cleanToken = token.trim();
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(cleanToken)) {
    console.error('❌ Неверный формат токена бота');
    return false;
  }
  
  console.log(`📨 Попытка отправить напоминание: chat_id=${chatId}, заказ #${order.id}`);

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
          console.log(`✅✅✅ НАПОМИНАНИЕ УСПЕШНО ОТПРАВЛЕНО для заказа #${order.id} (${isSeller ? 'продавцу' : 'покупателю'})`);
          console.log(`   Chat ID: ${chatId}`);
          console.log(`   Message ID: ${response.result?.message_id || 'N/A'}`);
        } else {
          console.error(`❌❌❌ КРИТИЧЕСКАЯ ОШИБКА отправки напоминания для заказа #${order.id}: ${res.statusCode}`);
          console.error('Полный ответ от Telegram:', JSON.stringify(response, null, 2));
          if (response.description) {
            console.error('Описание ошибки:', response.description);
          }
        }
      } catch (e) {
        console.error(`❌ Ошибка парсинга ответа для заказа #${order.id}:`, responseData);
        console.error('Ошибка:', e.message);
      }
    });
  });

  req.on('error', (error) => {
    console.error(`❌ Ошибка сети при отправке напоминания для заказа #${order.id}:`, error.message);
    console.error('Stack:', error.stack);
  });

  req.write(data);
  req.end();
  
  // Запрос отправлен (результат будет в callback)
}

// Функция проверки и отправки напоминаний о встречах (за 15 минут до встречи)
function checkAndSendReminders() {
  console.log('🔄 Запуск проверки напоминаний...');
  
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.trim() === '') {
    console.log('⏸️ Пропуск проверки: токен бота не установлен');
    return;
  }

  try {
    const db = readDB();
    const now = new Date();
    console.log(`🕐 Проверка напоминаний в ${now.toLocaleString('ru-RU')} (${now.toISOString()})`);
    console.log(`📦 Всего заказов в БД: ${db.orders.length}`);
    console.log(`🕐 Проверка напоминаний в ${now.toLocaleString('ru-RU')}`);
    
    // Проверяем заказы со статусом 'new' или 'confirmed' (активные заказы)
    const activeOrders = db.orders.filter(order => 
      order.status === 'new' || order.status === 'confirmed'
    );
    
    console.log(`📋 Найдено активных заказов: ${activeOrders.length}`);
    
    if (activeOrders.length === 0) {
      console.log('ℹ️ Нет активных заказов для проверки');
      return;
    }

    let remindersSent = 0;
    
    activeOrders.forEach(order => {
      if (!order.meet_time) {
        console.log(`⚠️ Заказ #${order.id} без времени встречи (meet_time: ${order.meet_time})`);
        return; // Пропускаем заказы без времени встречи
      }

      try {
        console.log(`🔍 Проверка заказа #${order.id}: meet_time = "${order.meet_time}"`);
        const meetTime = meetTimeToUTC(order.meet_time);
        if (!meetTime) {
          console.log(`⚠️ Невалидная дата для заказа #${order.id}: ${order.meet_time}`);
          return; // Пропускаем невалидные даты
        }
        console.log(`   Встреча (Пермь): ${order.meet_time} → UTC: ${meetTime.toISOString()}`);

        // Вычисляем разницу до встречи (now и meetTime в UTC)
        const timeDiff = meetTime.getTime() - now.getTime();
        const minutesUntilMeeting = timeDiff / (1000 * 60);

        // Логируем для заказов, где до встречи меньше 30 минут (всё в UTC)
        if (minutesUntilMeeting > 0 && minutesUntilMeeting < 30) {
          console.log(`🔍 Заказ #${order.id}: до встречи ${Math.round(minutesUntilMeeting * 10) / 10} мин (встреча в Перми ≈ ${order.meet_time})`);
          console.log(`   Встреча UTC: ${meetTime.toISOString()}, сейчас UTC: ${now.toISOString()}`);
          console.log(`   reminder_sent: ${order.reminder_sent || false}`);
          console.log(`   last_reminder_time: ${order.last_reminder_time || 'нет'}`);
        }

        // ОТПРАВЛЯЕМ НАПОМИНАНИЕ, ЕСЛИ ДО ВСТРЕЧИ ОСТАЛОСЬ ПРИМЕРНО 15 МИНУТ
        // Узкое окно 14–16 минут, чтобы напоминание было "за 15 минут"
        console.log(`   ⏱️ Заказ #${order.id}: до встречи ${Math.round(minutesUntilMeeting * 10) / 10} минут`);
        
        if (minutesUntilMeeting >= 14 && minutesUntilMeeting <= 16) {
          console.log(`   ✅✅✅ УСЛОВИЕ ВЫПОЛНЕНО (≈15 минут)! Должно отправиться напоминание для заказа #${order.id}`);
          // Проверяем, не отправляли ли уже напоминание в последние 10 минут
          const lastReminderTime = order.last_reminder_time ? new Date(order.last_reminder_time) : null;
          const minutesSinceLastReminder = lastReminderTime ? (now.getTime() - lastReminderTime.getTime()) / (1000 * 60) : Infinity;
          
          // Отправляем, если не отправляли или прошло больше 5 минут (более гибко)
          if (!order.reminder_sent || minutesSinceLastReminder > 5) {
            console.log(`📤 ОТПРАВКА НАПОМИНАНИЯ для заказа #${order.id} (до встречи: ${Math.round(minutesUntilMeeting * 10) / 10} мин)`);
            console.log(`   Время встречи в Перми: ${order.meet_time}, UTC: ${meetTime.toISOString()}`);
            console.log(`   Сейчас UTC: ${now.toISOString()}`);
            
            // Напоминание продавцу (бот продавца)
            sendMeetingReminder(order, true);
            // Напоминание покупателю (другой бот; нужен order.user_id и BUYER_BOT_TOKEN)
            sendMeetingReminder(order, false);
            // Помечаем, что напоминание отправлено (даже если будет ошибка, попробуем еще раз через 10 минут)
            order.reminder_sent = true;
            order.last_reminder_time = now.toISOString();
            remindersSent++;
            console.log(`✅ Напоминание помечено как отправленное для заказа #${order.id}`);
          } else {
            console.log(`⏭️ Напоминание для заказа #${order.id} уже было отправлено ${Math.round(minutesSinceLastReminder)} минут назад`);
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
    } else {
      console.log(`ℹ️ Напоминаний не отправлено (проверено заказов: ${activeOrders.length})`);
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

// Эндпоинт для принудительной отправки напоминания (для тестирования)
app.post('/send-reminder/:orderId', (req, res) => {
  try {
    const db = readDB();
    const orderId = parseInt(req.params.orderId);
    const order = db.orders.find(o => o.id === orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    console.log(`🔔 ПРИНУДИТЕЛЬНАЯ ОТПРАВКА напоминания для заказа #${orderId}`);
    sendMeetingReminder(order, true);
    
    res.json({ 
      success: true, 
      message: 'Напоминание отправлено',
      order_id: orderId 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Тестовый эндпоинт для проверки напоминаний
app.get('/test-reminders', (req, res) => {
  try {
    const db = readDB();
    const now = new Date();
    const activeOrders = db.orders.filter(order => 
      (order.status === 'new' || order.status === 'confirmed') && order.meet_time
    );
    
    const ordersInfo = activeOrders.map(order => {
      const meetTime = meetTimeToUTC(order.meet_time);
      if (!meetTime) {
        return { id: order.id, product_name: order.product_name, meet_time: order.meet_time, error: 'invalid meet_time', minutes_until: null, should_send: false };
      }
      const timeDiff = meetTime.getTime() - now.getTime();
      const minutesUntilMeeting = timeDiff / (1000 * 60);
      
      return {
        id: order.id,
        product_name: order.product_name,
        meet_time: order.meet_time,
        meet_time_utc: meetTime.toISOString(),
        minutes_until: Math.round(minutesUntilMeeting),
        status: order.status,
        reminder_sent: order.reminder_sent || false,
        should_send: minutesUntilMeeting >= 14 && minutesUntilMeeting <= 16 && !order.reminder_sent
      };
    });
    
    res.json({
      current_time: now.toISOString(),
      current_time_local: now.toLocaleString('ru-RU'),
      active_orders_count: activeOrders.length,
      orders: ordersInfo
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  
  // Запускаем периодическую проверку заказов для напоминаний о встречах
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_TOKEN.trim() !== '') {
    console.log('⏰ Система напоминаний о встречах запущена (проверка каждые 10 секунд)');
    // Первая проверка сразу при запуске
    console.log('🔄 Первая проверка напоминаний...');
    checkAndSendReminders();
    // Проверяем каждые 10 секунд для максимальной точности
    const reminderInterval = setInterval(() => {
      checkAndSendReminders();
    }, 10 * 1000); // 10 секунд = 10000 мс
    
    // Сохраняем интервал для возможной остановки в будущем
    console.log('✅ Интервал проверки установлен:', reminderInterval);
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
