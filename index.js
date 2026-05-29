require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, PermissionFlagsBits } = require("discord.js");
const mongoose = require("mongoose");
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('Bot is active'));
app.listen(process.env.PORT || 3000);

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ DB Connected"));

const User = mongoose.model("User", new mongoose.Schema({ id: { type: String, required: true, unique: true }, coins: { type: Number, default: 0 }, inv: { type: Map, of: Number, default: {} } }));
const ShopItem = mongoose.model("ShopItem", new mongoose.Schema({ name: String, price: Number, quantity: { type: Number, default: 0 } }));

const registerCommands = async () => {
    const commands = [
        { name: "balance", description: "Check balance", options: [{ name: "target", description: "User", type: 6, required: false }] },
        { name: "shop", description: "View shop" },
        { name: "leaderboard", description: "Top 10" },
        { name: "buy", description: "Buy item", options: [{ name: "item", description: "Name", type: 3, required: true }, { name: "amount", description: "Qty", type: 4, required: true }] },
        { name: "additem", description: "Admin: Add/Stock item", default_member_permissions: "8", options: [
            { name: "name", description: "Name", type: 3, required: true },
            { name: "price", description: "Price", type: 4, required: true },
            { name: "amount", description: "Quantity to add", type: 4, required: true }
        ]},
        { name: "removeitem", description: "Admin: Remove item", default_member_permissions: "8", options: [{ name: "name", description: "Name", type: 3, required: true }] },
        { name: "addcoins", description: "Admin: Add coins", default_member_permissions: "8", options: [{ name: "target", description: "User", type: 6, required: true }, { name: "amount", description: "Amount", type: 4, required: true }] },
        { name: "removecoins", description: "Admin: Remove coins", default_member_permissions: "8", options: [{ name: "target", description: "User", type: 6, required: true }, { name: "amount", description: "Amount", type: 4, required: true }] }
    ];
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
};

client.once("ready", async () => {
    await registerCommands();
    console.log("🚀 Bot is Online & Commands Registered!");
});

client.on("interactionCreate", async (i) => {
    if (!i.isChatInputCommand()) return;
    await i.deferReply();

    try {
        let u = await User.findOne({ id: i.user.id }) || await new User({ id: i.user.id }).save();

        switch (i.commandName) {
            case "balance":
                const target = i.options.getUser("target") || i.user;
                const tU = await User.findOne({ id: target.id }) || { coins: 0 };
                return i.editReply(`💰 ${target.username} balance: ${tU.coins}`);

            case "shop":
                const items = await ShopItem.find({});
                return i.editReply(items.length ? items.map(x => `• ${x.name}: ${x.price} coins (Stock: ${x.quantity})`).join("\n") : "Shop is empty.");

            case "leaderboard":
                const top = await User.find({}).sort({ coins: -1 }).limit(10);
                return i.editReply(`🏆 Top 10:\n${top.map((u, index) => `${index + 1}. <@${u.id}>: ${u.coins}`).join("\n") || "No data."}`);

            case "buy":
                const name = i.options.getString("item").toLowerCase();
                const amt = i.options.getInteger("amount");
                const item = await ShopItem.findOne({ name });
                if (!item || item.quantity < amt || u.coins < (item.price * amt)) return i.editReply("❌ Item not found, out of stock, or not enough coins!");
                item.quantity -= amt;
                await item.save();
                u.coins -= (item.price * amt);
                u.inv.set(name, (u.inv.get(name) || 0) + amt);
                await u.save();
                return i.editReply(`✅ Bought ${amt}x ${name}.`);

            case "additem":
                if (!i.member.permissions.has(PermissionFlagsBits.Administrator)) return i.editReply("❌ Admins only.");
                await ShopItem.updateOne({ name: i.options.getString("name") }, { name: i.options.getString("name"), price: i.options.getInteger("price"), $inc: { quantity: i.options.getInteger("amount") } }, { upsert: true });
                return i.editReply("✅ Item added/updated with new stock.");

            case "removeitem":
                if (!i.member.permissions.has(PermissionFlagsBits.Administrator)) return i.editReply("❌ Admins only.");
                await ShopItem.deleteOne({ name: i.options.getString("name") });
                return i.editReply("✅ Item removed.");

            case "addcoins":
            case "removecoins":
                if (!i.member.permissions.has(PermissionFlagsBits.Administrator)) return i.editReply("❌ Admins only.");
                const t = i.options.getUser("target");
                let tU = await User.findOne({ id: t.id }) || await new User({ id: t.id }).save();
                i.commandName === "addcoins" ? tU.coins += i.options.getInteger("amount") : tU.coins = Math.max(0, tU.coins - i.options.getInteger("amount"));
                await tU.save();
                return i.editReply(`✅ ${t.username} balance updated.`);
        }
    } catch (e) { console.error(e); i.editReply("❌ Error occurred."); }
});

client.on("messageCreate", async (m) => {
    if (m.content === "$reload" && m.member?.permissions.has(PermissionFlagsBits.Administrator)) {
        await registerCommands();
        m.reply("✅ Commands reloaded.");
    }
});

client.login(process.env.TOKEN);
