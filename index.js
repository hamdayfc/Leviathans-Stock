require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, PermissionFlagsBits } = require("discord.js");
const mongoose = require("mongoose");
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

mongoose.connect(process.env.MONGO_URI);
const User = mongoose.model("User", new mongoose.Schema({ id: String, coins: { type: Number, default: 0 }, inv: { type: Map, of: Number, default: {} } }));
const ShopItem = mongoose.model("ShopItem", new mongoose.Schema({ name: String, price: Number, quantity: { type: Number, default: 0 } }));

const commands = [
    { name: "balance", description: "Check balance", options: [{ name: "target", type: 6, description: "Select user" }] },
    { name: "shop", description: "View shop items" },
    { name: "leaderboard", description: "View top 10 users" },
    { name: "buy", description: "Buy items", options: [{ name: "item", type: 3, required: true }, { name: "amount", type: 4, required: true }] },
    { name: "additem", description: "Admin: Add item", default_member_permissions: "8", options: [{ name: "name", type: 3, required: true }, { name: "price", type: 4, required: true }, { name: "amount", type: 4, required: true }] },
    { name: "removeitem", description: "Admin: Remove item", default_member_permissions: "8", options: [{ name: "name", type: 3, required: true }] },
    { name: "addcoins", description: "Admin: Add coins", default_member_permissions: "8", options: [{ name: "target", type: 6, required: true }, { name: "amount", type: 4, required: true }] },
    { name: "removecoins", description: "Admin: Remove coins", default_member_permissions: "8", options: [{ name: "target", type: 6, required: true }, { name: "amount", type: 4, required: true }] },
    { name: "reload", description: "Admin: Reload commands", default_member_permissions: "8" }
];

async function deployCommands() {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
}

client.on("ready", async () => {
    await deployCommands();
    console.log("✅ Bot is Online & All Commands Loaded!");
});

client.on("interactionCreate", async (i) => {
    if (!i.isChatInputCommand()) return;
    await i.deferReply();
    
    try {
        let u = await User.findOne({ id: i.user.id }) || await new User({ id: i.user.id }).save();
        
        switch (i.commandName) {
            case "balance":
                const target = i.options.getUser("target") || i.user;
                const data = await User.findOne({ id: target.id }) || { coins: 0 };
                i.editReply(`💰 ${target.username} has ${data.coins} coins.`);
                break;
            case "shop":
                const items = await ShopItem.find({});
                i.editReply(items.length ? items.map(x => `• ${x.name}: ${x.price} coins (Stock: ${x.quantity})`).join("\n") : "Shop is empty.");
                break;
            case "leaderboard":
                const top = await User.find({}).sort({ coins: -1 }).limit(10);
                i.editReply(top.length ? top.map((user, idx) => `${idx + 1}. <@${user.id}>: ${user.coins} coins`).join("\n") : "No data.");
                break;
            case "buy":
                const name = i.options.getString("item").toLowerCase();
                const amt = i.options.getInteger("amount");
                const item = await ShopItem.findOne({ name });
                if (!item || item.quantity < amt || u.coins < (item.price * amt)) return i.editReply("❌ Error: Invalid item, out of stock, or low balance.");
                item.quantity -= amt; await item.save();
                u.coins -= (item.price * amt); u.inv.set(name, (u.inv.get(name) || 0) + amt); await u.save();
                i.editReply(`✅ Successfully bought ${amt}x ${name}.`);
                break;
            case "additem":
                await ShopItem.updateOne({ name: i.options.getString("name") }, { name: i.options.getString("name"), price: i.options.getInteger("price"), $inc: { quantity: i.options.getInteger("amount") } }, { upsert: true });
                i.editReply("✅ Item added/updated.");
                break;
            case "removeitem":
                await ShopItem.deleteOne({ name: i.options.getString("name") });
                i.editReply("✅ Item removed.");
                break;
            case "addcoins":
            case "removecoins":
                const t = i.options.getUser("target");
                let tU = await User.findOne({ id: t.id }) || await new User({ id: t.id }).save();
                i.commandName === "addcoins" ? tU.coins += i.options.getInteger("amount") : tU.coins = Math.max(0, tU.coins - i.options.getInteger("amount"));
                await tU.save();
                i.editReply(`✅ Balance updated for ${t.username}.`);
                break;
            case "reload":
                await deployCommands();
                i.editReply("✅ Commands reloaded.");
                break;
        }
    } catch (e) { i.editReply("❌ An internal error occurred."); }
});
client.login(process.env.TOKEN);
