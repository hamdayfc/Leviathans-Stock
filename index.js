require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, PermissionFlagsBits } = require("discord.js");
const mongoose = require("mongoose");
const express = require('express');

// إعداد سيرفر الـ Web ليبقى البوت "أونلاين"
const app = express();
app.get('/', (req, res) => res.send('Bot is active'));
app.listen(process.env.PORT || 3000);

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// الاتصال بقاعدة البيانات
mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ DB Connected"));

// تعريف المخططات (Schemas)
const User = mongoose.model("User", new mongoose.Schema({ id: String, coins: { type: Number, default: 0 }, inv: { type: Map, of: Number, default: {} } }));
const ShopItem = mongoose.model("ShopItem", new mongoose.Schema({ name: String, price: Number, quantity: { type: Number, default: 0 } }));

// تسجيل الأوامر في ديسكورد
const registerCommands = async () => {
    const commands = [
        { name: "balance", description: "رصيدك", options: [{ name: "target", description: "المستخدم", type: 6, required: false }] },
        { name: "shop", description: "عرض المتجر" },
        { name: "buy", description: "شراء عنصر", options: [{ name: "item", description: "اسم العنصر", type: 3, required: true }, { name: "amount", description: "الكمية", type: 4, required: true }] },
        { name: "additem", description: "إضافة عنصر (للإدارة)", default_member_permissions: "8", options: [
            { name: "name", description: "الاسم", type: 3, required: true },
            { name: "price", description: "السعر", type: 4, required: true },
            { name: "amount", description: "الكمية", type: 4, required: true }
        ]},
        { name: "addcoins", description: "إضافة رصيد (للإدارة)", default_member_permissions: "8", options: [{ name: "target", description: "المستخدم", type: 6, required: true }, { name: "amount", description: "المبلغ", type: 4, required: true }] }
    ];
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
};

client.once("ready", async () => {
    await registerCommands();
    console.log("🚀 Bot is Online & Commands Registered!");
});

client.on("interactionCreate", async (i) => {
    if (!i.isChatInputCommand()) return;
    await i.deferReply();

    try {
        let u = await User.findOne({ id: i.user.id }) || await new User({ id: i.user.id }).save();

        switch (i.commandName) {
            case "balance":
                const target = i.options.getUser("target") || i.user;
                const tU = await User.findOne({ id: target.id }) || { coins: 0 };
                i.editReply(`💰 رصيد ${target.username} هو: ${tU.coins}`);
                break;

            case "shop":
                const items = await ShopItem.find({});
                i.editReply(items.length ? items.map(x => `• ${x.name} | السعر: ${x.price} | المتوفر: ${x.quantity}`).join("\n") : "المتجر فارغ.");
                break;

            case "buy":
                const name = i.options.getString("item").toLowerCase();
                const amt = i.options.getInteger("amount");
                const item = await ShopItem.findOne({ name });
                if (!item || item.quantity < amt || u.coins < (item.price * amt)) return i.editReply("❌ العنصر غير موجود، الكمية غير كافية، أو رصيدك لا يكفي!");
                item.quantity -= amt; await item.save();
                u.coins -= (item.price * amt); u.inv.set(name, (u.inv.get(name) || 0) + amt); await u.save();
                i.editReply(`✅ تم شراء ${amt} من ${name} بنجاح.`);
                break;

            case "additem":
                await ShopItem.updateOne({ name: i.options.getString("name") }, { name: i.options.getString("name"), price: i.options.getInteger("price"), $inc: { quantity: i.options.getInteger("amount") } }, { upsert: true });
                i.editReply("✅ تم تحديث المتجر بنجاح.");
                break;

            case "addcoins":
                const targetUser = i.options.getUser("target");
                let tU = await User.findOne({ id: targetUser.id }) || await new User({ id: targetUser.id }).save();
                tU.coins += i.options.getInteger("amount"); await tU.save();
                i.editReply(`✅ تم إضافة الرصيد لـ ${targetUser.username}.`);
                break;
        }
    } catch (e) { console.error(e); i.editReply("❌ حدث خطأ غير متوقع."); }
});

client.login(process.env.TOKEN);
