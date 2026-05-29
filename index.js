const {
    Client, GatewayIntentBits, REST, Routes, EmbedBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, PermissionFlagsBits, ChannelType
} = require("discord.js");
const mongoose = require("mongoose");
const http = require('http');

const TOKEN = "YOUR_BOT_TOKEN_HERE";
const MONGO_URI = "YOUR_MONGO_URI_HERE";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

http.createServer((req, res) => { res.writeHead(200); res.end('Ticket Bot alive!'); }).listen(process.env.PORT || 3001);

mongoose.connect(MONGO_URI).catch(err => console.error("MongoDB error:", err));
mongoose.connection.on("disconnected", () => {
    setTimeout(() => mongoose.connect(MONGO_URI).catch(console.error), 5000);
});

// ─── Models ────────────────────────────────────────────────────────────────────

// Guild settings: log channel, staff role, ticket category
const guildSettingsSchema = new mongoose.Schema({
    guildId: { type: String, unique: true },
    logChannelId: { type: String, default: "" },
    staffRoleId: { type: String, default: "" },
    ticketCategoryId: { type: String, default: "" }   // Discord category for ticket channels
});
const GuildSettings = mongoose.model("GuildSettings", guildSettingsSchema);

// Ticket record
const ticketSchema = new mongoose.Schema({
    guildId: String,
    channelId: String,
    userId: String,
    type: String,           // support | purchase | complaint | other
    status: { type: String, default: "open" },   // open | claimed | closed
    claimedBy: { type: String, default: "" },
    ticketNumber: Number,
    createdAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },
    messages: { type: Array, default: [] }       // transcript storage
});
const Ticket = mongoose.model("Ticket", ticketSchema);

// Counter per guild
const counterSchema = new mongoose.Schema({
    guildId: { type: String, unique: true },
    count: { type: Number, default: 0 }
});
const Counter = mongoose.model("Counter", counterSchema);

// ─── Helpers ───────────────────────────────────────────────────────────────────
async function getSettings(guildId) {
    return await GuildSettings.findOneAndUpdate(
        { guildId },
        { $setOnInsert: { guildId } },
        { upsert: true, new: true }
    );
}

async function nextTicketNumber(guildId) {
    const c = await Counter.findOneAndUpdate(
        { guildId },
        { $inc: { count: 1 } },
        { upsert: true, new: true }
    );
    return c.count;
}

async function sendLog(guildId, embed) {
    try {
        const s = await getSettings(guildId);
        if (!s.logChannelId) return;
        const ch = await client.channels.fetch(s.logChannelId).catch(() => null);
        if (ch) await ch.send({ embeds: [embed] });
    } catch (e) { console.error("sendLog error:", e); }
}

// ─── Colors & base embed ───────────────────────────────────────────────────────
const COLORS = { gold: 0xF4C430, green: 0x2ECC71, red: 0xE74C3C, blue: 0x3498DB, purple: 0x9B59B6, dark: 0x2C2F33, orange: 0xE67E22 };

function baseEmbed(color = COLORS.dark) {
    return new EmbedBuilder().setColor(color).setFooter({ text: "Ticket System" }).setTimestamp();
}
function errorEmbed(desc) {
    return baseEmbed(COLORS.red).setTitle("❌ Error").setDescription(`> ${desc}`);
}

// ─── Ticket type config ────────────────────────────────────────────────────────
const TICKET_TYPES = {
    support:   { label: "🛠️ Support",   color: COLORS.blue,   desc: "General support & help" },
    purchase:  { label: "🛒 Purchase",  color: COLORS.green,  desc: "Purchase related questions" },
    complaint: { label: "📢 Complaint", color: COLORS.orange, desc: "Report an issue or complaint" },
    other:     { label: "📋 Other",     color: COLORS.purple, desc: "Anything else" }
};

