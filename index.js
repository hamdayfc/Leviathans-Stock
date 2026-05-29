require('dotenv').config();
const { Client, GatewayIntentBits, PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const mongoose = require("mongoose");
const { setBotStatus } = require("./status.js");

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });

const User = mongoose.model("User", new mongoose.Schema({ id: String, coins: { type: Number, default: 0 }, inv: { type: Map, of: Number, default: {} } }));
const ShopItem = mongoose.model("ShopItem", new mongoose.Schema({ name: String, price: Number, stock: Number }));

const userCache = new Map();

client.once("ready", async () => {
    console.log("Bot Ready!");
    setBotStatus(client);
});

client.on("interactionCreate", async (i) => {
    if (!i.isChatInputCommand()) return;
    await i.deferReply();
    
    // جلب أو إنشاء المستخدم
    let u = userCache.get(i.user.id);
    if (!u) {
        u = await User.findOne({ id: i.user.id }) || new User({ id: i.user.id });
        userCache.set(i.user.id, u);
    }

    try {
        if (i.commandName === "balance") {
            return i.editReply(`Coins: **${u.coins}**`);
        }
        
        if (i.commandName === "addcoins") {
            const amount = i.options.getInteger("amount");
            u.coins += amount;
            await u.save(); // حفظ التعديل فوراً
            userCache.set(i.user.id, u); // تحديث الكاش
            return i.editReply(`💰 Added ${amount} coins. New total: ${u.coins}`);
        }

        if (i.commandName === "shop") {
            const items = await ShopItem.find({});
            return i.editReply(items.length ? items.map(v => `• ${v.name}: ${v.price}`).join("\n") : "Empty");
        }

        if (i.commandName === "inventory") {
            return i.editReply(Array.from(u.inv.entries()).map(([n, c]) => `• ${n}: x${c}`).join("\n") || "Empty!");
        }
    } catch (err) {
        console.error(err);
        return i.editReply("❌ Error occurred.");
    }
});

client.login(process.env.TOKEN);
