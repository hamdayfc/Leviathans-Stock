require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, PermissionFlagsBits, REST, Routes, EmbedBuilder } = require("discord.js");
const mongoose = require("mongoose");
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('Bot is active'));
app.listen(process.env.PORT || 3000);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ DB Connected"));

const User = mongoose.model("User", new mongoose.Schema({ id: String, coins: { type: Number, default: 0 }, inv: { type: Map, of: Number, default: {} } }));

const SHOP_ITEMS = { "sword": 50, "shield": 30, "potion": 10 };

client.once("ready", async () => {
    const commands = [
        new SlashCommandBuilder().setName("balance").setDescription("Check balance")
            .addUserOption(o => o.setName("target").setDescription("User to check")),
        new SlashCommandBuilder().setName("shop").setDescription("View available items"),
        new SlashCommandBuilder().setName("inventory").setDescription("View inv")
            .addUserOption(o => o.setName("target").setDescription("User")),
        new SlashCommandBuilder().setName("leaderboard").setDescription("Top 10 richest"),
        new SlashCommandBuilder().setName("buy").setDescription("Buy items")
            .addStringOption(o => o.setName("item").setDescription("Name of item").setRequired(true))
            .addIntegerOption(o => o.setName("amount").setDescription("Amount").setRequired(true)),
        new SlashCommandBuilder().setName("transfer").setDescription("Transfer coins")
            .addUserOption(o => o.setName("target").setRequired(true)).addIntegerOption(o => o.setName("amount").setRequired(true)),
        new SlashCommandBuilder().setName("addcoins").setDescription("Admin add").setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addUserOption(o => o.setName("target").setRequired(true)).addIntegerOption(o => o.setName("amount").setRequired(true)),
        new SlashCommandBuilder().setName("removecoins").setDescription("Admin remove").setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addUserOption(o => o.setName("target").setRequired(true)).addIntegerOption(o => o.setName("amount").setRequired(true))
    ];
    
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("🚀 All Commands Registered!");
});

client.on("interactionCreate", async (i) => {
    if (!i.isChatInputCommand()) return;
    await i.deferReply();
    try {
        const u = await User.findOne({ id: i.user.id }) || new User({ id: i.user.id });

        if (i.commandName === "balance") {
            const target = i.options.getUser("target") || i.user;
            const tU = await User.findOne({ id: target.id }) || new User({ id: target.id });
            return i.editReply({ embeds: [new EmbedBuilder().setDescription(`💰 ${target.username}'s Balance: ${tU.coins}`)] });
        }

        if (i.commandName === "shop") {
            const items = Object.entries(SHOP_ITEMS).map(([n, p]) => `• ${n}: ${p} coins`).join("\n");
            return i.editReply({ embeds: [new EmbedBuilder().setTitle("🛒 Shop").setDescription(items || "No items")] });
        }

        if (i.commandName === "inventory") {
            const target = i.options.getUser("target") || i.user;
            const tU = await User.findOne({ id: target.id }) || new User({ id: target.id });
            return i.editReply({ embeds: [new EmbedBuilder().setTitle(`${target.username}'s Inventory`).setDescription(Array.from(tU.inv.entries()).map(([n, c]) => `• ${n}: x${c}`).join("\n") || "Empty")] });
        }

        if (i.commandName === "buy") {
            const item = i.options.getString("item").toLowerCase();
            const amt = i.options.getInteger("amount");
            
            if (!SHOP_ITEMS[item]) return i.editReply("❌ Item not found!");
            
            const totalCost = SHOP_ITEMS[item] * amt;
            if (u.coins < totalCost) return i.editReply("❌ Not enough coins.");
            
            u.coins -= totalCost;
            u.inv.set(item, (u.inv.get(item) || 0) + amt);
            await u.save();
            return i.editReply({ embeds: [new EmbedBuilder().setDescription(`✅ You bought ${amt} of ${item} for ${totalCost} coins.`)] });
        }

        if (i.commandName === "transfer") {
            const target = i.options.getUser("target");
            const amt = i.options.getInteger("amount");
            if (u.coins < amt) return i.editReply("❌ Insufficient funds.");
            let tU = await User.findOne({ id: target.id }) || new User({ id: target.id });
            u.coins -= amt; tU.coins += amt;
            await u.save(); await tU.save();
            return i.editReply({ embeds: [new EmbedBuilder().setDescription(`✅ Sent ${amt} to ${target.username}`)] });
        }

        if (i.commandName === "leaderboard") {
            const top = await User.find({}).sort({ coins: -1 }).limit(10);
            return i.editReply({ embeds: [new EmbedBuilder().setTitle("🏆 Leaderboard").setDescription(top.map((u, x) => `${x+1}. <@${u.id}>: ${u.coins}`).join("\n") || "No data")] });
        }

        if (i.commandName === "addcoins" || i.commandName === "removecoins") {
            const target = i.options.getUser("target");
            const amt = i.options.getInteger("amount");
            let tU = await User.findOne({ id: target.id }) || new User({ id: target.id });
            if (i.commandName === "addcoins") tU.coins += amt;
            else tU.coins = Math.max(0, tU.coins - amt);
            await tU.save();
            return i.editReply({ embeds: [new EmbedBuilder().setDescription(`✅ Done. New balance: ${tU.coins}`)] });
        }
    } catch (e) {
        console.error(e);
        i.editReply("⚠️ An error occurred.");
    }
});

client.login(process.env.TOKEN);