// ─── Commands ──────────────────────────────────────────────────────────────────
const cmds = [
    // Setup
    {
        name: "setup",
        description: "⚙️ [Admin] Setup the ticket system",
        default_member_permissions: "8",
        options: [
            { name: "log_channel", type: 7, description: "Channel for ticket logs", required: true },
            { name: "staff_role", type: 8, description: "Staff role that manages tickets", required: true },
            { name: "ticket_category", type: 7, description: "Category where ticket channels are created", required: true }
        ]
    },
    // Send panel
    {
        name: "panel",
        description: "📋 [Admin] Send the ticket panel to a channel",
        default_member_permissions: "8",
        options: [
            { name: "channel", type: 7, description: "Channel to send the panel to", required: true },
            { name: "title", type: 3, description: "Panel title (optional)", required: false },
            { name: "description", type: 3, description: "Panel description (optional)", required: false }
        ]
    },
    // Close ticket
    {
        name: "close",
        description: "🔒 Close the current ticket"
    },
    // Delete ticket (admin)
    {
        name: "delete",
        description: "🗑️ [Admin] Delete the current ticket channel",
        default_member_permissions: "8"
    },
    // Claim ticket
    {
        name: "claim",
        description: "✋ Claim this ticket (staff only)"
    },
    // Unclaim ticket
    {
        name: "unclaim",
        description: "↩️ Unclaim this ticket (staff only)"
    },
    // Add user
    {
        name: "add",
        description: "➕ Add a user to this ticket",
        options: [{ name: "user", type: 6, description: "User to add", required: true }]
    },
    // Remove user
    {
        name: "remove",
        description: "➖ Remove a user from this ticket",
        options: [{ name: "user", type: 6, description: "User to remove", required: true }]
    },
    // Ticket info
    {
        name: "ticketinfo",
        description: "📊 Show info about the current ticket"
    },
    // List open tickets
    {
        name: "tickets",
        description: "📋 List all open tickets in this server",
        default_member_permissions: "8"
    },
    // Reload
    { name: "reload", description: "🔧 [Admin] Reload commands", default_member_permissions: "8" }
];

async function refresh(c) {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    await rest.put(Routes.applicationCommands(c.user.id), { body: cmds });
    console.log("✅ Commands registered!");
}

async function safeReply(i, payload) {
    try {
        const isEmbed = payload instanceof EmbedBuilder;
        const data = isEmbed ? { embeds: [payload] } : payload;
        if (i.deferred && !i.replied) await i.editReply(data);
        else if (!i.replied) await i.reply(data);
    } catch (e) { console.error("safeReply failed:", e.message); }
}

// ─── Build ticket channel ──────────────────────────────────────────────────────
async function createTicketChannel(guild, user, type, settings, ticketNum) {
    const typeCfg = TICKET_TYPES[type];
    const channelName = `${type}-${String(ticketNum).padStart(4, "0")}`;

    const permOverwrites = [
        // Hide from everyone
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        // Allow ticket creator
        {
            id: user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
        }
    ];

    // Allow staff role if set
    if (settings.staffRoleId) {
        permOverwrites.push({
            id: settings.staffRoleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages]
        });
    }

    const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: settings.ticketCategoryId || null,
        permissionOverwrites: permOverwrites,
        topic: `Ticket #${ticketNum} | Type: ${type} | User: ${user.tag}`
    });

    return channel;
}

// ─── Ticket panel message ──────────────────────────────────────────────────────
function buildPanel(title, description) {
    const embed = new EmbedBuilder()
        .setColor(COLORS.blue)
        .setTitle(title || "🎫  Support Tickets")
        .setDescription(description || "Select a category below to open a ticket.\nOur staff team will assist you as soon as possible.")
        .addFields(
            { name: "🛠️ Support", value: "General help & questions", inline: true },
            { name: "🛒 Purchase", value: "Purchase related issues", inline: true },
            { name: "📢 Complaint", value: "Report a problem", inline: true },
            { name: "📋 Other", value: "Anything else", inline: true }
        )
        .setFooter({ text: "Ticket System • Click below to open a ticket" })
        .setTimestamp();

    const menu = new StringSelectMenuBuilder()
        .setCustomId("ticket_create")
        .setPlaceholder("📂 Select a ticket category...")
        .addOptions([
            { label: "🛠️ Support", value: "support", description: "General support & help" },
            { label: "🛒 Purchase", value: "purchase", description: "Purchase related questions" },
            { label: "📢 Complaint", value: "complaint", description: "Report an issue or complaint" },
            { label: "📋 Other", value: "other", description: "Anything else" }
        ]);

    const row = new ActionRowBuilder().addComponents(menu);
    return { embeds: [embed], components: [row] };
}

