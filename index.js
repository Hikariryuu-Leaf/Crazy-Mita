require('dotenv').config();
const { Client, GatewayIntentBits, Partials, SlashCommandBuilder, REST, Routes, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const express = require('express');
const ms = require('ms');
const db = require('quick.db');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember],
});

// Slash command definitions
const commands = [
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Cảnh cáo thành viên')
    .addUserOption(opt => opt.setName('user').setDescription('Người bị cảnh cáo').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Đá thành viên')
    .addUserOption(opt => opt.setName('user').setDescription('Người bị đá').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout thành viên')
    .addUserOption(opt => opt.setName('user').setDescription('Người bị timeout').setRequired(true))
    .addStringOption(opt => opt.setName('duration').setDescription('Thời gian (1m, 1h...)').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('addrole')
    .setDescription('Thêm role cho thành viên')
    .addUserOption(opt => opt.setName('user').setDescription('Người được thêm').setRequired(true))
    .addRoleOption(opt => opt.setName('role').setDescription('Role cần thêm').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('addtemprole')
    .setDescription('Thêm role tạm thời')
    .addUserOption(opt => opt.setName('user').setDescription('Người nhận').setRequired(true))
    .addRoleOption(opt => opt.setName('role').setDescription('Role').setRequired(true))
    .addStringOption(opt => opt.setName('duration').setDescription('Thời gian').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('show')
    .setDescription('Hiển thị thông tin')
    .addSubcommand(sub => sub
      .setName('punishment')
      .setDescription('Lịch sử xử phạt')
      .addUserOption(opt => opt.setName('user').setDescription('Người cần xem')))
].map(cmd => cmd.toJSON());

// Register slash commands
const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    console.log('🔁 Đăng slash command...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('✅ Slash command đã sẵn sàng!');
  } catch (err) {
    console.error('❌ Lỗi đăng command:', err);
  }
})();

// Handle punishments
function logPunishment(type, userId, data) {
  db.push(`punishments_${userId}`, { type, ...data, date: Date.now() });
}

function formatTimeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return \`\${hours} giờ trước\`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, guild, user } = interaction;

  if (commandName === 'show' && interaction.options.getSubcommand() === 'punishment') {
    const target = options.getUser('user') || user;
    const all = db.get(`punishments_${target.id}`) || [];

    const punishments = all.filter(p => p.type !== 'kick');
    const kicks = all.filter(p => p.type === 'kick');

    const description = punishments.map(p => {
      const emoji = {
        warn: '⚠️', timeout: '⏲️', addrole: '➕', addtemprole: '⏳'
      }[p.type] || '❔';
      return \`\${emoji} **\${p.type}** - \${p.reason} (bởi \${p.moderator}) - \${formatTimeAgo(p.date)}\`;
    });

    kicks.forEach(p => {
      description.push(\`👢 **kick** - \${p.reason} (bởi \${p.moderator}) - \${formatTimeAgo(p.date)}\`);
    });

    const embed = new EmbedBuilder()
      .setTitle(\`📄 Lịch sử xử phạt: \${target.tag}\`)
      .setDescription(description.length ? description.join('\n') : '✅ Không có xử phạt nào.')
      .setColor('Orange')
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const targetUser = options.getUser('user');
  const targetMember = targetUser && guild.members.cache.get(targetUser.id);
  const reason = options.getString('reason');
  const role = options.getRole('role');
  const duration = options.getString('duration');

  try {
    switch (commandName) {
      case 'warn':
        try { await targetUser.send(\`⚠️ Bạn đã bị cảnh cáo tại **\${guild.name}** vì: \${reason}\`); } catch {}
        logPunishment('warn', targetUser.id, { reason, moderator: user.tag });
        await interaction.reply({ content: \`⚠️ Đã cảnh cáo \${targetUser.tag}\`, ephemeral: true });
        break;

      case 'kick':
        await targetMember.kick(reason);
        logPunishment('kick', targetUser.id, { reason, moderator: user.tag });
        await interaction.reply({ content: \`👢 Đã kick \${targetUser.tag}\`, ephemeral: true });
        break;

      case 'timeout':
        await targetMember.timeout(ms(duration), reason);
        logPunishment('timeout', targetUser.id, { reason, moderator: user.tag });
        await interaction.reply({ content: \`⏲️ Đã timeout \${targetUser.tag} trong \${duration}\`, ephemeral: true });
        break;

      case 'addrole':
        await targetMember.roles.add(role, reason);
        logPunishment('addrole', targetUser.id, { reason, moderator: user.tag });
        await interaction.reply({ content: \`➕ Đã thêm role \${role.name} cho \${targetUser.tag}\`, ephemeral: true });
        break;

      case 'addtemprole':
        await targetMember.roles.add(role, reason);
        logPunishment('addtemprole', targetUser.id, { reason, moderator: user.tag });
        setTimeout(() => targetMember.roles.remove(role).catch(() => {}), ms(duration));
        await interaction.reply({ content: \`⏳ Đã thêm role tạm thời \${role.name} cho \${targetUser.tag}\`, ephemeral: true });
        break;
    }
  } catch (err) {
    console.error(err);
    await interaction.reply({ content: '❌ Có lỗi xảy ra.', ephemeral: true });
  }
});

client.once('ready', () => {
  console.log(`🤖 Bot đang chạy với tên: ${client.user.tag}`);
});

client.login(TOKEN);

// Web server
const app = express();
app.get('/', (_, res) => res.send('Bot is alive!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));