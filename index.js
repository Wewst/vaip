const { Telegraf } = require("telegraf");
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const sellerBot = new Telegraf("SELLER_BOT_TOKEN");
const buyerBot = new Telegraf("BUYER_BOT_TOKEN");

const orders = {};

/* === Приём брони === */
app.post("/reserve", async (req,res)=>{
  const id = Date.now().toString();
  orders[id] = { ...req.body, status:"pending" };

  await sellerBot.telegram.sendMessage(
    "SELLER_CHAT_ID",
`🧢 Новая бронь
Товар: ${req.body.product}
Цена: ${req.body.price}
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
}
  );
  res.sendStatus(200);
});

/* === Кнопки продавца === */
sellerBot.on("callback_query", async ctx=>{
  const [action,id]=ctx.callbackQuery.data.split("_");
  const order=orders[id];
  if(!order) return;

  if(action==="ok"){
    await buyerBot.telegram.sendMessage(
      order.buyer_id,
      `✅ Бронь подтверждена\n${order.product}\n${order.place} — ${order.time}`
    );
    await ctx.editMessageText("✅ Подтверждено");
  }

  if(action==="no"){
    await buyerBot.telegram.sendMessage(
      order.buyer_id,
      `❌ Бронь отменена продавцом`
    );
    await ctx.editMessageText("❌ Отменено");
  }

  ctx.answerCbQuery();
});

/* === Запуск === */
app.listen(3000,()=>console.log("Backend 3000"));
sellerBot.launch();
buyerBot.launch();
