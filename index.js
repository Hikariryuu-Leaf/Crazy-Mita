// ✅ index.js - Full Crazy Mita Bot
require('dotenv').config();
const fs = require('fs');
const express = require('express');
const ms = require('ms');
const {
  Client, GatewayIntentBits, Partials, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, PermissionsBitField
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.GuildMember]
});

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const PORT = process.env.PORT || 3000;
const DB_FILE = './punishments.json';

// Roles được cấp quyền dùng bot ngoài Admin
let ALLOWED_ROLE_IDS = ['123456789012345678'];

const loadDB = () => fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};
const saveDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
const addLog = (userId, log) => {
  const db = loadDB();
  if (!db[userId]) db[userId] = [];
  db[userId].push(log);
  saveDB(db);
};

const commandColors = {
  warn: '#ffff00', ban: '#ff0000', kick: '#ffa500', timeout: '#8b0000',
  addrole: '#00ff00', removerole: '#00ff00'
};

const commands = [
  new SlashCommandBuilder().setName('warn').setDescription('Cảnh cáo thành viên')
    .addUserOption(opt => opt.setName('user').setDescription('Người bị cảnh cáo').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true)),

  new SlashCommandBuilder().setName('kick').setDescription('Kick thành viên')
    .addUserOption(opt => opt.setName('user').setDescription('Người bị kick').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true)),

  new SlashCommandBuilder().setName('ban').setDescription('Ban thành viên')
    .addUserOption(opt => opt.setName('user').setDescription('Người bị ban').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true)),

  new SlashCommandBuilder().setName('timeout').setDescription('Mute tạm thời')
    .addUserOption(opt => opt.setName('user').setDescription('Người bị timeout').setRequired(true))
    .addStringOption(opt => opt.setName('duration').setDescription('VD: 1m, 10m, 1h').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true)),

  new SlashCommandBuilder().setName('addrole').setDescription('Thêm role cho người dùng')
    .addUserOption(opt => opt.setName('user').setDescription('Người dùng').setRequired(true))
    .addRoleOption(opt => opt.setName('role').setDescription('Role cần thêm').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true)),

  new SlashCommandBuilder().setName('showpunishment').setDescription('Lịch sử phạt')
    .addUserOption(opt => opt.setName('user').setDescription('Người cần kiểm tra').setRequired(true)),

  new SlashCommandBuilder().setName('allowedroles').setDescription('📜 Hiển thị các role được phép'),

  new SlashCommandBuilder().setName('addallowedrole').setDescription('➕ Thêm role được phép dùng bot')
    .addRoleOption(opt => opt.setName('role').setDescription('Role cần cấp quyền').setRequired(true)),
];

