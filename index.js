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

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
  console.log("Missing TOKEN or CLIENT_ID");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 📦 DATA
let data = { users: {}, shop: {} };

if (fs.existsSync("data.json")) {
  data = JSON.parse(fs.readFileSync("data.json"));
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

// 💰 passive coins (silent)
client.on("messageCreate", (msg) => {
  if (msg.author.bot) return;

  const user = getUser(msg.author.id);
  const now = Date.now();

  if (now - user.last >= 15000) {
    user.coins += 1;
    user.last = now;
    save();
  }
});

// 🧾 COMMANDS
const commands = [

  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your coins"),

  new SlashCommandBuilder()
    .setName("shop")
    .setDescription("View shop"),

  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy item")
    .addStringOption(o =>
      o.setName("item").setDescription("Item name").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("Check inventory (admin can view others)")
    .addUserOption(o =>
      o.setName("user").setDescription("User (admin only)")
    ),

  new SlashCommandBuilder()
    .setName("additem")
    .setDescription("Add shop item")
    .addStringOption(o =>
      o.setName("name").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("price").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("addcoins")
    .setDescription("Add coins (admin)")
    .addUserOption(o =>
      o.setName("user").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("amount").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("removecoins")
    .setDescription("Remove coins (admin)")
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

// 🚀 register slash commands
client.once("ready", async () => {
  console.log("Bot ready");

  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commands }
  );

  console.log("Slash commands registered");
});

// 🎮 HANDLER
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  const user = getUser(i.user.id);

  // 💰 BALANCE
  if (i.commandName === "balance") {
    const embed = new EmbedBuilder()
      .setTitle("💰 Balance")
      .setDescription(`You have **${user.coins} coins**`)
      .setColor(0x00ff00);

    return i.reply({ embeds: [embed] });
  }

  // 🏪 SHOP
  if (i.commandName === "shop") {
    const items = Object.entries(data.shop);

    const embed = new EmbedBuilder()
      .setTitle("🏪 Shop")
      .setDescription(
        items.length
          ? items.map(([n, p]) => `🏷️ **${n}** - 💰 ${p}`).join("\n")
          : "Shop empty"
      )
      .setColor(0x3498db);

    return i.reply({ embeds: [embed] });
  }

  // 🛒 BUY
  if (i.commandName === "buy") {
    const name = i.options.getString("item");

    if (!data.shop[name]) {
      return i.reply("❌ Item not found");
    }

    if (user.coins < data.shop[name]) {
      return i.reply("❌ Not enough coins");
    }

    user.coins -= data.shop[name];

    if (!user.inv[name]) user.inv[name] = 0;
    user.inv[name]++;

    save();

    const embed = new EmbedBuilder()
      .setTitle("🛒 Purchase")
      .setDescription(`You bought **${name}**`)
      .setColor(0x2ecc71);

    return i.reply({ embeds: [embed] });
  }

  // 🎒 INVENTORY
  if (i.commandName === "inventory") {
    const target = i.options?.getUser?.("user");
    const isAdmin = i.member.permissions.has(PermissionFlagsBits.Administrator);

    const id = target ? target.id : i.user.id;

    if (target && !isAdmin) {
      return i.reply("❌ Only admin can view others inventory");
    }

    const inv = getUser(id).inv;

    const embed = new EmbedBuilder()
      .setTitle("🎒 Inventory")
      .setDescription(
        Object.keys(inv).length
          ? Object.entries(inv).map(([n, c]) => `${n} x${c}`).join("\n")
          : "Empty"
      )
      .setColor(0xf1c40f);

    return i.reply({ embeds: [embed] });
  }

  // ➕ ADD ITEM
  if (i.commandName === "additem") {
    const name = i.options.getString("name");
    const price = i.options.getInteger("price");

    data.shop[name] = price;
    save();

    return i.reply(`➕ Added **${name}**`);
  }

  // ➕ ADD COINS
  if (i.commandName === "addcoins") {
    const target = i.options.getUser("user");
    const amount = i.options.getInteger("amount");

    getUser(target.id).coins += amount;
    save();

    return i.reply(`➕ Added coins`);
  }

  // ➖ REMOVE COINS
  if (i.commandName === "removecoins") {
    const target = i.options.getUser("user");
    const amount = i.options.getInteger("amount");

    const u = getUser(target.id);
    u.coins -= amount;

    if (u.coins < 0) u.coins = 0;

    save();

    return i.reply(`➖ Removed coins`);
  }

  // 🏆 LEADERBOARD
  if (i.commandName === "leaderboard") {
    const top = Object.entries(data.users)
      .sort((a, b) => b[1].coins - a[1].coins)
      .slice(0, 10)
      .map((u, i) => `${i + 1}. <@${u[0]}> - ${u[1].coins}`);

    const embed = new EmbedBuilder()
      .setTitle("🏆 Leaderboard")
      .setDescription(top.join("\n") || "No data")
      .setColor(0xe67e22);

    return i.reply({ embeds: [embed] });
  }
});

client.login(TOKEN);
