require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, PermissionFlagsBits, REST, Routes, EmbedBuilder } = require("discord.js");
const mongoose = require("mongoose");
const { setBotStatus } = require("./status.js");

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 })
    .then(() => console.log("✅ DB Connected"))
    .catch(err => console.error("❌ DB Connection Error:", err));

const User = mongoose.model("User", new mongoose.Schema({ id: String, coins: { type: Number, default: 0 }, inv: { type: Map, of: Number, default: {} } }));
const ShopItem = mongoose.model("ShopItem", new mongoose.Schema({ name: String, price: Number }));

const userCache = new Map();

client.once("ready", async () => {
    const commands = [
        new SlashCommandBuilder().setName("balance").setDescription("Check balance"),
        new SlashCommandBuilder().setName("shop").setDescription("View shop"),
        new SlashCommandBuilder().setName("inventory").setDescription("View inventory").addUserOption(o => o.setName("target").setDescription("User")),
        new SlashCommandBuilder().setName("leaderboard").setDescription("Top 10 users"),
        new SlashCommandBuilder().setName("transfer").setDescription("Transfer coins").addUserOption(o => o.setName("target").setRequired(true)).addIntegerOption(o => o.setName("amount").setRequired(true)),
        new SlashCommandBuilder().setName("buy").setDescription("Buy item").addStringOption(o => o.setName("item").setRequired(true)),
        new SlashCommandBuilder().setName("addcoins").setDescription("Add coins").setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addUserOption(o => o.setName("target").setRequired(true)).addIntegerOption(o => o.setName("amount").setRequired(true)),
        new SlashCommandBuilder().setName("removecoins").setDescription("Remove coins").setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addUserOption(o => o.setName("target").setRequired(true)).addIntegerOption(o => o.setName("amount").setRequired(true))
    ].map(c => c.toJSON());

    await new REST({ version: '10' }).setToken(process.env.TOKEN).put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log("✅ All Commands Registered!");
    setBotStatus(client);
});

client.on("interactionCreate", async (i) => {
    if (!i.isChatInputCommand()) return;
    await i.deferReply();

    try {
        const target = i.options.getUser("target") || i.user;
        let u = await User.findOne({ id: target.id }) || new User({ id: target.id });

        if (i.commandName === "balance") return i.editReply({ embeds: [new EmbedBuilder().setTitle("💰 Balance").setDescription(`${target.username} has ${u.coins} coins.`)] });
        
        if (i.commandName === "shop") {
            const items = await ShopItem.find({});
            return i.editReply({ embeds: [new EmbedBuilder().setTitle("🛒 Shop").setDescription(items.map(v => `• ${v.name}: ${v.price}`).join("\n") || "Empty")] });
        }

        if (i.commandName === "inventory") {
            return i.editReply({ embeds: [new EmbedBuilder().setTitle(`${target.username}'s Inventory`).setDescription(Array.from(u.inv.entries()).map(([n, c]) => `• ${n}: x${c}`).join("\n") || "Empty")] });
        }

        if (i.commandName === "leaderboard") {
            const top = await User.find({}).sort({ coins: -1 }).limit(10);
            return i.editReply({ embeds: [new EmbedBuilder().setTitle("🏆 Leaderboard").setDescription(top.map((u, idx) => `${idx+1}. <@${u.id}>: ${u.coins}`).join("\n") || "No data")] });
        }

        if (i.commandName === "transfer") {
            const amt = i.options.getInteger("amount");
            let sender = await User.findOne({ id: i.user.id });
            if (!sender || sender.coins < amt) return i.editReply("❌ Insufficient funds.");
            sender.coins -= amt; u.coins += amt;
            await sender.save(); await u.save();
            return i.editReply({ embeds: [new EmbedBuilder().setDescription(`✅ Transferred ${amt} to ${target.username}.`)] });
        }

        if (i.commandName === "buy") {
            const itemName = i.options.getString("item");
            const item = await ShopItem.findOne({ name: itemName });
            if (!item || u.coins < item.price) return i.editReply("❌ Item not found or insufficient funds.");
            u.coins -= item.price; u.inv.set(itemName, (u.inv.get(itemName) || 0) + 1);
            await u.save();
            return i.editReply({ embeds: [new EmbedBuilder().setDescription(`✅ Bought ${itemName}!`)] });
        }

        if (i.commandName === "addcoins" || i.commandName === "removecoins") {
            const amt = i.options.getInteger("amount");
            if (i.commandName === "addcoins") u.coins += amt; else u.coins = Math.max(0, u.coins - amt);
            await u.save();
            return i.editReply({ embeds: [new EmbedBuilder().setDescription(`✅ Operation successful. New balance: ${u.coins}`)] });
        }
    } catch (e) {
        console.error(e);
        i.editReply("⚠️ An error occurred. Please check logs.");
    }
});

client.login(process.env.TOKEN);
