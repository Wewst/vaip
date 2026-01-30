const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const cors = require("cors");

const BOT_TOKEN = process.env.BOT_TOKEN;
const SELLER_CHAT_ID = process.env.SELLER_CHAT_ID;

const app = express();
app.use(cors());
app.use(express.json());

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const orders = {};

app.post("/reserve", async (req,res)=>{
  const id = Date.now().toString();
  orders[id] = { ...req.body };

  await bot.sendMessage(
    SELLER_CHAT_ID,
`🧢 Новая бронь
Товар: ${req.body.product}
Цена: ${req.body.price} ₽
Место: ${req.body.place}
Время: ${req.body.time}`,
{
  reply_markup:{
    inline_keyboard:[
      [
        { text:"✅ Подтвердить", callback_data:`ok_${id}` },
        { text:"❌ Отменить", callback_data:`no_${id}` }
      ]
    ]
  }
});

  res.sendStatus(200);
});

bot.on("callback_query", async q=>{
  const [action,id]=q.data.split("_");
  const o=orders[id];
  if(!o) return;

  const msg = action==="ok"
    ? "✅ Бронь подтверждена"
    : "❌ Бронь отменена";

  await bot.sendMessage(o.user_id,msg);
  await bot.answerCallbackQuery(q.id);
  delete orders[id];
});

app.listen(3000,()=>console.log("Backend ready"));
