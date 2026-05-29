require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, PermissionFlagsBits, REST, Routes } = require("discord.js");
const mongoose = require("mongoose");
const { setBotStatus } = require("./status.js");

// 1. فحص المتغيرات
if (!process.env.TOKEN || !process.env.MONGO_URI || !process.env.CLIENT_ID) {
    console.error("❌ خطأ: تأكد من إضافة TOKEN, MONGO_URI, CLIENT_ID في إعدادات Render.");
    process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// 2. الاتصال بالقاعدة
mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 })
    .then(() => console.log("✅ DB Connected"))
    .catch(e => console.error("❌ DB Error:", e));

const User = mongoose.model("User", new mongoose.Schema({ id: String, coins: { type: Number, default: 0 }, inv: { type: Map, of: Number, default: {} } }));
const ShopItem = mongoose.model("ShopItem", new mongoose.Schema({ name: String, price: Number, stock: Number }));

const userCache = new Map();

// 3. تعريف الأوامر
const commands = [
    new SlashCommandBuilder().setName("balance").setDescription("Check your coins"),
    new SlashCommandBuilder().setName("shop").setDescription("View shop items"),
    new SlashCommandBuilder().setName("inventory").setDescription("View your items"),
    new SlashCommandBuilder().setName("addcoins").setDescription("Add coins").setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(o => o.setName("user").setRequired(true))
        .addIntegerOption(o => o.setName("amount").setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

client.once("ready", async () => {
    try {
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
        console.log("✅ Commands Registered!");
        setBotStatus(client);
    } catch (e) { console.error(e); }
});

// 4. معالجة الأوامر
client.on("interactionCreate", async (i) => {
    if (!i.isChatInputCommand()) return;
    await i.deferReply();
    
    let u = userCache.get(i.user.id);
    if (!u) {
        u = await User.findOne({ id: i.user.id }) || new User({ id: i.user.id });
        userCache.set(i.user.id, u);
    }

    try {
        if (i.commandName === "balance") return i.editReply(`💰 Coins: **${u.coins}**`);
        
        if (i.commandName === "shop") {
            const items = await ShopItem.find({});
            return i.editReply(items.length ? items.map(v => `• ${v.name}: ${v.price}`).join("\n") : "📦 Empty.");
        }

        if (i.commandName === "inventory") {
            return i.editReply(Array.from(u.inv.entries()).map(([n, c]) => `• ${n}: x${c}`).join("\n") || "🎒 Empty.");
        }

        if (i.commandName === "addcoins") {
            const target = i.options.getUser("user");
            const amt = i.options.getInteger("amount");
            let tu = await User.findOne({ id: target.id }) || new User({ id: target.id });
            tu.coins += amt;
            await tu.save();
            return i.editReply(`✅ Added ${amt} coins to <@${target.id}>.`);
        }
    } catch (e) { 
        console.error(e);
        i.editReply("⚠️ Error!"); 
    }
});

client.login(process.env.TOKEN);
