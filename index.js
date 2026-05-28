const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits
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

// 📦 data
let data = { users: {}, shop: {} };

if (fs.existsSync("data.json")) {
  data = JSON.parse(fs.readFileSync("data.json"));
}

function save() {
  fs.writeFileSync("data.json", JSON.stringify(data, null, 2));
}

function getUser(id) {
  if (!data.users[id]) {
    data.users[id] = { coins: 0, last: 0 };
  }
  return data.users[id];
}

// 💰 coins system (silent)
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

// 🧾 SLASH COMMANDS (SAFE ONLY)
const commands = [
  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your coins"),

  new SlashCommandBuilder()
    .setName("shop")
    .setDescription("View shop items"),

  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy item")
    .addStringOption(o =>
      o.setName("item")
        .setDescription("Item name")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("additem")
    .setDescription("Add item (admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o =>
      o.setName("name").setDescription("Item name").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("price").setDescription("Item price").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("removeitem")
    .setDescription("Remove item (admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o =>
      o.setName("name").setDescription("Item name").setRequired(true)
    )
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

client.once("ready", async () => {
  console.log("Bot is ready");

  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commands }
  );
});

// 🎮 COMMAND HANDLER
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  const user = getUser(i.user.id);

  if (i.commandName === "balance") {
    return i.reply(`💰 Coins: ${user.coins}`);
  }

  if (i.commandName === "shop") {
    const items = Object.entries(data.shop);

    if (items.length === 0)
      return i.reply("🏪 Shop is empty");

    return i.reply(items.map(([n, p]) => `🏷️ ${n} - 💰 ${p}`).join("\n"));
  }

  if (i.commandName === "buy") {
    const name = i.options.getString("item");

    if (!data.shop[name])
      return i.reply("❌ Item not found");

    if (user.coins < data.shop[name])
      return i.reply("❌ Not enough coins");

    user.coins -= data.shop[name];
    save();

    return i.reply(`✅ Bought ${name}`);
  }

  if (i.commandName === "additem") {
    const name = i.options.getString("name");
    const price = i.options.getInteger("price");

    data.shop[name] = price;
    save();

    return i.reply(`➕ Added ${name} (${price})`);
  }

  if (i.commandName === "removeitem") {
    const name = i.options.getString("name");

    delete data.shop[name];
    save();

    return i.reply(`🗑️ Removed ${name}`);
  }
});

client.login(TOKEN);
