require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, PermissionFlagsBits, REST, Routes, EmbedBuilder } = require("discord.js");
const mongoose = require("mongoose");
const express = require('express');

// Express server for Render
const app = express();
app.get('/', (req, res) => res.send('Bot is active'));
app.listen(process.env.PORT || 3000);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ DB Connected"));

const User = mongoose.model("User", new mongoose.Schema({ id: String, coins: { type: Number, default: 0 }, inv: { type: Map, of: Number, default: {} } }));

client.once("ready", async () => {
    const commands = [
        new SlashCommandBuilder().setName("balance").setDescription("Check your current balance"),
        new SlashCommandBuilder().setName("inventory").setDescription("View your inventory")
            .addUserOption(o => o.setName("target").setDescription("The user to check")),
        new SlashCommandBuilder().setName("leaderboard").setDescription("See the top 10 richest users"),
        new SlashCommandBuilder().setName("buy").setDescription("Buy an item")
            .addStringOption(o => o.setName("item").setDescription("Name of the item").setRequired(true))
            .addIntegerOption(o => o.setName("amount").setDescription("Quantity to buy").setRequired(true)),
        new SlashCommandBuilder().setName("transfer").setDescription("Transfer coins to someone")
            .addUserOption(o => o.setName("target").setDescription("User to receive").setRequired(true))
            .addIntegerOption(o => o.setName("amount").setDescription("Amount to transfer").setRequired(true)),
        new SlashCommandBuilder().setName("addcoins").setDescription("Add coins (Admin)").setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addUserOption(o => o.setName("target").setDescription("User to add").setRequired(true))
            .addIntegerOption(o => o.setName("amount").setDescription("Amount").setRequired(true)),
        new SlashCommandBuilder().setName("removecoins").setDescription("Remove coins (Admin)").setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addUserOption(o => o.setName("target").setDescription("User to remove").setRequired(true))
            .addIntegerOption(o => o.setName("amount").setDescription("Amount").setRequired(true))
    ];
    
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    // مسح الأوامر القديمة قبل التسجيل الجديد
    await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("🚀 Bot is Online & Commands Registered!");
});

client.on("interactionCreate", async (i) => {
    if (!i.isChatInputCommand()) return;
    await i.deferReply();
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
            await u.save();
            return i.editReply({ embeds: [new EmbedBuilder().setDescription(`✅ Bought ${amt} of ${item}`)] });
        }

        if (i.commandName === "transfer") {
            const target = i.options.getUser("target");
            const amt = i.options.getInteger("amount");
            if (u.coins < amt) return i.editReply("❌ Not enough coins.");
            let tU = await User.findOne({ id: target.id }) || new User({ id: target.id });
            u.coins -= amt; tU.coins += amt;
            await u.save(); await tU.save();
            return i.editReply({ embeds: [new EmbedBuilder().setDescription(`✅ Transferred ${amt} to ${target.username}`)] });
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
