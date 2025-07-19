// index.js - bản đầy đủ các lệnh + hệ thống lưu lịch sử phạt
require('dotenv').config();
const fs = require('fs');
const express = require('express');
const ms = require('ms');
const { 
  Client, GatewayIntentBits, Partials, Collection,
  SlashCommandBuilder, REST, Routes, PermissionFlagsBits, EmbedBuilder
} = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember],
});

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const PORT = process.env.PORT || 3000;

const path = './punishments.json';
const loadPunishments = () => {
  if (!fs.existsSync(path)) return {};
  return JSON.parse(fs.readFileSync(path));
};
const savePunishments = (data) => {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
};
const addPunishment = (userId, entry) => {
  const data = loadPunishments();
  if (!data[userId]) data[userId] = [];
  data[userId].push(entry);
  savePunishments(data);
};

const commandData = [
  new SlashCommandBuilder().setName('warn').setDescription('Cảnh cáo một thành viên')
    .addUserOption(opt => opt.setName('user').setDescription('Người bị cảnh cáo').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder().setName('ban').setDescription('Cấm một thành viên')
    .addUserOption(opt => opt.setName('user').setDescription('Người bị cấm').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder().setName('unban').setDescription('Gỡ cấm thành viên')
    .addStringOption(opt => opt.setName('userid').setDescription('ID người dùng').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder().setName('kick').setDescription('Đá một thành viên')
    .addUserOption(opt => opt.setName('user').setDescription('Người bị đá').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder().setName('timeout').setDescription('Mute tạm thời một thành viên')
    .addUserOption(opt => opt.setName('user').setDescription('Người bị timeout').setRequired(true))
    .addStringOption(opt => opt.setName('duration').setDescription('Thời gian (1m, 1h, 1d...)').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder().setName('untimeout').setDescription('Gỡ timeout thành viên')
    .addUserOption(opt => opt.setName('user').setDescription('Người được gỡ timeout').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder().setName('addrole').setDescription('Thêm role cho thành viên')
    .addUserOption(opt => opt.setName('user').setDescription('Người nhận role').setRequired(true))
    .addRoleOption(opt => opt.setName('role').setDescription('Role').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder().setName('removerole').setDescription('Gỡ role khỏi thành viên')
    .addUserOption(opt => opt.setName('user').setDescription('Người bị gỡ role').setRequired(true))
    .addRoleOption(opt => opt.setName('role').setDescription('Role').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder().setName('addtemprole').setDescription('Thêm role tạm thời cho thành viên')
    .addUserOption(opt => opt.setName('user').setDescription('Người nhận role').setRequired(true))
    .addRoleOption(opt => opt.setName('role').setDescription('Role').setRequired(true))
    .addStringOption(opt => opt.setName('duration').setDescription('Thời gian (1m, 1h, 1d...)').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder().setName('showpunishment').setDescription('Hiển thị lịch sử phạt của người dùng')
    .addUserOption(opt => opt.setName('user').setDescription('Người cần kiểm tra').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(cmd => cmd.toJSON());

const commandColors = {
  warn: '#ffff00', ban: '#ff0000', unban: '#00ff00', kick: '#ffa500', timeout: '#8b0000',
  untimeout: '#00ff00', addrole: '#00ff00', removerole: '#00ff00', addtemprole: '#00ff00'
};

client.once('ready', () => {
  console.log(`✅ Bot đã đăng nhập với tên: ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, guild, user } = interaction;
  const member = guild.members.cache.get(user.id);
  if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '❌ Bạn không có quyền dùng lệnh này.', ephemeral: true });
  }

  const targetUser = options.getUser('user');
  const reason = options.getString('reason');
  const role = options.getRole('role');
  const duration = options.getString('duration');
  const targetId = options.getString('userid');
  const targetMember = targetUser ? guild.members.cache.get(targetUser.id) : null;

  const sendLog = async (title, color) => {
    const embed = new EmbedBuilder()
      .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() })
      .setTitle(title)
      .setColor(color)
      .addFields(
        { name: 'Offender', value: `${targetUser ? `${targetUser} (${targetUser.id})` : `\`${targetId}\``}`, inline: false },
        { name: 'Reason', value: reason, inline: false },
        { name: 'Responsible moderator', value: `${user}`, inline: false }
      )
      .setTimestamp();
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
    if (logChannel && logChannel.isTextBased()) logChannel.send({ embeds: [embed] });
  };

  try {
    switch (commandName) {
      case 'warn':
        await interaction.reply({ content: `⚠️ Đã cảnh cáo ${targetUser}`, ephemeral: true });
        try { await targetUser.send(`⚠️ Bạn đã bị cảnh cáo trong **${guild.name}** vì lý do: ${reason}`); } catch {}
        addPunishment(targetUser.id, { type: 'warn', duration: 'N/A', reason, moderator: user.tag, timestamp: Date.now() });
        sendLog('Warn', commandColors.warn);
        break;
      case 'ban':
        await guild.members.ban(targetUser.id, { reason });
        await interaction.reply({ content: `🔨 Đã ban ${targetUser}`, ephemeral: true });
        addPunishment(targetUser.id, { type: 'ban', duration: 'permanent', reason, moderator: user.tag, timestamp: Date.now() });
        sendLog('Ban', commandColors.ban);
        break;
      case 'unban':
        await guild.members.unban(targetId, reason);
        await interaction.reply({ content: `✅ Đã unban <@${targetId}>`, ephemeral: true });
        sendLog('Unban', commandColors.unban);
        break;
      case 'kick':
        await targetMember.kick(reason);
        await interaction.reply({ content: `👢 Đã kick ${targetUser}`, ephemeral: true });
        addPunishment(targetUser.id, { type: 'kick', duration: 'N/A', reason, moderator: user.tag, timestamp: Date.now() });
        sendLog('Kick', commandColors.kick);
        break;
      case 'timeout':
        await targetMember.timeout(ms(duration), reason);
        await interaction.reply({ content: `⏲️ Đã timeout ${targetUser} trong ${duration}`, ephemeral: true });
        addPunishment(targetUser.id, { type: 'timeout', duration, reason, moderator: user.tag, timestamp: Date.now() });
        sendLog('Timeout', commandColors.timeout);
        break;
      case 'untimeout':
        await targetMember.timeout(null, reason);
        await interaction.reply({ content: `✅ Đã gỡ timeout cho ${targetUser}`, ephemeral: true });
        sendLog('Untimeout', commandColors.untimeout);
        break;
      case 'addrole':
        await targetMember.roles.add(role, reason);
        await interaction.reply({ content: `✅ Đã thêm role ${role.name} cho ${targetUser}`, ephemeral: true });
        sendLog('Addrole', commandColors.addrole);
        break;
      case 'removerole':
        await targetMember.roles.remove(role, reason);
        await interaction.reply({ content: `✅ Đã gỡ role ${role.name} khỏi ${targetUser}`, ephemeral: true });
        sendLog('Removerole', commandColors.removerole);
        break;
      case 'addtemprole':
        await targetMember.roles.add(role, reason);
        setTimeout(() => targetMember.roles.remove(role, 'Tự động gỡ role tạm thời'), ms(duration));
        await interaction.reply({ content: `⏲️ Đã thêm role tạm thời ${role.name} cho ${targetUser}`, ephemeral: true });
        sendLog('Addtemprole', commandColors.addtemprole);
        break;
      case 'showpunishment': {
        const userId = targetUser.id;
        const history = loadPunishments()[userId] || [];
        const lines = history.map(entry => {
          const time = `<t:${Math.floor(entry.timestamp / 1000)}:R>`;
          const icon = { warn: '⚠️', ban: '⛔', kick: '👢', timeout: '⏲️' }[entry.type] || '❔';
          return `${icon} ${time} – ${entry.duration || 'N/A'} – ${entry.reason} (${entry.moderator})`;
        });
        const embed = new EmbedBuilder()
          .setTitle(`📄 Lịch sử phạt của ${targetUser.tag}`)
          .setDescription(lines.length ? lines.join('\n') : '✅ Không có hình phạt nào được ghi nhận.')
          .setColor('#ffcc00')
          .setFooter({ text: `Tổng cộng: ${history.length} hình phạt` })
          .setTimestamp();
        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }
    }
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: '❌ Có lỗi xảy ra khi thực hiện lệnh.', ephemeral: true });
  }
});

client.login(TOKEN);

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    console.log('🚀 Đang đăng các slash command...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commandData });
    console.log('✅ Đăng slash command thành công!');
  } catch (err) {
    console.error(err);
  }
})();

const app = express();
app.get('/', (req, res) => {
  res.send('Bot is alive!');
});
app.listen(PORT, () => {
  console.log(`🌐 Web server is running on port ${PORT}`);
});