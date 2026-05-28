const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 💾 Data
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

// 🧾 slash commands
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
    .setDescription("Admin add item")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o =>
      o.setName("name").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("price").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("removeitem")
    .setDescription("Admin remove item")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o =>
      o.setName("name").setRequired(true)
    ),
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

client.once("ready", async () => {
  console.log("Bot is ready");

  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commands }
  );
});

// 🎮 commands handler
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  const user = getUser(i.user.id);

  // 💰 balance
  if (i.commandName === "balance") {
    return i.reply(`💰 You have ${user.coins} coins`);
  }

  // 🏪 shop
  if (i.commandName === "shop") {
    const items = Object.entries(data.shop);
    if (!items.length) return i.reply("Shop is empty");

    return i.reply(
      items.map(([name, price]) => `🏷️ ${name} - 💰 ${price}`).join("\n")
    );
  }

  // 🛒 buy
  if (i.commandName === "buy") {
    const name = i.options.getString("item");

    if (!data.shop[name]) return i.reply("Item not found");

    if (user.coins < data.shop[name])
      return i.reply("Not enough coins");

    user.coins -= data.shop[name];
    save();

    return i.reply(`✅ You bought ${name}`);
  }

  // ➕ add item (admin)
  if (i.commandName === "additem") {
    const name = i.options.getString("name");
    const price = i.options.getInteger("price");

    data.shop[name] = price;
    save();

    return i.reply(`➕ Added ${name} for ${price}`);
  }

  // ❌ remove item
  if (i.commandName === "removeitem") {
    const name = i.options.getString("name");

    delete data.shop[name];
    save();

    return i.reply(`❌ Removed ${name}`);
  }
});

client.login(TOKEN);
