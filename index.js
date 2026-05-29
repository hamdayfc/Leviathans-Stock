require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, PermissionFlagsBits, REST, Routes, EmbedBuilder } = require("discord.js");
const mongoose = require("mongoose");
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('Bot is active'));
app.listen(process.env.PORT || 3000);

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ DB Connected"));

// Schema محسنة جداً لتجنب الـ ValidationError
const User = mongoose.model("User", new mongoose.Schema({ 
    id: { type: String, required: true, unique: true }, 
    coins: { type: Number, default: 0 }, 
    inv: { type: Map, of: Number, default: {} } 
}));
const ShopItem = mongoose.model("ShopItem", new mongoose.Schema({ name: String, price: Number }));

const registerCommands = async () => {
    const commands = [
        new SlashCommandBuilder().setName("balance").setDescription("Check balance").addUserOption(o => o.setName("target").setDescription("User")),
        new SlashCommandBuilder().setName("shop").setDescription("View available items"),
        new SlashCommandBuilder().setName("inventory").setDescription("View inv").addUserOption(o => o.setName("target").setDescription("User")),
        new SlashCommandBuilder().setName("leaderboard").setDescription("Top 10 richest"),
        new SlashCommandBuilder().setName("buy").setDescription("Buy items").addStringOption(o => o.setName("item").setRequired(true)).addIntegerOption(o => o.setName("amount").setRequired(true)),
        new SlashCommandBuilder().setName("transfer").setDescription("Transfer coins").addUserOption(o => o.setName("target").setRequired(true)).addIntegerOption(o => o.setName("amount").setRequired(true)),
        new SlashCommandBuilder().setName("additem").setDescription("Add item to shop").setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addStringOption(o => o.setName("name").setRequired(true)).addIntegerOption(o => o.setName("price").setRequired(true)),
        new SlashCommandBuilder().setName("removeitem").setDescription("Remove item from shop").setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addStringOption(o => o.setName("name").setRequired(true)),
        new SlashCommandBuilder().setName("addcoins").setDescription("Admin add").setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addUserOption(o => o.setName("target").setRequired(true)).addIntegerOption(o => o.setName("amount").setRequired(true)),
        new SlashCommandBuilder().setName("removecoins").setDescription("Admin remove").setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addUserOption(o => o.setName("target").setRequired(true)).addIntegerOption(o => o.setName("amount").setRequired(true))
    ];
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
};

client.once("ready", async () => {
    await registerCommands();
    console.log("🚀 System fully operational.");
});

client.on("messageCreate", async (msg) => {
    if (msg.content === "$reload" && msg.member?.permissions.has(PermissionFlagsBits.Administrator)) {
        await registerCommands();
        msg.reply("✅ Commands reloaded!");
    }
});

client.on("interactionCreate", async (i) => {
    if (!i.isChatInputCommand()) return;
    await i.deferReply();
    
    // استرجاع أو إنشاء مستخدم بحماية كاملة
    let u = await User.findOne({ id: i.user.id });
    if (!u) u = await new User({ id: i.user.id }).save();

    try {
        if (i.commandName === "balance") {
            const target = i.options.getUser("target") || i.user;
            let tU = await User.findOne({ id: target.id });
            if (!tU) tU = { coins: 0 };
            return i.editReply({ embeds: [new EmbedBuilder().setDescription(`💰 ${target.username} balance: ${tU.coins}`)] });
        }
        if (i.commandName === "shop") {
            const items = await ShopItem.find({});
            const list = items.length > 0 ? items.map(x => `• ${x.name}: ${x.price} coins`).join("\n") : "Shop is empty.";
            return i.editReply({ embeds: [new EmbedBuilder().setTitle("🛒 Shop").setDescription(list)] });
        }
        if (i.commandName === "additem") {
            const name = i.options.getString("name").toLowerCase();
            const price = i.options.getInteger("price");
            await ShopItem.updateOne({ name }, { name, price }, { upsert: true });
            return i.editReply(`✅ Item ${name} added/updated.`);
        }
        if (i.commandName === "removeitem") {
            const name = i.options.getString("name").toLowerCase();
            const res = await ShopItem.deleteOne({ name });
            return i.editReply(res.deletedCount > 0 ? `✅ Item ${name} removed.` : "❌ Item not found.");
        }
        if (i.commandName === "inventory") {
            const target = i.options.getUser("target") || i.user;
            const tU = await User.findOne({ id: target.id }) || { inv: new Map() };
            const invMap = tU.inv instanceof Map ? tU.inv : new Map(Object.entries(tU.inv || {}));
            return i.editReply({ embeds: [new EmbedBuilder().setTitle(`${target.username} inventory`).setDescription(Array.from(invMap.entries()).map(([n, c]) => `• ${n}: x${c}`).join("\n") || "Empty")] });
        }
        if (i.commandName === "buy") {
            const name = i.options.getString("item").toLowerCase();
            const amt = i.options.getInteger("amount");
            const item = await ShopItem.findOne({ name });
            if (!item) return i.editReply("❌ Item not found!");
            if (u.coins < (item.price * amt)) return i.editReply("❌ Not enough coins.");
            u.coins -= (item.price * amt);
            u.inv.set(name, (u.inv.get(name) || 0) + amt);
            await u.save();
            return i.editReply(`✅ Bought ${amt} of ${name}.`);
        }
        if (i.commandName === "transfer") {
            const target = i.options.getUser("target");
            const amt = i.options.getInteger("amount");
            if (u.coins < amt) return i.editReply("❌ Not enough coins.");
            let tU = await User.findOne({ id: target.id });
            if (!tU) tU = await new User({ id: target.id }).save();
            u.coins -= amt; tU.coins += amt;
            await u.save(); await tU.save();
            return i.editReply(`✅ Transferred ${amt} to ${target.username}.`);
        }
        if (i.commandName === "leaderboard") {
            const top = await User.find({}).sort({ coins: -1 }).limit(10);
            return i.editReply({ embeds: [new EmbedBuilder().setTitle("🏆 Leaderboard").setDescription(top.map((u, x) => `${x+1}. <@${u.id}>: ${u.coins}`).join("\n") || "No data")] });
        }
        if (i.commandName === "addcoins" || i.commandName === "removecoins") {
            const target = i.options.getUser("target");
            const amt = i.options.getInteger("amount");
            let tU = await User.findOne({ id: target.id });
            if (!tU) tU = await new User({ id: target.id }).save();
            if (i.commandName === "addcoins") tU.coins += amt;
            else tU.coins = Math.max(0, tU.coins - amt);
            await tU.save();
            return i.editReply(`✅ Done. New balance: ${tU.coins}`);
        }
    } catch (e) { console.error(e); i.editReply("⚠️ Error processing request."); }
});

client.login(process.env.TOKEN);
