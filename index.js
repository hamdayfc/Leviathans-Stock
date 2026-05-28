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
const express = require("express"); // إضافة إكسبريس لحل مشكلة ريندر

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
  console.log("Missing TOKEN or CLIENT_ID");
  process.exit(1);
}

// 🌐 تشغيل سيرفر وهمي لإقناع Render أن البوت يعمل كـ Web Service
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Bot is online and running!");
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

// 📦 DATA SAFE INIT
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

// 💰 passive coins
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

// 🧾 SLASH COMMANDS
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
      o.setName("user").setDescription("User (admin only optional)")
    ),

  new SlashCommandBuilder()
    .setName("addcoins")
    .setDescription("Add coins (admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o =>
      o.setName("user").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("amount").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("removecoins")
    .setDescription("Remove coins (admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o =>
      o.setName("user").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("amount").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Top users")

].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

// 🚀 register
client.once("ready", async () => {
  console.log("Bot ready");

  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commands }
  );

  console.log("Slash commands registered");
});

// 🎮 handler
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  const u = getUser(i.user.id);

  // 💰 balance
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

  // 🏪 shop
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

  // ➕ add item
  if (i.commandName === "additem") {
    const name = i.options.getString("name");
    const price = i.options.getInteger("price");
    const stock = i.options.getInteger("stock");

    if (price < 0 || stock < 0) return await i.reply("❌ لا يمكن أن يكون السعر أو المخزون بالسالب");

    data.shop[name] = { price, stock };
    save();

    return await i.reply(`➕ Added **${name}**`);
  }

  // 🛒 buy
  if (i.commandName === "buy") {
    const name = i.options.getString("item");
    const amount = i.options.getInteger("amount");

    if (!data.shop[name]) return await i.reply("❌ Item not found");

    const item = data.shop[name];

    if (amount <= 0) return await i.reply("❌ Invalid amount");
    if (item.stock < amount) return await i.reply("❌ Not enough stock");

    const cost = item.price * amount;

    if (u.coins < cost) return await i.reply("❌ Not enough coins");

    u.coins -= cost;
    item.stock -= amount;

    if (!u.inv[name]) u.inv[name] = 0;
    u.inv[name] += amount;

    save();

    return await i.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🛒 Purchased")
          .setDescription(`Bought **${amount}x ${name}**`)
          .setColor(0x2ecc71)
      ]
    });
  }

  // 🎒 inventory
  if (i.commandName === "inventory") {
    const target = i.options.getUser("user");
    const id = target ? target.id : i.user.id;

    const inv = getUser(id).inv || {};

    return await i.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🎒 Inventory")
          .setDescription(
            Object.keys(inv).length
              ? Object.entries(inv).map(([n, c]) => `${n} x${c}`).join("\n")
              : "Empty"
          )
          .setColor(0xf1c40f)
      ]
    });
  }

  // ➕ coins
  if (i.commandName === "addcoins") {
    const t = i.options.getUser("user");
    const amount = i.options.getInteger("amount");

    if (amount <= 0) return await i.reply("❌ يجب أن تكون الكمية أكبر من صفر");

    getUser(t.id).coins += amount;
    save();

    return await i.reply("➕ Added coins");
  }

  // ➖ coins
  if (i.commandName === "removecoins") {
    const t = i.options.getUser("user");
    const amount = i.options.getInteger("amount");

    if (amount <= 0) return await i.reply("❌ يجب أن تكون الكمية أكبر من صفر");

    const x = getUser(t.id);
    x.coins -= amount;
    if (x.coins < 0) x.coins = 0;

    save();

    return await i.reply("➖ Removed coins");
  }

  // 🏆 leaderboard
  if (i.commandName === "leaderboard") {
    const top = Object.entries(data.users || {})
      .sort((a, b) => (b[1].coins || 0) - (a[1].coins || 0))
      .slice(0, 10)
      .map((u, i) => `${i + 1}. <@${u[0]}> - ${u[1].coins || 0}`);

    return await i.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🏆 Leaderboard")
          .setDescription(top.join("\n") || "No data")
          .setColor(0xe67e22)
      ]
    });
  }
});

client.login(TOKEN);