// ─── Ticket channel welcome message ───────────────────────────────────────────
function buildTicketWelcome(user, type, ticketNum, staffRoleId) {
    const typeCfg = TICKET_TYPES[type];
    const embed = new EmbedBuilder()
        .setColor(typeCfg.color)
        .setTitle(`${typeCfg.label} — Ticket #${String(ticketNum).padStart(4, "0")}`)
        .setDescription(`Welcome <@${user.id}>!\nPlease describe your issue and a staff member will assist you shortly.`)
        .addFields(
            { name: "👤 Opened by", value: `<@${user.id}>`, inline: true },
            { name: "📂 Category", value: typeCfg.label, inline: true },
            { name: "📊 Status", value: "🟢 Open", inline: true }
        )
        .setFooter({ text: "Ticket System" })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket_claim").setLabel("✋ Claim").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("ticket_close").setLabel("🔒 Close").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("ticket_delete").setLabel("🗑️ Delete").setStyle(ButtonStyle.Danger)
    );

    const mention = staffRoleId ? `<@&${staffRoleId}>` : "";
    return { content: mention ? `${mention} | <@${user.id}>` : `<@${user.id}>`, embeds: [embed], components: [row] };
}

// ─── Transcript builder ────────────────────────────────────────────────────────
async function buildTranscript(channel, ticket) {
    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        const sorted = [...messages.values()].reverse();
        const lines = sorted.map(m => {
            const time = m.createdAt.toISOString().replace("T", " ").slice(0, 19);
            return `[${time}] ${m.author.tag}: ${m.content || "[embed/attachment]"}`;
        });
        return lines.join("\n");
    } catch (e) { return "Could not fetch transcript."; }
}

// ─── Ready ─────────────────────────────────────────────────────────────────────
client.on("ready", async () => {
    try {
        await refresh(client);
        console.log(`✅ ${client.user.tag} is online!`);
    } catch (e) { console.error("Failed to register commands:", e); }
});

