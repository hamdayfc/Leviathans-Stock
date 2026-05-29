require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, PermissionFlagsBits } = require("discord.js");
const mongoose = require("mongoose");
const express = require('express');

// الحفاظ على البوت مستيقظاً
const app = express();
app.get('/', (req, res) => res.send('Bot is active'));
app.listen(process.env.PORT || 3000);

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// ربط قاعدة البيانات
mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ DB Connected"));

// تعريف الـ Schemas
const User = mongoose.model("User", new mongoose.Schema({ id: { type: String, required: true, unique: true }, coins: { type: Number, default: 0 }, inv: { type: Map, of: Number, default: {} } }));
const ShopItem = mongoose.model("ShopItem", new mongoose.Schema({ name: String, price: Number }));

// تسجيل الأوامر - تم تعديلها لتكون أكثر دقة
const registerCommands = async () => {
    const commands = [
        { name: "balance", description: "Check balance", options: [{ name: "target", description: "User", type: 6, required: false }] },
        { name: "shop", description: "View shop", options: [] },
        { name: "leaderboard", description: "Top 10 users", options: [] },
        { name: "buy", description: "Buy item", options: [{ name: "item", description: "Item name", type: 3, required: true }, { name: "amount", description: "Quantity", type: 4, required: true }] },
        { name: "additem", description: "Admin: Add item", default_member_permissions: "8", options: [{ name: "name", description: "Item name", type: 3, required: true }, { name: "price", description: "Price", type: 4, required: true }] },
        { name: "removeitem", description: "Admin: Remove item", default_member_permissions: "8", options: [{ name: "name", description: "Item name", type: 3, required: true }] },
        { name: "addcoins", description: "Admin: Add coins", default_member_permissions: "8", options: [{ name: "target", description: "User", type: 6, required: true }, { name: "amount", description: "Amount", type: 4, required: true }] },
        { name: "removecoins", description: "Admin: Remove coins", default_member_permissions: "8", options: [{ name: "target", description: "User", type: 6, required: true }, { name: "amount", description: "Amount", type: 4, required: true }] }
    ];
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
};

client.once("ready", async () => {
    await registerCommands();
    console.log("🚀 Bot is Online & Commands Registered!");
});

// أمر Reload يدوي
client.on("messageCreate", async (msg) => {
    if (msg.content === "$reload" && msg.member?.permissions.has(PermissionFlagsBits.Administrator)) {
        await registerCommands();
        msg.reply("✅ Commands reloaded!");
    }
});

client.on("interactionCreate", async (i) => {
    if (!i.isChatInputCommand()) return;
    await i.deferReply().catch(() => {});
    
    // التعامل مع المستخدمين - إيجاد أو إنشاء
    let u = await User.findOne({ id: i.user.id }) || await new User({ id: i.user.id }).save();

    try {
        if (i.commandName === "balance") {
            const target = i.options.getUser("target") || i.user;
            const tU = await User.findOne({ id: target.id }) || { coins: 0 };
            return i.editReply(`💰 ${target.username} balance: ${tU.coins}`);
        }
        if (i.commandName === "leaderboard") {
            const top = await User.find({}).sort({ coins: -1 }).limit(10);
            const list = top.map((u, index) => `${index + 1}. <@${u.id}>: ${u.coins}`).join("\n") || "No users yet.";
            return i.editReply(`🏆 **Leaderboard:**\n${list}`);
        }
        if (["additem", "removeitem", "addcoins", "removecoins"].includes(i.commandName)) {
            // التحقق من الصلاحيات هنا (للأمان)
            if (!i.member.permissions.has(PermissionFlagsBits.Administrator)) return i.editReply("❌ Admins only.");
            
            if (i.commandName === "additem") {
                await ShopItem.updateOne({ name: i.options.getString("name") }, { name: i.options.getString("name"), price: i.options.getInteger("price") }, { upsert: true });
                return i.editReply("✅ Item added.");
            }
            if (i.commandName === "removeitem") {
                await ShopItem.deleteOne({ name: i.options.getString("name") });
                return i.editReply("✅ Item removed.");
            }
            const target = i.options.getUser("target");
            let tU = await User.findOne({ id: target.id }) || await new User({ id: target.id }).save();
            i.commandName === "addcoins" ? tU.coins += i.options.getInteger("amount") : tU.coins = Math.max(0, tU.coins - i.options.getInteger("amount"));
            await tU.save();
            return i.editReply("✅ Updated.");
        }
    } catch (e) { 
        console.error(e); 
        i.editReply("⚠️ Error occurred.").catch(() => {}); 
    }
});

client.login(process.env.TOKEN);
