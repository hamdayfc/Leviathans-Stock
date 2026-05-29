require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, PermissionFlagsBits } = require("discord.js");
const mongoose = require("mongoose");
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

mongoose.connect(process.env.MONGO_URI);
const User = mongoose.model("User", new mongoose.Schema({ id: String, coins: { type: Number, default: 0 }, inv: { type: Map, of: Number, default: {} } }));
const ShopItem = mongoose.model("ShopItem", new mongoose.Schema({ name: String, price: Number, quantity: { type: Number, default: 0 } }));

const cmds = [
    { name: "balance", description: "Check balance", options: [{ name: "target", type: 6, description: "Select user", required: false }] },
    { name: "shop", description: "View shop" },
    { name: "leaderboard", description: "Top 10" },
    { name: "buy", description: "Buy item", options: [{ name: "item", type: 3, description: "Name", required: true }, { name: "amount", type: 4, description: "Qty", required: true }] },
    { name: "additem", description: "Admin: Add item", default_member_permissions: "8", options: [{ name: "name", type: 3, description: "Name", required: true }, { name: "price", type: 4, description: "Price", required: true }, { name: "amount", type: 4, description: "Qty", required: true }] },
    { name: "removeitem", description: "Admin: Remove item", default_member_permissions: "8", options: [{ name: "name", type: 3, description: "Name", required: true }] },
    { name: "addcoins", description: "Admin: Add coins", default_member_permissions: "8", options: [{ name: "target", type: 6, description: "User", required: true }, { name: "amount", type: 4, description: "Amount", required: true }] },
    { name: "removecoins", description: "Admin: Remove coins", default_member_permissions: "8", options: [{ name: "target", type: 6, description: "User", required: true }, { name: "amount", type: 4, description: "Amount", required: true }] },
    { name: "reload", description: "Admin: Reload commands", default_member_permissions: "8" }
];

async function refresh(c) {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(c.user.id), { body: cmds });
}

client.on("ready", async () => {
    await refresh(client);
    console.log("✅ Bot is online!");
});

client.on("interactionCreate", async (i) => {
    if (!i.isChatInputCommand()) return;
    await i.deferReply();
    
    try {
        let u = await User.findOne({ id: i.user.id }) || await new User({ id: i.user.id }).save();
        
        switch (i.commandName) {
            case "balance":
                const t = i.options.getUser("target") || i.user;
                const d = await User.findOne({ id: t.id }) || { coins: 0 };
                i.editReply(`💰 ${t.username}: ${d.coins} coins.`);
                break;
            case "shop":
                const s = await ShopItem.find({});
                i.editReply(s.length ? s.map(x => `• ${x.name}: ${x.price} (Stock: ${x.quantity})`).join("\n") : "Shop empty.");
                break;
            case "leaderboard":
                const l = await User.find({}).sort({ coins: -1 }).limit(10);
                i.editReply(l.length ? l.map((u, idx) => `${idx + 1}. <@${u.id}>: ${u.coins}`).join("\n") : "No data.");
                break;
            case "buy":
                const n = i.options.getString("item").toLowerCase();
                const a = i.options.getInteger("amount");
                const it = await ShopItem.findOne({ name: n });
                if (!it || it.quantity < a || u.coins < (it.price * a)) return i.editReply("❌ Error: Invalid input or low balance.");
                it.quantity -= a; await it.save();
                u.coins -= (it.price * a); u.inv.set(n, (u.inv.get(n) || 0) + a); await u.save();
                i.editReply(`✅ Bought ${a}x ${n}.`);
                break;
            case "additem":
                await ShopItem.updateOne({ name: i.options.getString("name") }, { name: i.options.getString("name"), price: i.options.getInteger("price"), $inc: { quantity: i.options.getInteger("amount") } }, { upsert: true });
                i.editReply("✅ Done.");
                break;
            case "removeitem":
                await ShopItem.deleteOne({ name: i.options.getString("name") });
                i.editReply("✅ Done.");
                break;
            case "addcoins":
            case "removecoins":
                const target = i.options.getUser("target");
                let rec = await User.findOne({ id: target.id }) || await new User({ id: target.id }).save();
                if (i.commandName === "addcoins") rec.coins += i.options.getInteger("amount");
                else rec.coins = Math.max(0, rec.coins - i.options.getInteger("amount"));
                await rec.save();
                i.editReply("✅ Done.");
                break;
            case "reload":
                await refresh(client);
                i.editReply("✅ Commands reloaded.");
                break;
        }
    } catch (e) { i.editReply("❌ Error: " + e.message); }
});
client.login(process.env.TOKEN);