// ─── Interactions ──────────────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {

    // ── Select Menu: Create Ticket ─────────────────────────────────────────────
    if (interaction.isStringSelectMenu() && interaction.customId === "ticket_create") {
        await interaction.deferReply({ ephemeral: true });
        const type = interaction.values[0];
        const guildId = interaction.guild.id;
        const settings = await getSettings(guildId);

        // Check if user already has an open ticket of this type
        const existing = await Ticket.findOne({ guildId, userId: interaction.user.id, status: { $in: ["open", "claimed"] } });
        if (existing) {
            return await interaction.editReply({ embeds: [errorEmbed(`You already have an open ticket: <#${existing.channelId}>`)] });
        }

        try {
            const ticketNum = await nextTicketNumber(guildId);
            const channel = await createTicketChannel(interaction.guild, interaction.user, type, settings, ticketNum);

            await Ticket.create({
                guildId, channelId: channel.id, userId: interaction.user.id,
                type, ticketNumber: ticketNum
            });

            // Send welcome message
            const welcome = buildTicketWelcome(interaction.user, type, ticketNum, settings.staffRoleId);
            await channel.send(welcome);

            await interaction.editReply({
                embeds: [baseEmbed(COLORS.green)
                    .setTitle("✅ Ticket Created")
                    .setDescription(`Your ticket has been created: <#${channel.id}>`)]
            });

            // Log
            await sendLog(guildId, baseEmbed(COLORS.blue)
                .setTitle("🎫 New Ticket Opened")
                .addFields(
                    { name: "👤 User", value: `<@${interaction.user.id}>`, inline: true },
                    { name: "📂 Type", value: TICKET_TYPES[type].label, inline: true },
                    { name: "🔢 Ticket", value: `#${String(ticketNum).padStart(4, "0")}`, inline: true },
                    { name: "📌 Channel", value: `<#${channel.id}>`, inline: true }
                ));
        } catch (e) {
            console.error("Create ticket error:", e);
            await interaction.editReply({ embeds: [errorEmbed("Failed to create ticket. Make sure the bot has permissions.")] });
        }
        return;
    }

    // ── Buttons ────────────────────────────────────────────────────────────────
    if (interaction.isButton()) {
        const guildId = interaction.guild.id;
        const channelId = interaction.channel.id;
        const ticket = await Ticket.findOne({ guildId, channelId });

        if (interaction.customId === "ticket_claim") {
            await interaction.deferReply({ ephemeral: true });
            if (!ticket) return await interaction.editReply({ embeds: [errorEmbed("This is not a ticket channel.")] });
            const settings = await getSettings(guildId);
            const member = interaction.guild.members.cache.get(interaction.user.id);
            const isStaff = settings.staffRoleId ? member?.roles.cache.has(settings.staffRoleId) : member?.permissions.has(PermissionFlagsBits.ManageMessages);
            if (!isStaff) return await interaction.editReply({ embeds: [errorEmbed("Only staff can claim tickets.")] });
            if (ticket.status === "claimed") return await interaction.editReply({ embeds: [errorEmbed(`This ticket is already claimed by <@${ticket.claimedBy}>.`)] });

            ticket.status = "claimed";
            ticket.claimedBy = interaction.user.id;
            await ticket.save();

            await interaction.channel.send({ embeds: [baseEmbed(COLORS.gold)
                .setTitle("✋ Ticket Claimed")
                .setDescription(`<@${interaction.user.id}> has claimed this ticket and will assist you.`)] });

            await interaction.editReply({ embeds: [baseEmbed(COLORS.green).setTitle("✅ Claimed").setDescription("You have claimed this ticket.")] });

            await sendLog(guildId, baseEmbed(COLORS.gold)
                .setTitle("✋ Ticket Claimed")
                .addFields(
                    { name: "🎫 Ticket", value: `<#${channelId}>`, inline: true },
                    { name: "👤 Claimed by", value: `<@${interaction.user.id}>`, inline: true }
                ));
            return;
        }

        if (interaction.customId === "ticket_close") {
            await interaction.deferReply({ ephemeral: false });
            if (!ticket) return await safeReply(interaction, errorEmbed("This is not a ticket channel."));
            if (ticket.status === "closed") return await safeReply(interaction, errorEmbed("Ticket is already closed."));

            const transcript = await buildTranscript(interaction.channel, ticket);
            ticket.status = "closed";
            ticket.closedAt = new Date();
            ticket.messages = transcript.split("\n").slice(0, 500);
            await ticket.save();

            // Remove user's permission to send
            try {
                await interaction.channel.permissionOverwrites.edit(ticket.userId, { SendMessages: false });
            } catch (e) {}

            const closeEmbed = baseEmbed(COLORS.orange)
                .setTitle("🔒 Ticket Closed")
                .setDescription(`Closed by <@${interaction.user.id}>.\nStaff can reopen or delete this ticket.`)
                .addFields({ name: "👤 Opened by", value: `<@${ticket.userId}>`, inline: true });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("ticket_delete").setLabel("🗑️ Delete").setStyle(ButtonStyle.Danger)
            );

            await safeReply(interaction, { embeds: [closeEmbed], components: [row] });

            // Send transcript to log channel
            const settings = await getSettings(guildId);
            if (settings.logChannelId) {
                const logCh = await client.channels.fetch(settings.logChannelId).catch(() => null);
                if (logCh) {
                    const logEmbed = baseEmbed(COLORS.orange)
                        .setTitle("🔒 Ticket Closed")
                        .addFields(
                            { name: "🎫 Ticket", value: `#${String(ticket.ticketNumber).padStart(4, "0")}`, inline: true },
                            { name: "📂 Type", value: TICKET_TYPES[ticket.type]?.label || ticket.type, inline: true },
                            { name: "👤 Opened by", value: `<@${ticket.userId}>`, inline: true },
                            { name: "🔒 Closed by", value: `<@${interaction.user.id}>`, inline: true },
                            { name: "💬 Messages", value: `${ticket.messages.length}`, inline: true }
                        );
                    await logCh.send({ embeds: [logEmbed] });

                    // Send transcript as file
                    if (transcript.length > 0) {
                        const { AttachmentBuilder } = require("discord.js");
                        const buf = Buffer.from(transcript, "utf8");
                        const att = new AttachmentBuilder(buf, { name: `transcript-${ticket.ticketNumber}.txt` });
                        await logCh.send({ content: `📄 Transcript for ticket #${String(ticket.ticketNumber).padStart(4, "0")}`, files: [att] });
                    }
                }
            }
            return;
        }

        if (interaction.customId === "ticket_delete") {
            await interaction.deferReply({ ephemeral: true });
            if (!ticket) return await interaction.editReply({ embeds: [errorEmbed("This is not a ticket channel.")] });
            const settings = await getSettings(guildId);
            const member = interaction.guild.members.cache.get(interaction.user.id);
            const isStaff = settings.staffRoleId ? member?.roles.cache.has(settings.staffRoleId) : member?.permissions.has(PermissionFlagsBits.ManageChannels);
            if (!isStaff) return await interaction.editReply({ embeds: [errorEmbed("Only staff can delete tickets.")] });

            await sendLog(guildId, baseEmbed(COLORS.red)
                .setTitle("🗑️ Ticket Deleted")
                .addFields(
                    { name: "🎫 Ticket", value: `#${String(ticket.ticketNumber).padStart(4, "0")}`, inline: true },
                    { name: "📂 Type", value: TICKET_TYPES[ticket.type]?.label || ticket.type, inline: true },
                    { name: "👤 Opened by", value: `<@${ticket.userId}>`, inline: true },
                    { name: "🗑️ Deleted by", value: `<@${interaction.user.id}>`, inline: true }
                ));

            await ticket.deleteOne();
            await interaction.channel.delete().catch(console.error);
            return;
        }
    }

    // ── Slash Commands ─────────────────────────────────────────────────────────
    if (!interaction.isChatInputCommand()) return;

    try {
        await Promise.race([
            interaction.deferReply(),
            new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 2500))
        ]);
    } catch (e) { return; }

    const guildId = interaction.guild.id;

    try {
        switch (interaction.commandName) {

            // ── Setup ──────────────────────────────────────────────────────────
            case "setup": {
                const logChannel = interaction.options.getChannel("log_channel");
                const staffRole = interaction.options.getRole("staff_role");
                const category = interaction.options.getChannel("ticket_category");

                await GuildSettings.findOneAndUpdate(
                    { guildId },
                    { logChannelId: logChannel.id, staffRoleId: staffRole.id, ticketCategoryId: category.id },
                    { upsert: true, new: true }
                );

                const embed = baseEmbed(COLORS.green)
                    .setTitle("✅ Ticket System Setup")
                    .addFields(
                        { name: "📋 Log Channel", value: `<#${logChannel.id}>`, inline: true },
                        { name: "🛡️ Staff Role", value: `<@&${staffRole.id}>`, inline: true },
                        { name: "📁 Category", value: category.name, inline: true }
                    )
                    .setDescription("> Run `/panel` in any channel to send the ticket panel!");
                await safeReply(interaction, embed);
                break;
            }

            // ── Panel ──────────────────────────────────────────────────────────
            case "panel": {
                const ch = interaction.options.getChannel("channel");
                const title = interaction.options.getString("title");
                const desc = interaction.options.getString("description");
                const panel = buildPanel(title, desc);
                await ch.send(panel);
                await safeReply(interaction, baseEmbed(COLORS.green)
                    .setTitle("✅ Panel Sent")
                    .setDescription(`> Ticket panel sent to <#${ch.id}>!`));
                break;
            }

            // ── Close ──────────────────────────────────────────────────────────
            case "close": {
                const ticket = await Ticket.findOne({ guildId, channelId: interaction.channel.id });
                if (!ticket) return await safeReply(interaction, errorEmbed("This is not a ticket channel."));
                if (ticket.status === "closed") return await safeReply(interaction, errorEmbed("Ticket is already closed."));

                const transcript = await buildTranscript(interaction.channel, ticket);
                ticket.status = "closed";
                ticket.closedAt = new Date();
                ticket.messages = transcript.split("\n").slice(0, 500);
                await ticket.save();

                try { await interaction.channel.permissionOverwrites.edit(ticket.userId, { SendMessages: false }); } catch (e) {}

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("ticket_delete").setLabel("🗑️ Delete").setStyle(ButtonStyle.Danger)
                );

                await safeReply(interaction, {
                    embeds: [baseEmbed(COLORS.orange).setTitle("🔒 Ticket Closed")
                        .setDescription(`Closed by <@${interaction.user.id}>.\nStaff can delete this ticket.`)],
                    components: [row]
                });

                const settings = await getSettings(guildId);
                if (settings.logChannelId) {
                    const logCh = await client.channels.fetch(settings.logChannelId).catch(() => null);
                    if (logCh) {
                        await logCh.send({ embeds: [baseEmbed(COLORS.orange)
                            .setTitle("🔒 Ticket Closed")
                            .addFields(
                                { name: "🎫 Ticket", value: `#${String(ticket.ticketNumber).padStart(4, "0")}`, inline: true },
                                { name: "👤 Opened by", value: `<@${ticket.userId}>`, inline: true },
                                { name: "🔒 Closed by", value: `<@${interaction.user.id}>`, inline: true }
                            )]});
                        if (transcript) {
                            const { AttachmentBuilder } = require("discord.js");
                            const att = new AttachmentBuilder(Buffer.from(transcript, "utf8"), { name: `transcript-${ticket.ticketNumber}.txt` });
                            await logCh.send({ content: `📄 Transcript for ticket #${String(ticket.ticketNumber).padStart(4, "0")}`, files: [att] });
                        }
                    }
                }
                break;
            }

            // ── Delete ─────────────────────────────────────────────────────────
            case "delete": {
                const ticket = await Ticket.findOne({ guildId, channelId: interaction.channel.id });
                if (!ticket) return await safeReply(interaction, errorEmbed("This is not a ticket channel."));

                await sendLog(guildId, baseEmbed(COLORS.red)
                    .setTitle("🗑️ Ticket Deleted")
                    .addFields(
                        { name: "🎫 Ticket", value: `#${String(ticket.ticketNumber).padStart(4, "0")}`, inline: true },
                        { name: "👤 Opened by", value: `<@${ticket.userId}>`, inline: true },
                        { name: "🗑️ Deleted by", value: `<@${interaction.user.id}>`, inline: true }
                    ));

                await ticket.deleteOne();
                await interaction.channel.delete().catch(console.error);
                break;
            }

            // ── Claim ──────────────────────────────────────────────────────────
            case "claim": {
                const ticket = await Ticket.findOne({ guildId, channelId: interaction.channel.id });
                if (!ticket) return await safeReply(interaction, errorEmbed("This is not a ticket channel."));
                const settings = await getSettings(guildId);
                const member = interaction.guild.members.cache.get(interaction.user.id);
                const isStaff = settings.staffRoleId ? member?.roles.cache.has(settings.staffRoleId) : member?.permissions.has(PermissionFlagsBits.ManageMessages);
                if (!isStaff) return await safeReply(interaction, errorEmbed("Only staff can claim tickets."));
                if (ticket.status === "claimed") return await safeReply(interaction, errorEmbed(`Already claimed by <@${ticket.claimedBy}>.`));

                ticket.status = "claimed";
                ticket.claimedBy = interaction.user.id;
                await ticket.save();

                await safeReply(interaction, baseEmbed(COLORS.gold)
                    .setTitle("✋ Ticket Claimed")
                    .setDescription(`<@${interaction.user.id}> has claimed this ticket.`));

                await sendLog(guildId, baseEmbed(COLORS.gold)
                    .setTitle("✋ Ticket Claimed")
                    .addFields(
                        { name: "🎫 Ticket", value: `<#${interaction.channel.id}>`, inline: true },
                        { name: "👤 Claimed by", value: `<@${interaction.user.id}>`, inline: true }
                    ));
                break;
            }

            // ── Unclaim ────────────────────────────────────────────────────────
            case "unclaim": {
                const ticket = await Ticket.findOne({ guildId, channelId: interaction.channel.id });
                if (!ticket) return await safeReply(interaction, errorEmbed("This is not a ticket channel."));
                if (ticket.claimedBy !== interaction.user.id) return await safeReply(interaction, errorEmbed("You haven't claimed this ticket."));

                ticket.status = "open";
                ticket.claimedBy = "";
                await ticket.save();

                await safeReply(interaction, baseEmbed(COLORS.blue)
                    .setTitle("↩️ Ticket Unclaimed")
                    .setDescription(`<@${interaction.user.id}> has unclaimed this ticket.`));
                break;
            }

            // ── Add User ───────────────────────────────────────────────────────
            case "add": {
                const ticket = await Ticket.findOne({ guildId, channelId: interaction.channel.id });
                if (!ticket) return await safeReply(interaction, errorEmbed("This is not a ticket channel."));
                const user = interaction.options.getUser("user");
                await interaction.channel.permissionOverwrites.edit(user.id, {
                    ViewChannel: true, SendMessages: true, ReadMessageHistory: true
                });
                await safeReply(interaction, baseEmbed(COLORS.green)
                    .setTitle("➕ User Added")
                    .setDescription(`<@${user.id}> has been added to this ticket.`));
                break;
            }

            // ── Remove User ────────────────────────────────────────────────────
            case "remove": {
                const ticket = await Ticket.findOne({ guildId, channelId: interaction.channel.id });
                if (!ticket) return await safeReply(interaction, errorEmbed("This is not a ticket channel."));
                const user = interaction.options.getUser("user");
                if (user.id === ticket.userId) return await safeReply(interaction, errorEmbed("You can't remove the ticket creator."));
                await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: false });
                await safeReply(interaction, baseEmbed(COLORS.orange)
                    .setTitle("➖ User Removed")
                    .setDescription(`<@${user.id}> has been removed from this ticket.`));
                break;
            }

            // ── Ticket Info ────────────────────────────────────────────────────
            case "ticketinfo": {
                const ticket = await Ticket.findOne({ guildId, channelId: interaction.channel.id });
                if (!ticket) return await safeReply(interaction, errorEmbed("This is not a ticket channel."));
                const statusEmoji = { open: "🟢 Open", claimed: "🟡 Claimed", closed: "🔴 Closed" };
                const embed = baseEmbed(COLORS.blue)
                    .setTitle(`🎫 Ticket #${String(ticket.ticketNumber).padStart(4, "0")}`)
                    .addFields(
                        { name: "👤 Opened by", value: `<@${ticket.userId}>`, inline: true },
                        { name: "📂 Type", value: TICKET_TYPES[ticket.type]?.label || ticket.type, inline: true },
                        { name: "📊 Status", value: statusEmoji[ticket.status] || ticket.status, inline: true },
                        { name: "🕐 Created", value: `<t:${Math.floor(ticket.createdAt.getTime() / 1000)}:R>`, inline: true }
                    );
                if (ticket.claimedBy) embed.addFields({ name: "✋ Claimed by", value: `<@${ticket.claimedBy}>`, inline: true });
                await safeReply(interaction, embed);
                break;
            }

            // ── Tickets List ───────────────────────────────────────────────────
            case "tickets": {
                const open = await Ticket.find({ guildId, status: { $in: ["open", "claimed"] } }).sort({ createdAt: -1 }).limit(20);
                const embed = baseEmbed(COLORS.blue).setTitle(`📋 Open Tickets — ${interaction.guild.name}`);
                if (!open.length) {
                    embed.setDescription("> No open tickets.");
                } else {
                    const statusEmoji = { open: "🟢", claimed: "🟡" };
                    const rows = open.map(t =>
                        `${statusEmoji[t.status] || "⚪"} <#${t.channelId}> — **#${String(t.ticketNumber).padStart(4, "0")}** | ${TICKET_TYPES[t.type]?.label || t.type} | <@${t.userId}>${t.claimedBy ? ` | ✋ <@${t.claimedBy}>` : ""}`
                    ).join("\n");
                    embed.setDescription(rows);
                    embed.setFooter({ text: `${open.length} open ticket(s) • Ticket System` });
                }
                await safeReply(interaction, embed);
                break;
            }

            // ── Reload ─────────────────────────────────────────────────────────
            case "reload": {
                await refresh(client);
                await safeReply(interaction, baseEmbed(COLORS.green)
                    .setTitle("🔄 Commands Reloaded")
                    .setDescription("> All slash commands refreshed!"));
                break;
            }
        }
    } catch (e) {
        console.error(`Command error [${interaction.commandName}]:`, e);
        try { await safeReply(interaction, errorEmbed("An internal error occurred.")); } catch (_) {}
    }
});

client.login(TOKEN);
