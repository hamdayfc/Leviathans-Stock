require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder } = require("discord.js");
const mongoose = require("mongoose");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// ─── MongoDB Connect ───────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI).catch(err => console.error("MongoDB error:", err));

mongoose.connection.on("disconnected", () => {
    console.warn("⚠️ MongoDB disconnected! Reconnecting...");
    setTimeout(() => {
        mongoose.connect(process.env.MONGO_URI).catch(err => console.error("MongoDB reconnect error:", err));
    }, 5000);
});

mongoose.connection.on("connected", () => {
    console.log("✅ MongoDB connected!");
});

// ─── Models ────────────────────────────────────────────────────────────────────
const User = mongoose.model("User", new mongoose.Schema({
    id: String,
    coins: { type: Number, default: 0 },
    inv: { type: Map, of: Number, default: {} }
}));

const ShopItem = mongoose.model("ShopItem", new mongoose.Schema({
    name: String,
    price: Number,
    quantity: { type: Number, default: 0 }
}));

const MessageReward = mongoose.model("MessageReward", new mongoose.Schema({
    id: String,
    lastRewarded: { type: Date, default: null }
}));

// ─── Constants ─────────────────────────────────────────────────────────────────
const MAX_COINS_CAP = 1500;
const REWARD_COOLDOWN_MS = 15000;

// ─── Commands ──────────────────────────────────────────────────────────────────
const cmds = [
    { name: "balance", description: "Check balance", options: [{ name: "target", type: 6, description: "Select user", required: false }] },
    { name: "shop", description: "View shop" },
    { name: "leaderboard", description: "Top 10" },
    { name: "buy", description: "Buy item", options: [{ name: "item", type: 3, description: "Name", required: true }, { name: "amount", type: 4, description: "Qty", required: true }] },
    { name: "additem", description: "Admin: Add item", default_member_permissions: "8", options: [{ name: "name", type: 3, description: "Name", required: true }, { name: "price", type: 4, description: "Price", required: true }, { name: "amount", type: 4, description: "Qty", required: true }] },
    { name: "removeitem", description: "Admin: Remove item", default_member_permissions: "8", options: [{ name: "name", type: 3, description: "Name", required: true }] },
    { name: "addcoins", description: "Admin: Add coins", default_member_permissions: "8", options: [{ name: "target", type: 6, description: "User", required: true }, { name: "amount", type: 4, description: "Amount", required: true }] },
    { name: "removecoins", description: "Admin: Remove coins", default_member_permissions: "8", options: [{ name: "target", type: 6, description: "User", required: true }, { name: "amount", type: 4, description: "Amount", required: true }] },
    { name: "transfer", description: "Transfer coins to another user", options: [{ name: "target", type: 6, description: "User to send coins to", required: true }, { name: "amount", type: 4, description: "Amount to transfer", required: true }] },
    { name: "reload", description: "Admin: Reload commands", default_member_permissions: "8" }
];

async function refresh(c) {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(c.user.id), { body: cmds });
    console.log("✅ Commands registered!");
}

async function reply(i, embed) {
    await i.editReply({ embeds: [embed] });
}

// ─── Ready ─────────────────────────────────────────────────────────────────────
client.on("ready", async () => {
    try {
        await refresh(client);
        console.log(`✅ ${client.user.tag} is online!`);
    } catch (e) {
        console.error("Failed to register commands:", e);
    }
});

// ─── Message Reward ────────────────────────────────────────────────────────────
client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;
    if (!msg.guild) return;

    try {
        let reward = await MessageReward.findOne({ id: msg.author.id });
        const now = new Date();

        if (reward && reward.lastRewarded && (now - reward.lastRewarded) < REWARD_COOLDOWN_MS) return;

        let u = await User.findOne({ id: msg.author.id });
        if (!u) u = new User({ id: msg.author.id });

        if (u.coins >= MAX_COINS_CAP) return;

        u.coins = Math.min(u.coins + 1, MAX_COINS_CAP);
        await u.save();

        if (!reward) reward = new MessageReward({ id: msg.author.id });
        reward.lastRewarded = now;
        await reward.save();

    } catch (e) {
        console.error("messageCreate reward error:", e);
    }
});

