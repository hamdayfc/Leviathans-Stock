const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionsBitField } = require("discord.js");
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

let data = { users: {}, shop: {} };

if (fs.existsSync("data.json")) {
  data = JSON.parse(fs.readFileSync("data.json"));
}

function save() {
  fs.writeFileSync("data.json", JSON.stringify(data, null, 2));
}

function getUser(id) {
  if (!data.users[id]) data.users[id] = { coins: 0, last: 0 };
  return data.users[id];
}

// 💰 coins system
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

// 🧾 commands
const commands = [
  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check coins"),

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
    .setName("additem")
    .setDescription("Admin add item")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addStringOption(o =>
      o.setName("name").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("price").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("removeitem")
    .setDescription("Admin remove item")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addStringOption(o =>
      o.setName("name").setRequired(true)
    ),
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

client.once("ready", async () => {
  console.log("Bot ready");

  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commands }
  );
});

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  const user = getUser(i.user.id);

  if (i.commandName === "balance") {
    return i.reply(`💰 Coins: ${user.coins}`);
  }

  if (i.commandName === "shop") {
    const items = Object.entries(data.shop);
    if (!items.length) return i.reply("Shop empty");

    return i.reply(items.map(([n, p]) => `${n} - ${p}`).join("\n"));
  }

  if (i.commandName === "buy") {
    const name = i.options.getString("item");

    if (!data.shop[name]) return i.reply("Not found");
    if (user.coins < data.shop[name]) return i.reply("Not enough coins");

    user.coins -= data.shop[name];
    save();

    return i.reply(`Bought ${name}`);
  }

  if (i.commandName === "additem") {
    const name = i.options.getString("name");
    const price = i.options.getInteger("price");

    data.shop[name] = price;
    save();

    return i.reply(`Added ${name}`);
  }

  if (i.commandName === "removeitem") {
    const name = i.options.getString("name");

    delete data.shop[name];
    save();

    return i.reply(`Removed ${name}`);
  }
});

client.login(TOKEN);
