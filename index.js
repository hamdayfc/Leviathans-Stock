require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, PermissionFlagsBits, REST, Routes, EmbedBuilder } = require("discord.js");
const mongoose = require("mongoose");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// نظام حفظ الداتا: الاتصال بقاعدة البيانات
mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ DB Connected"));

const User = mongoose.model("User", new mongoose.Schema({ id: String, coins: { type: Number, default: 0 }, inv: { type: Map, of: Number, default: {} } }));

client.once("ready", async () => {
    const commands = [
        new SlashCommandBuilder().setName("balance").setDescription("Check balance"),
        new SlashCommandBuilder().setName("inventory").setDescription("View inv").addUserOption(o => o.setName("target").setDescription("User")),
        new SlashCommandBuilder().setName("leaderboard").setDescription("Top 10 richest"),
        new SlashCommandBuilder().setName("buy").setDescription("Buy items").addStringOption(o => o.setName("item").setRequired(true)).addIntegerOption(o => o.setName("amount").setRequired(true)),
        new SlashCommandBuilder().setName("transfer").setDescription("Transfer coins").addUserOption(o => o.setName("target").setRequired(true)).addIntegerOption(o => o.setName("amount").setRequired(true)),
        new SlashCommandBuilder().setName("addcoins").setDescription("Admin add").setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addUserOption(o => o.setName("target").setRequired(true)).addIntegerOption(o => o.setName("amount").setRequired(true)),
        new SlashCommandBuilder().setName("removecoins").setDescription("Admin remove").setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addUserOption(o => o.setName("target").setRequired(true)).addIntegerOption(o => o.setName("amount").setRequired(true))
    ];
    
    // تسجيل الأوامر
    await new REST({ version: '10' }).setToken(process.env.TOKEN).put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("🚀 Bot is Online & Commands Registered!");
});

// نظام منع "Bot is thinking"
client.on("interactionCreate", async (i) => {
    if (!i.isChatInputCommand()) return;
    await i.deferReply(); // استجابة فورية لمنع التعليق
    
    try {
        const u = await User.findOne({ id: i.user.id }) || new User({ id: i.user.id });

        if (i.commandName === "balance") return i.editReply({ embeds: [new EmbedBuilder().setDescription(`💰 Balance: ${u.coins}`)] });
        
        if (i.commandName === "leaderboard") {
            const top = await User.find({}).sort({ coins: -1 }).limit(10);
            return i.editReply({ embeds: [new EmbedBuilder().setTitle("🏆 Leaderboard").setDescription(top.map((u, x) => `${x+1}. <@${u.id}>: ${u.coins}`).join("\n") || "No data")] });
        }

        if (i.commandName === "inventory") {
            const target = i.options.getUser("target") || i.user;
            const tU = await User.findOne({ id: target.id }) || new User({ id: target.id });
            return i.editReply({ embeds: [new EmbedBuilder().setTitle(`${target.username}'s Inventory`).setDescription(Array.from(tU.inv.entries()).map(([n, c]) => `• ${n}: x${c}`).join("\n") || "Empty")] });
        }

        if (i.commandName === "buy") {
            const item = i.options.getString("item");
            const amt = i.options.getInteger("amount");
            u.inv.set(item, (u.inv.get(item) || 0) + amt);
            await u.save(); // حفظ البيانات فوراً
            return i.editReply({ embeds: [new EmbedBuilder().setDescription(`✅ Purchased ${amt} of ${item}`)] });
        }

        if (i.commandName === "transfer") {
            const target = i.options.getUser("target");
            const amt = i.options.getInteger("amount");
            if (u.coins < amt) return i.editReply("❌ Insufficient funds.");
            let tU = await User.findOne({ id: target.id }) || new User({ id: target.id });
            u.coins -= amt; tU.coins += amt;
            await u.save(); await tU.save(); // حفظ مزدوج للبيانات
            return i.editReply({ embeds: [new EmbedBuilder().setDescription(`✅ Sent ${amt} to ${target.username}`)] });
        }

        if (i.commandName === "addcoins" || i.commandName === "removecoins") {
            const target = i.options.getUser("target");
            const amt = i.options.getInteger("amount");
            let tU = await User.findOne({ id: target.id }) || new User({ id: target.id });
            if (i.commandName === "addcoins") tU.coins += amt;
            else tU.coins = Math.max(0, tU.coins - amt);
            await tU.save(); // حفظ بيانات الأدمن
            return i.editReply({ embeds: [new EmbedBuilder().setDescription(`✅ ${i.commandName} successful. New balance: ${tU.coins}`)] });
        }
    } catch (e) {
        console.error(e);
        i.editReply("⚠️ Error occurred while processing your request.");
    }
});

client.login(process.env.TOKEN);
