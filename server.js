const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');

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

// Проверка, что сервер живой
app.get('/', (req, res) => {
  res.send('Бэкенд "Барахолка Березники" работает');
});

// Инициализация БД если файла нет
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ orders: [], products: [] }, null, 2), 'utf8');
  console.log('Создан пустой db.json');
}

// Чтение БД
function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (err) {
    console.error('Ошибка чтения db.json:', err);
    return { orders: [], products: [] };
  }
}

// Запись БД
function writeDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Ошибка записи в db.json:', err);
  }
}

// Эндпоинты

app.get('/products', (req, res) => {
  const db = readDB();
  res.json(db.products);
});

app.post('/products', (req, res) => {
  const db = readDB();
  const newProduct = req.body;
  newProduct.id = db.products.length + 1;
  db.products.push(newProduct);
  writeDB(db);
  console.log(`Добавлен товар: ${newProduct.title}`);
  res.json(newProduct);
});

app.post('/orders', (req, res) => {
  const db = readDB();
  const newOrder = req.body;
  newOrder.id = db.orders.length + 1;
  newOrder.status = 'new';
  newOrder.seller_id = 8050542983;           // ← ИЗМЕНИ НА СВОЙ TELEGRAM ID
  newOrder.created_at = new Date().toISOString();

  db.orders.push(newOrder);
  writeDB(db);

  console.log(`Создан новый заказ #${newOrder.id} от пользователя ${newOrder.user_id}`);

  res.json(newOrder);
});

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

app.patch('/orders/:id', (req, res) => {
  const db = readDB();
  const orderId = parseInt(req.params.id);
  const order = db.orders.find(o => o.id === orderId);

  if (!order) {
    return res.status(404).json({ error: 'Заказ не найден' });
  }

  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Поле status обязательно' });
  }

  order.status = status;
  order.updated_at = new Date().toISOString();
  writeDB(db);

  console.log(`Заказ #${orderId} изменён на статус: ${status}`);

  res.json(order);
});

// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на порту ${PORT} (http://0.0.0.0:${PORT})`);
});

// Добавляем тестовые товары ТОЛЬКО если их ещё нет
const db = readDB();
if (db.products.length === 0) {
  db.products = [
    {
      id: 1,
      title: "NY Black",
      desc: "Чёрная классика",
      price: 2500,
      image: "https://i.imgur.com/8QfKQwR.png"
    },
    {
      id: 2,
      title: "Adidas White",
      desc: "Белый минимал",
      price: 1800,
      image: "https://i.imgur.com/nQv1Y5G.png"
    },
    {
      id: 3,
      title: "Snapback Red",
      desc: "Street стиль",
      price: 2200,
      image: "https://i.imgur.com/L2zYVjM.png"
    }
  ];
  writeDB(db);
  console.log('Добавлены тестовые товары (первый запуск)');
}
