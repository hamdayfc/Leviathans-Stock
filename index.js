require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, PermissionFlagsBits, REST, Routes, EmbedBuilder } = require("discord.js");
const mongoose = require("mongoose");
const { setBotStatus } = require("./status.js");

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

mongoose.connect(process.env.MONGO_URI).catch(console.error);

const User = mongoose.model("User", new mongoose.Schema({ id: String, coins: { type: Number, default: 0 }, inv: { type: Map, of: Number, default: {} } }));
const ShopItem = mongoose.model("ShopItem", new mongoose.Schema({ name: String, price: Number }));

client.once("ready", async () => {
    const commands = [
        new SlashCommandBuilder().setName("balance").setDescription("Check balance"),
        new SlashCommandBuilder().setName("shop").setDescription("View shop"),
        new SlashCommandBuilder().setName("inventory").setDescription("View inventory").addUserOption(o => o.setName("target").setDescription("User")),
        new SlashCommandBuilder().setName("leaderboard").setDescription("Top 10 users"),
        new SlashCommandBuilder()
            .setName("transfer")
            .setDescription("Transfer coins")
            .addUserOption(o => o.setName("target").setDescription("Recipient").setRequired(true))
            .addIntegerOption(o => o.setName("amount").setDescription("Amount").setRequired(true)),
        new SlashCommandBuilder()
            .setName("buy")
            .setDescription("Buy item")
            .addStringOption(o => o.setName("itemname").setDescription("Name of the item").setRequired(true)),
        new SlashCommandBuilder()
            .setName("addcoins")
            .setDescription("Admin add coins")
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addUserOption(o => o.setName("target").setDescription("User").setRequired(true))
            .addIntegerOption(o => o.setName("amount").setDescription("Amount").setRequired(true)),
        new SlashCommandBuilder()
            .setName("removecoins")
            .setDescription("Admin remove coins")
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addUserOption(o => o.setName("target").setDescription("User").setRequired(true))
            .addIntegerOption(o => o.setName("amount").setDescription("Amount").setRequired(true))
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log("✅ Commands Registered!");
    setBotStatus(client);
});

client.on("interactionCreate", async (i) => {
    if (!i.isChatInputCommand()) return;
    await i.deferReply();

    try {
        const target = i.options.getUser("target") || i.user;
        let u = await User.findOne({ id: target.id }) || new User({ id: target.id });

        if (i.commandName === "balance") return i.editReply({ embeds: [new EmbedBuilder().setDescription(`💰 **${target.username}** has **${u.coins}** coins.`)] });
        if (i.commandName === "inventory") return i.editReply({ embeds: [new EmbedBuilder().setTitle(`${target.username}'s Inventory`).setDescription(Array.from(u.inv.entries()).map(([n, c]) => `• ${n}: x${c}`).join("\n") || "Empty")] });
        
        if (i.commandName === "buy") {
            const name = i.options.getString("itemname");
            const item = await ShopItem.findOne({ name: name });
            if (!item) return i.editReply("❌ Item not found.");
            let buyer = await User.findOne({ id: i.user.id });
            if (buyer.coins < item.price) return i.editReply("❌ Not enough coins.");
            buyer.coins -= item.price;
            buyer.inv.set(name, (buyer.inv.get(name) || 0) + 1);
            await buyer.save();
            return i.editReply("✅ Purchased successfully!");
        }

        if (i.commandName === "removecoins") {
            const amt = i.options.getInteger("amount");
            u.coins = Math.max(0, u.coins - amt);
            await u.save();
            return i.editReply(`✅ Removed ${amt} coins. New balance: ${u.coins}`);
        }
        // (إضافة باقي الأوامر بنفس المنطق...)
    } catch (e) { console.error(e); i.editReply("⚠️ Error occurred."); }
});

client.login(process.env.TOKEN);
