const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const express = require("express");
const mongoose = require("mongoose");
const { setBotStatus } = require("./status.js");

// --- إعدادات السيرفر الوهمي (عشان ما يطفي) ---
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => res.send("Leviathans Bot is running!"));
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

// --- المتغيرات ---
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const MONGO_URI = process.env.MONGO_URI;

// --- الاتصال بقاعدة البيانات ---
mongoose.connect(MONGO_URI)
  .then(() => console.log("Connected to MongoDB successfully"))
  .catch((err) => console.error("MongoDB connection error:", err));

// --- Schemas ---
const User = mongoose.model("User", new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  coins: { type: Number, default: 0 },
  inv: { type: Map, of: Number, default: {} },
  lastMessage: { type: Number, default: 0 }
}));

const ShopItem = mongoose.model("ShopItem", new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  price: { type: Number, required: true },
  stock: { type: Number, required: true }
}));

// --- إعدادات البوت ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- نظام الكوينز ---
client.on("messageCreate", async (msg) => {
  if (!msg.guild || msg.author.bot) return;
  const now = Date.now();
  let u = await User.findOne({ id: msg.author.id }) || new User({ id: msg.author.id });
  if (now - u.lastMessage >= 15000) {
    u.coins += 1;
    u.lastMessage = now;
    await u.save();
  }
});

// --- الأوامر ---
const commands = [
  new SlashCommandBuilder().setName("balance").setDescription("Check your coins"),
  new SlashCommandBuilder().setName("shop").setDescription("View shop"),
  new SlashCommandBuilder().setName("additem").setDescription("Add item").setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName("name").setRequired(true))
    .addIntegerOption(o => o.setName("price").setRequired(true))
    .addIntegerOption(o => o.setName("stock").setRequired(true)),
  new SlashCommandBuilder().setName("buy").setDescription("Buy item")
    .addStringOption(o => o.setName("item").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setRequired(true)),
  new SlashCommandBuilder().setName("inventory").setDescription("View inv").addUserOption(o => o.setName("user")),
  new SlashCommandBuilder().setName("addcoins").setDescription("Add coins").setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName("user").setRequired(true)).addIntegerOption(o => o.setName("amount").setRequired(true)),
  new SlashCommandBuilder().setName("removecoins").setDescription("Remove coins").setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName("user").setRequired(true)).addIntegerOption(o => o.setName("amount").setRequired(true)),
  new SlashCommandBuilder().setName("leaderboard").setDescription("Top 10")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  setBotStatus(client);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log("Commands registered!");
});

// --- التفاعل مع الأوامر ---
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;
  let u = await User.findOne({ id: i.user.id }) || new User({ id: i.user.id });

  if (i.commandName === "balance") return i.reply(`You have **${u.coins}** coins.`);
  
  if (i.commandName === "shop") {
    const items = await ShopItem.find({});
    return i.reply(items.length ? items.map(v => `📦 **${v.name}** - ${v.price} coins`).join("\n") : "Shop is empty!");
  }

  if (i.commandName === "additem") {
    await ShopItem.findOneAndUpdate({ name: i.options.getString("name") }, { price: i.options.getInteger("price"), stock: i.options.getInteger("stock") }, { upsert: true });
    return i.reply("✅ Item added.");
  }

  if (i.commandName === "buy") {
    const item = await ShopItem.findOne({ name: i.options.getString("item") });
    if (!item || item.stock < i.options.getInteger("amount")) return i.reply("❌ Error!");
    u.coins -= (item.price * i.options.getInteger("amount"));
    item.stock -= i.options.getInteger("amount");
    u.inv.set(item.name, (u.inv.get(item.name) || 0) + i.options.getInteger("amount"));
    await u.save(); await item.save();
    return i.reply("🛒 Bought!");
  }

  if (i.commandName === "inventory") {
    const target = i.options.getUser("user") || i.user;
    let tu = await User.findOne({ id: target.id }) || new User({ id: target.id });
    const invArr = Array.from(tu.inv.entries());
    return i.reply(invArr.length ? invArr.map(([n, c]) => `• ${n}: x${c}`).join("\n") : "Empty!");
  }

  if (i.commandName === "addcoins") {
    const t = i.options.getUser("user");
    let tu = await User.findOne({ id: t.id }) || new User({ id: t.id });
    tu.coins += i.options.getInteger("amount");
    await tu.save();
    return i.reply("💰 Added.");
  }

  if (i.commandName === "removecoins") {
    const t = i.options.getUser("user");
    let tu = await User.findOne({ id: t.id }) || new User({ id: t.id });
    tu.coins = Math.max(0, tu.coins - i.options.getInteger("amount"));
    await tu.save();
    return i.reply("📉 Removed.");
  }

  if (i.commandName === "leaderboard") {
    const top = await User.find({}).sort({ coins: -1 }).limit(10);
    return i.reply(top.map((u, idx) => `#${idx + 1} <@${u.id}>: ${u.coins} coins`).join("\n"));
  }
});

client.login(TOKEN);