client.once('ready', () => {
  console.log(`✅ Bot đăng nhập với ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, member, guild, user } = interaction;

  const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);
  const hasAllowedRole = member.roles.cache.some(role => ALLOWED_ROLE_IDS.includes(role.id));

  const canUseBot = isAdmin || hasAllowedRole;

  // Lệnh chỉ admin mới được dùng
  if (['allowedroles', 'addallowedrole'].includes(commandName) && !isAdmin) {
    return interaction.reply({ content: '❌ Chỉ quản trị viên có thể dùng lệnh này.', ephemeral: true });
  }

  // Lệnh thường yêu cầu quyền bot
  if (!canUseBot) {
    return interaction.reply({ content: '🚫 Bạn không có quyền dùng bot.', ephemeral: true });
  }

  const targetUser = options.getUser('user');
  const targetMember = targetUser ? await guild.members.fetch(targetUser.id).catch(() => null) : null;
  const role = options.getRole?.('role');
  const reason = options.getString('reason') || 'Không có lý do';
  const duration = options.getString('duration');

  const sendLog = async (title, color) => {
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel?.isTextBased()) return;
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(color)
      .addFields(
        { name: 'Người bị xử lý', value: `${targetUser} (${targetUser.id})`, inline: false },
        { name: 'Lý do', value: reason, inline: false },
        { name: 'Người thực hiện', value: `${user.tag}`, inline: false }
      )
      .setTimestamp();
    logChannel.send({ embeds: [embed] });
  };

  switch (commandName) {
    case 'warn':
      await interaction.reply({ content: `⚠️ Đã cảnh cáo ${targetUser}`, ephemeral: true });
      try { await targetUser.send(`⚠️ Bạn đã bị cảnh cáo tại **${guild.name}** vì: ${reason}`); } catch {}
      addLog(targetUser.id, { type: 'warn', reason, moderator: user.tag, timestamp: Date.now() });
      sendLog('Warn', commandColors.warn);
      break;

    case 'kick':
      await targetMember.kick(reason);
      await interaction.reply({ content: `👢 Đã kick ${targetUser}`, ephemeral: true });
      addLog(targetUser.id, { type: 'kick', reason, moderator: user.tag, timestamp: Date.now() });
      sendLog('Kick', commandColors.kick);
      break;

    case 'ban':
      await guild.members.ban(targetUser.id, { reason });
      await interaction.reply({ content: `🔨 Đã ban ${targetUser}`, ephemeral: true });
      addLog(targetUser.id, { type: 'ban', reason, moderator: user.tag, timestamp: Date.now() });
      sendLog('Ban', commandColors.ban);
      break;

    case 'timeout':
      await targetMember.timeout(ms(duration), reason);
      await interaction.reply({ content: `⏲️ Timeout ${targetUser} trong ${duration}`, ephemeral: true });
      addLog(targetUser.id, { type: 'timeout', duration, reason, moderator: user.tag, timestamp: Date.now() });
      sendLog('Timeout', commandColors.timeout);
      break;

    case 'addrole':
      await targetMember.roles.add(role, reason);
      await interaction.reply({ content: `✅ Đã thêm role ${role.name} cho ${targetUser}`, ephemeral: true });
      addLog(targetUser.id, { type: 'addrole', reason, role: role.id, moderator: user.tag, timestamp: Date.now() });
      sendLog('Add Role', commandColors.addrole);
      break;

    case 'showpunishment': {
      const db = loadDB();
      const history = db[targetUser.id] || [];
      const embed = new EmbedBuilder()
        .setTitle(`📄 Lịch sử phạt của ${targetUser.tag}`)
        .setDescription(history.length
          ? history.map(e => {
              const time = `<t:${Math.floor(e.timestamp / 1000)}:R>`;
              return `• ${e.type.toUpperCase()} • ${e.reason} • ${e.moderator} • ${time}`;
            }).join('\n')
          : '✅ Người dùng chưa bị xử phạt.')
        .setFooter({ text: `Tổng số: ${history.length}` })
        .setColor('#ffaa00')
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'allowedroles': {
      const roleList = ALLOWED_ROLE_IDS.map(id => {
        const r = guild.roles.cache.get(id);
        return r ? `• ${r.name} (ID: ${r.id})` : `• Không tìm thấy (ID: ${id})`;
      });
      return interaction.reply({
        content: `📜 Các role có quyền dùng bot:\n${roleList.join('\n')}`,
        ephemeral: true
      });
    }

    case 'addallowedrole': {
      const newRole = role;
      if (!ALLOWED_ROLE_IDS.includes(newRole.id)) {
        ALLOWED_ROLE_IDS.push(newRole.id);
      }
      return interaction.reply({ content: `✅ Đã thêm role ${newRole.name} vào danh sách được phép.`, ephemeral: true });
    }
  }
});

client.login(TOKEN);

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    console.log('🚀 Đang đăng slash command...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands.map(cmd => cmd.toJSON()) });
    console.log('✅ Đăng command thành công!');
  } catch (err) {
    console.error(err);
  }
})();

const app = express();
app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(PORT, () => console.log(`🌐 Web server chạy tại cổng ${PORT}`));