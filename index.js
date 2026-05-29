require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const mongoose = require("mongoose");
const { setBotStatus } = require("./status.js");

// 1. فحص المتغيرات الأساسية (عشان ما يعطيك أخطاء غامضة)
if (!process.env.TOKEN || !process.env.MONGO_URI || !process.env.CLIENT_ID) {
    console.error("خطأ: يرجى التأكد من إضافة TOKEN و MONGO_URI و CLIENT_ID في إعدادات البيئة (Environment) على Render.");
    process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// 2. اتصال قاعدة البيانات مع مهلة زمنية
mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 })
    .then(() => console.log("✅ DB Connected Successfully"))
    .catch(e => console.error("❌ DB Connection Error:", e));

const User = mongoose.model("User", new mongoose.Schema({ id: String, coins: { type: Number, default: 0 }, inv: { type: Map, of: Number, default: {} } }));
const ShopItem = mongoose.model("ShopItem", new mongoose.Schema({ name: String, price: Number, stock: Number }));

const userCache = new Map();

client.once("ready", async () => {
    console.log(`🚀 Bot is ready! Logged as ${client.user.tag}`);
    setBotStatus(client);
});

client.on("interactionCreate", async (i) => {
    if (!i.isChatInputCommand()) return;
    
    // رد فوري لمنع خطأ الـ Timeout
    await i.deferReply().catch(console.error);
    
    let u = userCache.get(i.user.id);
    if (!u) {
        u = await User.findOne({ id: i.user.id }) || new User({ id: i.user.id });
        userCache.set(i.user.id, u);
    }

    try {
        if (i.commandName === "balance") return i.editReply(`💰 Coins: **${u.coins}**`);
        
        if (i.commandName === "shop") {
            const items = await ShopItem.find({});
            return i.editReply(items.length ? items.map(v => `• ${v.name}: ${v.price}`).join("\n") : "📦 Shop is empty.");
        }

        if (i.commandName === "addcoins" && i.member.permissions.has(PermissionFlagsBits.Administrator)) {
            const amount = i.options.getInteger("amount");
            u.coins += amount;
            await u.save();
            userCache.set(i.user.id, u);
            return i.editReply(`✅ Added ${amount} coins.`);
        }

        if (i.commandName === "inventory") {
            return i.editReply(Array.from(u.inv.entries()).map(([n, c]) => `• ${n}: x${c}`).join("\n") || "🎒 Inventory is empty.");
        }
        
    } catch (err) {
        console.error("❌ Interaction Error:", err);
        return i.editReply("⚠️ حدث خطأ أثناء تنفيذ الأمر.");
    }
});

client.login(process.env.TOKEN);
