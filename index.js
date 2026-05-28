const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log("Bot is online");
});

client.on("messageCreate", (msg) => {
  if (msg.author.bot) return;

  let now = Date.now();

  if (!msg.cooldown) msg.cooldown = {};
  if (!msg.cooldown[msg.author.id]) msg.cooldown[msg.author.id] = 0;

  if (now - msg.cooldown[msg.author.id] > 15000) {
    msg.cooldown[msg.author.id] = now;
    msg.channel.send("+1 coin (test)");
  }
});

client.login(process.env.TOKEN);
