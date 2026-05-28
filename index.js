const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require("discord.js");

const express = require("express");
const mongoose = require("mongoose");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const MONGO_URI = process.env.MONGO_URI;

// سيرفر Express للحفاظ على تشغيل البوت في Render
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => res.send("Leviathans Bot is running perfectly with MongoDB!"));
app.listen(PORT, () => console.log(`Web server is active on port ${PORT}`));

// الاتصال بقاعدة بيانات MongoDB
mongoose.connect(MONGO_URI)
  .then(() => console.log("Connected to MongoDB successfully"))
  .catch((err) => console.error("MongoDB connection error:", err));

// إعداد جداول البيانات
const UserSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  coins: { type: Number, default: 0 },
  inv: { type: Map, of: Number, default: {} },
  lastMessage: { type: Number, default: 0 }
});
const User = mongoose.model("User", UserSchema);

const ShopSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  price: { type: Number, required: true },
  stock: { type: Number, required: true }
});
const ShopItem = mongoose.model("ShopItem", ShopSchema);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// نظام كسب الكوينز التلقائي من الشات
client.on("messageCreate", async (msg) => {
  if (!msg.guild || msg.author.bot) return;

  const now = Date.now();
  let u = await User.findOne({ id: msg.author.id });
  if (!u) u = new User({ id: msg.author.id });

  if (now - u.lastMessage >= 15000) {
    u.coins += 1;
    u.lastMessage = now;
    await u.save();
  }
});

// تسجيل أوامر السلاش
const commands = [
  new SlashCommandBuilder().setName("balance").setDescription("Check your coins"),
  new SlashCommandBuilder().setName("shop").setDescription("View the server shop"),
  new SlashCommandBuilder()
    .setName("additem")
    .setDescription("Add or update an item in the shop")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName("name").setDescription("Item name").setRequired(true))
    .addIntegerOption(o => o.setName("price").setDescription("Price of the item").setRequired(true))
    .addIntegerOption(o => o.setName("stock").setDescription("Available stock").setRequired(true)),
  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy an item from the shop")
    .addStringOption(o => o.setName("item").setDescription("The exact item name").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setDescription("Quantity to buy").setRequired(true)),
  new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("View your backpack or another user's inventory")
    .addUserOption(o => o.setName("user").setDescription("Target user")),
  new SlashCommandBuilder()
    .setName("addcoins")
    .setDescription("Give coins to a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName("user").setDescription("The user to receive coins").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setDescription("Amount of coins").setRequired(true)),
  new SlashCommandBuilder()
    .setName("removecoins")
    .setDescription("Take away coins from a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName("user").setDescription("The user to lose coins").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setDescription("Amount of coins").setRequired(true)),
  new SlashCommandBuilder().setName("leaderboard").setDescription("Show top 10 richest users")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("All Slash Commands registered successfully");
  } catch (error) {
    console.error("Error registering commands:", error);
  }
});

// معالجة التفاعل مع الأوامر
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  let u = await User.findOne({ id: i.user.id });
  if (!u) u = new User({ id: i.user.id });

  if (i.commandName === "balance") {
    return await i.reply({
      embeds: [new EmbedBuilder().setTitle("Leviathans Balance").setDescription(`لديك حاليا: **${u.coins}** كوينز.`).setColor(0x00ff00)]
    });
  }

  if (i.commandName === "shop") {
    const items = await ShopItem.find({});
    return await i.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Leviathans Shop")
          .setDescription(items.length ? items.map(v => `**${v.name}**\nالسعر: ${v.price} كوينز | المخزون: ${v.stock}`).join("\n\n") : "المتجر فارغ حاليا!")
          .setColor(0x3498db)
      ]
    });
  }

  if (i.commandName === "additem") {
    const name = i.options.getString("name");
    const price = i.options.getInteger("price");
    const stock = i.options.getInteger("stock");

    if (price < 0 || stock < 0) return await i.reply({ content: "لا يمكن وضع قيم سالبة للمنتج!", ephemeral: true });

    await ShopItem.findOneAndUpdate({ name }, { price, stock }, { upsert: true });
    return await i.reply(`تم إضافة وتحديث المنتج **${name}** بنجاح في المتجر.`);
  }

  if (i.commandName === "buy") {
    const name = i.options.getString("item");
    const amount = i.options.getInteger("amount");

    const item = await ShopItem.findOne({ name });
    if (!item) return await i.reply({ content: "هذا المنتج غير موجود بالمتجر!", ephemeral: true });
    if (amount <= 0 || item.stock < amount) return await i.reply({ content: "الكمية المحددة غير صالحة أو نفذت من المخزون!", ephemeral: true });

    const cost = item.price * amount;
    if (u.coins < cost) return await i.reply({ content: `ليس لديك كوينز كافية! تكلفة الشراء هي ${cost} كوينز.`, ephemeral: true });

    u.coins -= cost;
    item.stock -= amount;

    const currentInv = u.inv.get(name) || 0;
    u.inv.set(name, currentInv + amount);

    await u.save();
    await item.save();

    return await i.reply({
      embeds: [new EmbedBuilder().setTitle("عملية شراء ناجحة").setDescription(`لقد قمت بشراء **${amount}x ${name}** بنجاح!`).setColor(0x2ecc71)]
    });
  }

  if (i.commandName === "inventory") {
    const target = i.options.getUser("user");
    const targetId = target ? target.id : i.user.id;
    
    let targetUser = await User.findOne({ id: targetId });
    if (!targetUser) targetUser = new User({ id: targetId });

    const invArr = Array.from(targetUser.inv.entries());

    return await i.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle(`حقيبة الأغراض - ${target ? target.username : i.user.username}`)
          .setDescription(invArr.length ? invArr.map(([n, c]) => `• **${n}** (العدد: x${c})`).join("\n") : "الحقيبة فارغة تماما!")
          .setColor(0xf1c40f)
      ]
    });
  }

  if (i.commandName === "addcoins") {
    const t = i.options.getUser("user");
    const amount = i.options.getInteger("amount");
    if (amount <= 0) return await i.reply({ content: "الكمية يجب ان تكون اكبر من صفر!", ephemeral: true });

    let tu = await User.findOne({ id: t.id });
    if (!tu) tu = new User({ id: t.id });

    tu.coins += amount;
    await tu.save();
    return await i.reply(`تم إضافة **${amount}** كوينز بنجاح إلى حساب <@${t.id}>.`);
  }

  if (i.commandName === "removecoins") {
    const t = i.options.getUser("user");
    const amount = i.options.getInteger("amount");
    if (amount <= 0) return await i.reply({ content: "الكمية يجب ان تكون اكبر من صفر!", ephemeral: true });

    let tu = await User.findOne({ id: t.id });
    if (!tu) tu = new User({ id: t.id });

    tu.coins -= amount;
    if (tu.coins < 0) tu.coins = 0;
    await tu.save();
    return await i.reply(`تم سحب **${amount}** كوينز من حساب <@${t.id}>.`);
  }

  if (i.commandName === "leaderboard") {
    const top = await User.find({}).sort({ coins: -1 }).limit(10);
    const lb = top.map((userObj, idx) => `**#${idx + 1}** <@${userObj.id}> — **${userObj.coins}** كوينز`);

    return await i.reply({
      embeds: [new EmbedBuilder().setTitle("قائمة أغنى 10 أعضاء بالسيرفر").setDescription(lb.join("\n") || "لا توجد بيانات حاليا.").setColor(0xe67e22)]
    });
  }
});

client.login(TOKEN);
