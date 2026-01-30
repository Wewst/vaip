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
  newOrder.seller_id = 8050542983; // Hardcode твоего seller_id (измени на свой Telegram ID)
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
    { id: 1, title: "Наркоз", desc: "Жижа наркоз со вкусом граната, 20 мг", price: 480, image: "https://psv4.userapi.com/s/v1/d2/SJx5pLjly9YEat6y6hyToLMEfiaJIJmm1Y3brDd3YiiCvc0AP4zBgs6U7zGCzvzVB7qXJcv4wrWe4NA7l9lUzKzZDVlk5BfFSFH7eu4RdocUtapD-bPly0MKJZiUn98xcQVZvKww-ZM8/4pAPPXAEg65L8c2z2HLw73_0-1000x1000.jpg" },
    { id: 2, title: "Кетсвил", desc: "Жижа кетствил со вкусом винограда, 20 мг", price: 500, image: "https://psv4.userapi.com/s/v1/d2/HBJ8AFxnc9KsWoERzhDipCaTBX8W-poKtrml_9N6WlCreThnQvAOHEZeCH60huqt3DkTCOoBi9DXnMha1YTByFGPad_vNWlp43NxZtc4LwhQcxfdKWlE5k2LRJcJ_D6QpmDowaWJnjVu/Catswill-salt-kislyj-vinogradnyj-chupa-chups-20-hard-M.webp" },
    { id: 3, title: "Подонки Малазия", desc: "Жижа со вкусом арбуза, 70 мг", price: 550, image: "https://psv4.userapi.com/s/v1/d2/-ISoFHpQ7H4cBilQZQAe1nRU9eL3mhTXebk16abbin-WujD077wq91O2Ekg-4e4Zn1aoFjlsnjvaj-qnF_9C5aKmUffmkhHNFb_5RIzqELTi8R8xL9Z5EFFCcpF04NXBd6soFB5ZQ8xU/hycsctr6ztvdog2hcd9vjac1x5krc32w.jpg" }
  ];
  writeDB(db);
}
