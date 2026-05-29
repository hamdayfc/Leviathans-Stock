require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, PermissionFlagsBits } = require("discord.js");
const mongoose = require("mongoose");
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

mongoose.connect(process.env.MONGO_URI);
const User = mongoose.model("User", new mongoose.Schema({ id: String, coins: { type: Number, default: 0 }, inv: { type: Map, of: Number, default: {} } }));
const ShopItem = mongoose.model("ShopItem", new mongoose.Schema({ name: String, price: Number, quantity: { type: Number, default: 0 } }));

client.on("ready", async () => {
    const commands = [
        { name: "balance", description: "رصيد", options: [{ name: "u", type: 6 }] },
        { name: "shop", description: "متجر" },
        { name: "buy", description: "شراء", options: [{ name: "item", type: 3, required: true }, { name: "amount", type: 4, required: true }] },
        { name: "additem", description: "إضافة", default_member_permissions: "8", options: [{ name: "name", type: 3, required: true }, { name: "price", type: 4, required: true }, { name: "amount", type: 4, required: true }] }
    ];
    await new REST({ version: '10' }).setToken(process.env.TOKEN).put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Bot is Online!");
});

client.on("interactionCreate", async (i) => {
    if (!i.isChatInputCommand()) return;
    await i.deferReply();
    try {
        let u = await User.findOne({ id: i.user.id }) || await new User({ id: i.user.id }).save();
        
        if (i.commandName === "balance") {
            const target = i.options.getUser("u") || i.user;
            const userData = await User.findOne({ id: target.id }) || { coins: 0 };
            i.editReply(`💰 ${target.username}: ${userData.coins}`);
        } else if (i.commandName === "shop") {
            const items = await ShopItem.find({});
            i.editReply(items.length ? items.map(x => `• ${x.name}: ${x.price} (متوفر: ${x.quantity})`).join("\n") : "المتجر فارغ.");
        } else if (i.commandName === "buy") {
            const name = i.options.getString("item").toLowerCase();
            const amt = i.options.getInteger("amount");
            const item = await ShopItem.findOne({ name });
            if (!item || item.quantity < amt || u.coins < (item.price * amt)) return i.editReply("❌ خطأ: العنصر غير موجود أو الكمية/الرصيد غير كافٍ.");
            item.quantity -= amt; await item.save();
            u.coins -= (item.price * amt); u.inv.set(name, (u.inv.get(name) || 0) + amt); await u.save();
            i.editReply(`✅ تم شراء ${amt} من ${name}.`);
        } else if (i.commandName === "additem") {
            await ShopItem.updateOne({ name: i.options.getString("name") }, { name: i.options.getString("name"), price: i.options.getInteger("price"), $inc: { quantity: i.options.getInteger("amount") } }, { upsert: true });
            i.editReply("✅ تم إضافة/تحديث العنصر.");
        }
    } catch (e) { console.error(e); i.editReply("❌ حدث خطأ داخلي."); }
});
client.login(process.env.TOKEN);
