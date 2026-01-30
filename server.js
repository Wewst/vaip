const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
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
  newOrder.seller_id = 123456789; // Hardcode твоего seller_id (измени на свой Telegram ID)
  db.orders.push(newOrder);
  writeDB(db);
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Инициализируем тестовые продукты (если БД пустая)
const db = readDB();
if (db.products.length === 0) {
  db.products = [
    { id: 1, title: "NY Black", desc: "Чёрная классика", price: 2500, image: "https://i.imgur.com/8QfKQwR.png" },
    { id: 2, title: "Adidas White", desc: "Белый минимал", price: 1800, image: "https://i.imgur.com/nQv1Y5G.png" },
    { id: 3, title: "Snapback Red", desc: "Street стиль", price: 2200, image: "https://i.imgur.com/L2zYVjM.png" }
  ];
  writeDB(db);
}
