require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, PermissionFlagsBits, REST, Routes } = require("discord.js");
const mongoose = require("mongoose");
const { setBotStatus } = require("./status.js");

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// اتصال القاعدة (مع مهلة 10 ثوانٍ)
mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 })
    .then(() => console.log("✅ DB Connected"))
    .catch(console.error);

const User = mongoose.model("User", new mongoose.Schema({ id: String, coins: { type: Number, default: 0 }, inv: { type: Map, of: Number, default: {} } }));
const ShopItem = mongoose.model("ShopItem", new mongoose.Schema({ name: String, price: Number, stock: Number }));

const userCache = new Map();

client.once("ready", async () => {
    const commands = [
        new SlashCommandBuilder().setName("balance").setDescription("عرض رصيدك الحالي"),
        new SlashCommandBuilder().setName("shop").setDescription("عرض المتجر"),
        new SlashCommandBuilder().setName("inventory").setDescription("عرض حقيبتك"),
        new SlashCommandBuilder().setName("leaderboard").setDescription("أغنى 10 أعضاء"),
        new SlashCommandBuilder()
            .setName("transfer")
            .setDescription("تحويل كوينز لعضو")
            .addUserOption(o => o.setName("target").setDescription("المستخدم").setRequired(true))
            .addIntegerOption(o => o.setName("amount").setDescription("الكمية").setRequired(true)),
        new SlashCommandBuilder()
            .setName("addcoins")
            .setDescription("إضافة كوينز (أدمن)")
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addUserOption(o => o.setName("target").setDescription("المستخدم").setRequired(true))
            .addIntegerOption(o => o.setName("amount").setDescription("الكمية").setRequired(true))
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log("✅ All Commands Registered!");
    setBotStatus(client);
});

client.on("interactionCreate", async (i) => {
    if (!i.isChatInputCommand()) return;
    await i.deferReply();

    // جلب من الكاش لضمان السرعة
    let u = userCache.get(i.user.id) || await User.findOne({ id: i.user.id }) || new User({ id: i.user.id });
    if (!userCache.has(i.user.id)) userCache.set(i.user.id, u);

    try {
        if (i.commandName === "balance") return i.editReply(`💰 رصيدك: **${u.coins}**`);
        
        if (i.commandName === "shop") {
            const items = await ShopItem.find({});
            return i.editReply(items.length ? items.map(v => `• ${v.name}: ${v.price}`).join("\n") : "📦 المتجر فارغ.");
        }

        if (i.commandName === "inventory") {
            return i.editReply(Array.from(u.inv.entries()).map(([n, c]) => `• ${n}: x${c}`).join("\n") || "🎒 حقيبتك فارغة.");
        }

        if (i.commandName === "leaderboard") {
            const top = await User.find({}).sort({ coins: -1 }).limit(10);
            return i.editReply(top.map((u, i) => `${i + 1}. <@${u.id}>: **${u.coins}**`).join("\n") || "لا يوجد أعضاء.");
        }

        if (i.commandName === "transfer") {
            const target = i.options.getUser("target");
            const amt = i.options.getInteger("amount");
            if (target.id === i.user.id) return i.editReply("❌ لا يمكنك التحويل لنفسك.");
            if (u.coins < amt) return i.editReply("❌ رصيدك غير كافٍ.");
            
            let tu = await User.findOne({ id: target.id }) || new User({ id: target.id });
            u.coins -= amt;
            tu.coins += amt;
            await u.save(); await tu.save();
            userCache.set(i.user.id, u); userCache.set(target.id, tu);
            return i.editReply(`✅ تم التحويل بنجاح.`);
        }

        if (i.commandName === "addcoins") {
            const target = i.options.getUser("target");
            const amt = i.options.getInteger("amount");
            let tu = await User.findOne({ id: target.id }) || new User({ id: target.id });
            tu.coins += amt;
            await tu.save();
            userCache.set(target.id, tu);
            return i.editReply(`✅ تم إضافة ${amt} لـ ${target.username}.`);
        }
    } catch (e) {
        i.editReply("⚠️ حدث خطأ تقني.");
    }
});

client.login(process.env.TOKEN);
