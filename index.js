const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require("discord.js");

const fs = require("fs");
const express = require("express"); // حل مشكلة إغلاق الاستضافة في ريندر

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
  console.log("Missing TOKEN or CLIENT_ID");
  process.exit(1);
}

// 🌐 إنشاء سيرفر الويب المخصص لـ Render لمنع توقف البوت
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Bot is online and running perfectly!");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 📦 تهيئة ملف البيانات وحمايته من الأخطاء
let data = { users: {}, shop: {} };

if (fs.existsSync("data.json")) {
  try {
    data = JSON.parse(fs.readFileSync("data.json"));
  } catch {
    data = { users: {}, shop: {} };
  }
}

function save() {
  fs.writeFileSync("data.json", JSON.stringify(data, null, 2));
}

function getUser(id) {
  if (!data.users[id]) {
    data.users[id] = { coins: 0, inv: {}, last: 0 };
  }
  return data.users[id];
}

// 💰 كسب الكوينز التلقائي عند التفاعل بالشات (مرة كل 15 ثانية)
client.on("messageCreate", (msg) => {
  if (!msg.guild || msg.author.bot) return;

  const u = getUser(msg.author.id);
  const now = Date.now();

  if (now - u.last >= 15000) {
    u.coins += 1;
    u.last = now;
    save();
  }
});

// 🧾 تسجيل أوامر السلاش بدقة وبدون أي خيارات ناقصة
const commands = [

  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check coins"),

  new SlashCommandBuilder()
    .setName("shop")
    .setDescription("View shop"),

  new SlashCommandBuilder()
    .setName("additem")
    .setDescription("Add item to shop (admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o =>
      o.setName("name").setDescription("Item name").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("price").setDescription("Price per unit").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("stock").setDescription("Stock amount").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy item with amount")
    .addStringOption(o =>
      o.setName("item").setDescription("Item name").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("amount").setDescription("Quantity").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("Check inventory")
    .addUserOption(o =>
      o.setName("user").setDescription("User to view inventory (optional)")
    ),

  new SlashCommandBuilder()
    .setName("addcoins")
    .setDescription("Add coins (admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o =>
      o.setName("user").setDescription("The user to add coins to").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("amount").setDescription("Amount of coins").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("removecoins")
    .setDescription("Remove coins (admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o =>
      o.setName("user").setDescription("The user to remove coins from").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("amount").setDescription("Amount of coins").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Top users")

].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

// 🚀 تشغيل البوت ورفع الأوامر لديسكورد
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  try {
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );
    console.log("Slash commands registered successfully!");
  } catch (error) {
    console.error("Failed to register commands:", error);
  }
});

// 🎮 التفاعل مع الأوامر المدخلة
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  const u = getUser(i.user.id);

  // 💰 أمر رصيد الحساب
  if (i.commandName === "balance") {
    return await i.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("💰 Balance")
          .setDescription(`Coins: **${u.coins}**`)
          .setColor(0x00ff00)
      ]
    });
  }

  // 🏪 أمر عرض المتجر
  if (i.commandName === "shop") {
    const items = Object.entries(data.shop || {});

    return await i.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🏪 Shop")
          .setDescription(
            items.length
              ? items.map(([n, v]) =>
                  `**${n}**\n💰 ${v.price} | 📦 Stock: ${v.stock}`
                ).join("\n\n")
              : "Shop empty"
          )
          .setColor(0x3498db)
      ]
    });
  }

  // ➕ امر إضافة عنصر للمتجر (للمشرفين)
  if (i.commandName === "additem") {
    const name = i.options.getString("name");
    const price = i.options.getInteger("price");
    const stock = i.options.getInteger("stock");

    if (price < 0 || stock < 0) {
      return await i.reply({ content: "❌ لا يمكن أن يكون السعر أو المخزون بالسالب!", ephemeral: true });
    }

    data.shop[name] = { price, stock };
    save();

    return await i.reply(`➕ Added **${name}** to the shop.`);
  }

  // 🛒 أمر شراء عنصر من المتجر
  if (i.commandName === "buy") {
    const name = i.options.getString("item");
    const amount = i.options.getInteger("amount");

    if (!data.shop[name]) return await i.reply({ content: "❌ هذا العنصر غير موجود بالمتجر!", ephemeral: true });

    const item = data.shop[name];

    if (amount <= 0) return await i.reply({ content: "❌ كمية الشراء غير صالحة!", ephemeral: true });
    if (item.stock < amount) return await i.reply({ content: "❌ المخزون الحالي لا يكفي!", ephemeral: true });

    const cost = item.price * amount;

    if (u.coins < cost) return await i.reply({ content: "❌ ليس لديك ما يكفي من الكوينز!", ephemeral: true });

    u.coins -= cost;
    item.stock -= amount;

    if (!u.inv[name]) u.inv[name] = 0;
    u.inv[name] += amount;

    save();

    return await i.reply({
      embeds:
