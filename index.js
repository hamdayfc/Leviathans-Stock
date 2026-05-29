require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, PermissionFlagsBits, REST, Routes } = require("discord.js");
const mongoose = require("mongoose");
const { setBotStatus } = require("./status.js");

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// الاتصال بقاعدة البيانات مع إعداد Timeout لضمان عدم تعليق البوت
mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 })
    .then(() => console.log("✅ DB Connected"))
    .catch(console.error);

const User = mongoose.model("User", new mongoose.Schema({ id: String, coins: { type: Number, default: 0 }, inv: { type: Map, of: Number, default: {} } }));

// نظام الكاش لزيادة سرعة الرد
const userCache = new Map();

client.once("ready", async () => {
    const commands = [
        new SlashCommandBuilder().setName("balance").setDescription("عرض رصيدك الحالي"),
        new SlashCommandBuilder()
            .setName("addcoins")
            .setDescription("إضافة كوينز للمستخدم")
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addUserOption(o => o.setName("target").setDescription("المستخدم").setRequired(true))
            .addIntegerOption(o => o.setName("amount").setDescription("الكمية").setRequired(true))
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log("✅ Commands Ready!");
    setBotStatus(client);
});

client.on("interactionCreate", async (i) => {
    if (!i.isChatInputCommand()) return;
    
    // تأكيد الرد فوراً لمنع الـ Timeout
    await i.deferReply();

    // جلب من الكاش أو القاعدة
    let u = userCache.get(i.user.id);
    if (!u) {
        u = await User.findOne({ id: i.user.id }) || new User({ id: i.user.id });
        userCache.set(i.user.id, u);
    }

    try {
        if (i.commandName === "balance") {
            return i.editReply(`💰 رصيدك: **${u.coins}**`);
        }

        if (i.commandName === "addcoins") {
            const target = i.options.getUser("target");
            const amt = i.options.getInteger("amount");
            
            // تحديث المستخدم المستهدف (سواء كان في الكاش أو في القاعدة)
            let tu = userCache.get(target.id) || await User.findOne({ id: target.id }) || new User({ id: target.id });
            tu.coins += amt;
            await tu.save();
            userCache.set(target.id, tu);
            
            return i.editReply(`✅ تم إضافة ${amt} لـ ${target.username}. الرصيد الجديد: ${tu.coins}`);
        }
    } catch (e) {
        console.error(e);
        i.editReply("⚠️ حدث خطأ أثناء المعالجة.");
    }
});

client.login(process.env.TOKEN);