// ─── Interactions ──────────────────────────────────────────────────────────────
client.on("interactionCreate", async (i) => {
    if (!i.isChatInputCommand()) return;

    try {
        await i.deferReply();
    } catch (e) {
        console.error("deferReply failed:", e);
        return;
    }

    try {
        let u = await User.findOne({ id: i.user.id });
        if (!u) u = await new User({ id: i.user.id }).save();

        switch (i.commandName) {
            case "balance": {
                const t = i.options.getUser("target") || i.user;
                const d = await User.findOne({ id: t.id }) || { coins: 0 };
                const embed = new EmbedBuilder()
                    .setColor(0xF1C40F)
                    .setTitle("💰 Balance")
                    .setDescription(`**${t.username}** has **${d.coins}** coins`)
                    .setThumbnail(t.displayAvatarURL())
                    .setTimestamp();
                await reply(i, embed);
                break;
            }

            case "shop": {
                const s = await ShopItem.find({});
                const embed = new EmbedBuilder()
                    .setColor(0x2ECC71)
                    .setTitle("🛒 Shop");

                if (!s.length) {
                    embed.setDescription("The shop is empty.");
                } else {
                    embed.addFields(
                        s.map(x => ({
                            name: x.name,
                            value: `💵 **${x.price}** coins | 📦 Stock: **${x.quantity}**`,
                            inline: true
                        }))
                    );
                }
                await reply(i, embed);
                break;
            }

            case "leaderboard": {
                const l = await User.find({}).sort({ coins: -1 }).limit(10);
                const embed = new EmbedBuilder()
                    .setColor(0xE74C3C)
                    .setTitle("🏆 Leaderboard");

                if (!l.length) {
                    embed.setDescription("No data yet.");
                } else {
                    const medals = ["🥇", "🥈", "🥉"];
                    embed.setDescription(
                        l.map((u, idx) =>
                            `${medals[idx] || `**${idx + 1}.**`} <@${u.id}> — **${u.coins}** coins`
                        ).join("\n")
                    );
                }
                await reply(i, embed);
                break;
            }

            case "buy": {
                const n = i.options.getString("item").toLowerCase();
                const a = i.options.getInteger("amount");

                if (a <= 0) {
                    const embed = new EmbedBuilder().setColor(0xE74C3C).setDescription("❌ Amount must be greater than 0.");
                    return await reply(i, embed);
                }

                const it = await ShopItem.findOne({ name: n });

                if (!it) {
                    const embed = new EmbedBuilder().setColor(0xE74C3C).setDescription(`❌ Item **${n}** not found.`);
                    return await reply(i, embed);
                }
                if (it.quantity < a) {
                    const embed = new EmbedBuilder().setColor(0xE74C3C).setDescription(`❌ Not enough stock. Available: **${it.quantity}**`);
                    return await reply(i, embed);
                }

                const total = it.price * a;
                if (u.coins < total) {
                    const embed = new EmbedBuilder().setColor(0xE74C3C).setDescription(`❌ Not enough coins. You have **${u.coins}**, need **${total}**.`);
                    return await reply(i, embed);
                }

                it.quantity -= a;
                await it.save();
                u.coins -= total;
                u.inv.set(n, (u.inv.get(n) || 0) + a);
                await u.save();

                const embed = new EmbedBuilder()
                    .setColor(0x2ECC71)
                    .setTitle("✅ Purchase Successful")
                    .addFields(
                        { name: "Item", value: n, inline: true },
                        { name: "Quantity", value: `${a}`, inline: true },
                        { name: "Total", value: `${total} coins`, inline: true },
                        { name: "Remaining Balance", value: `${u.coins} coins`, inline: true }
                    )
                    .setTimestamp();
                await reply(i, embed);
                break;
            }

            case "additem": {
                const name = i.options.getString("name").toLowerCase();
                const price = i.options.getInteger("price");
                const amount = i.options.getInteger("amount");
                await ShopItem.updateOne(
                    { name },
                    { name, price, $inc: { quantity: amount } },
                    { upsert: true }
                );
                const embed = new EmbedBuilder()
                    .setColor(0x3498DB)
                    .setTitle("✅ Item Added/Updated")
                    .addFields(
                        { name: "Name", value: name, inline: true },
                        { name: "Price", value: `${price} coins`, inline: true },
                        { name: "Added Qty", value: `${amount}`, inline: true }
                    );
                await reply(i, embed);
                break;
            }

            case "removeitem": {
                const name = i.options.getString("name").toLowerCase();
                await ShopItem.deleteOne({ name });
                const embed = new EmbedBuilder()
                    .setColor(0xE74C3C)
                    .setDescription(`✅ Item **${name}** removed from shop.`);
                await reply(i, embed);
                break;
            }

            case "addcoins":
            case "removecoins": {
                const target = i.options.getUser("target");
                let rec = await User.findOne({ id: target.id });
                if (!rec) rec = await new User({ id: target.id }).save();

                const amount = i.options.getInteger("amount");
                const adding = i.commandName === "addcoins";
                if (adding) rec.coins += amount;
                else rec.coins = Math.max(0, rec.coins - amount);
                await rec.save();

                const embed = new EmbedBuilder()
                    .setColor(adding ? 0x2ECC71 : 0xE74C3C)
                    .setTitle(adding ? "✅ Coins Added" : "✅ Coins Removed")
                    .addFields(
                        { name: "User", value: `<@${target.id}>`, inline: true },
                        { name: adding ? "Added" : "Removed", value: `${amount} coins`, inline: true },
                        { name: "New Balance", value: `${rec.coins} coins`, inline: true }
                    );
                await reply(i, embed);
                break;
            }

            case "transfer": {
                const target = i.options.getUser("target");
                const amount = i.options.getInteger("amount");

                if (target.id === i.user.id) {
                    const embed = new EmbedBuilder().setColor(0xE74C3C).setDescription("❌ You can't transfer coins to yourself!");
                    return await reply(i, embed);
                }
                if (target.bot) {
                    const embed = new EmbedBuilder().setColor(0xE74C3C).setDescription("❌ You can't transfer coins to a bot!");
                    return await reply(i, embed);
                }
                if (amount <= 0) {
                    const embed = new EmbedBuilder().setColor(0xE74C3C).setDescription("❌ Amount must be greater than 0.");
                    return await reply(i, embed);
                }
                if (u.coins < amount) {
                    const embed = new EmbedBuilder().setColor(0xE74C3C).setDescription(`❌ Not enough coins. You have **${u.coins}**, trying to send **${amount}**.`);
                    return await reply(i, embed);
                }

                let rec = await User.findOne({ id: target.id });
                if (!rec) rec = await new User({ id: target.id }).save();

                u.coins -= amount;
                rec.coins += amount;
                await u.save();
                await rec.save();

                const embed = new EmbedBuilder()
                    .setColor(0x3498DB)
                    .setTitle("💸 Transfer Successful")
                    .addFields(
                        { name: "From", value: `<@${i.user.id}>`, inline: true },
                        { name: "To", value: `<@${target.id}>`, inline: true },
                        { name: "Amount", value: `${amount} coins`, inline: true },
                        { name: "Your Balance", value: `${u.coins} coins`, inline: true },
                        { name: "Their Balance", value: `${rec.coins} coins`, inline: true }
                    )
                    .setTimestamp();
                await reply(i, embed);
                break;
            }

            case "reload": {
                await refresh(client);
                const embed = new EmbedBuilder()
                    .setColor(0x9B59B6)
                    .setDescription("✅ Commands reloaded successfully.");
                await reply(i, embed);
                break;
            }
        }
    } catch (e) {
        console.error(`Error in ${i.commandName}:`, e);
        try {
            const errEmbed = new EmbedBuilder()
                .setColor(0xE74C3C)
                .setTitle("❌ Error")
                .setDescription(`\`${e.message}\``);
            await i.editReply({ embeds: [errEmbed] });
        } catch (editErr) {
            console.error("Failed to send error embed:", editErr);
        }
    }
});

// ─── Discord Error Handlers ────────────────────────────────────────────────────
client.on("error", (err) => {
    console.error("🔴 Discord client error:", err);
});

client.on("warn", (info) => {
    console.warn("⚠️ Discord warning:", info);
});

client.on("disconnect", () => {
    console.warn("⚠️ Bot disconnected! Attempting to reconnect...");
    client.login(process.env.TOKEN).catch(console.error);
});

// ─── Process Error Handlers ────────────────────────────────────────────────────
process.on("unhandledRejection", (reason) => {
    console.error("🔴 Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
    console.error("🔴 Uncaught Exception:", err);
});

process.on("uncaughtExceptionMonitor", (err) => {
    console.error("🔴 Uncaught Exception Monitor:", err);
});

// ─── Login ─────────────────────────────────────────────────────────────────────
client.login(process.env.TOKEN);
