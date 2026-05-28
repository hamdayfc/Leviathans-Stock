const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
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

// 📦 Data
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

// 💰 coins (silent)
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

// 🧾 Slash Commands (SAFE ONLY)
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
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

// 🚀 Register commands
client.once("ready", async () => {
  console.log("Bot ready");

  try {
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );

    console.log("Slash commands registered");
  } catch (err) {
    console.error("Command error:", err);
  }
});

// 🎮 Commands handler
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

    return i.reply(
      items.map(([n, p]) => `${n} - ${p}`).join("\n")
    );
  }

  if (i.commandName === "buy") {
    const name = i.options.getString("item");

    if (!data.shop[name])
      return i.reply("❌ Item not found");

    if (user.coins < data.shop[name])
      return i.reply("❌ Not enough coins");

    user.coins -= data.shop[name];
    save();

    return i.reply(`✅ You bought ${name}`);
  }
});

client.login(TOKEN);
