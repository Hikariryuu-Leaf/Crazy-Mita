// ✅ index.js - Full bot Crazy Mita với hệ thống phân quyền role
require('dotenv').config();
const fs = require('fs');
const express = require('express');
const ms = require('ms');
const {
  Client, GatewayIntentBits, Partials, REST, Routes,
  SlashCommandBuilder, EmbedBuilder
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

let ALLOWED_ROLE_IDS = ['123456789012345678']; // thay bằng role mặc định nếu cần

const DB_FILE = './punishments.json';
const loadDB = () => fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};
const saveDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
const addLog = (userId, log) => {
  const db = loadDB();
  if (!db[userId]) db[userId] = [];
  db[userId].push(log);
  saveDB(db);
};
const removeLogsByType = (userId, type) => {
  const db = loadDB();
  if (!db[userId]) return false;
  db[userId] = db[userId].filter(entry => entry.type !== type);
  saveDB(db);
  return true;
};
const removeAllLogs = (userId) => {
  const db = loadDB();
  if (!db[userId]) return false;
  delete db[userId];
  saveDB(db);
  return true;
};

const commandColors = {
  warn: '#ffff00', ban: '#ff0000', unban: '#00ff00', kick: '#ffa500', timeout: '#8b0000',
  untimeout: '#00ff00', addrole: '#00ff00', removerole: '#00ff00', addtemprole: '#00ff00'
};

const commands = [
  new SlashCommandBuilder().setName('warn').setDescription('Cảnh cáo một thành viên')
    .addUserOption(opt => opt.setName('user').setDescription('Người bị cảnh cáo').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true)),

  new SlashCommandBuilder().setName('kick').setDescription('Kick một thành viên')
    .addUserOption(opt => opt.setName('user').setDescription('Người bị kick').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true)),

  new SlashCommandBuilder().setName('ban').setDescription('Ban một thành viên')
    .addUserOption(opt => opt.setName('user').setDescription('Người bị ban').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true)),

  new SlashCommandBuilder().setName('unban').setDescription('Unban một người')
    .addStringOption(opt => opt.setName('userid').setDescription('ID người dùng').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true)),

  new SlashCommandBuilder().setName('timeout').setDescription('Mute tạm thời')
    .addUserOption(opt => opt.setName('user').setDescription('Người bị timeout').setRequired(true))
    .addStringOption(opt => opt.setName('duration').setDescription('Thời gian (1m, 1h...)').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true)),

  new SlashCommandBuilder().setName('untimeout').setDescription('Gỡ timeout')
    .addUserOption(opt => opt.setName('user').setDescription('Người được gỡ').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true)),

  new SlashCommandBuilder().setName('addrole').setDescription('Thêm role cho người dùng')
    .addUserOption(opt => opt.setName('user').setDescription('Người dùng').setRequired(true))
    .addRoleOption(opt => opt.setName('role').setDescription('Role').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true)),

  new SlashCommandBuilder().setName('removerole').setDescription('Gỡ role khỏi người dùng')
    .addUserOption(opt => opt.setName('user').setDescription('Người dùng').setRequired(true))
    .addRoleOption(opt => opt.setName('role').setDescription('Role').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true)),

  new SlashCommandBuilder().setName('addtemprole').setDescription('Thêm role tạm thời')
    .addUserOption(opt => opt.setName('user').setDescription('Người dùng').setRequired(true))
    .addRoleOption(opt => opt.setName('role').setDescription('Role').setRequired(true))
    .addStringOption(opt => opt.setName('duration').setDescription('Thời gian (1h...)').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(true)),

  new SlashCommandBuilder().setName('showpunishment').setDescription('Lịch sử phạt')
    .addUserOption(opt => opt.setName('user').setDescription('Người dùng').setRequired(true)),

  new SlashCommandBuilder().setName('removelog').setDescription('Xoá log theo loại')
    .addUserOption(opt => opt.setName('user').setDescription('Người dùng').setRequired(true))
    .addStringOption(opt => opt.setName('type').setDescription('Loại log').setRequired(true)),

  new SlashCommandBuilder().setName('removealllog').setDescription('Xoá toàn bộ log')
    .addUserOption(opt => opt.setName('user').setDescription('Người dùng').setRequired(true)),

  new SlashCommandBuilder().setName('allowedroles').setDescription('Hiển thị role được phép'),

  new SlashCommandBuilder().setName('addallowedrole').setDescription('Thêm role được phép dùng bot')
    .addRoleOption(opt => opt.setName('role').setDescription('Role cần thêm').setRequired(true))
];

client.once('ready', () => console.log(`✅ Bot đăng nhập với ${client.user.tag}`));

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, guild, user } = interaction;
  const member = await guild.members.fetch(user.id);
  const isAdmin = member.permissions.has('Administrator');
  const hasAllowedRole = member.roles.cache.some(role => ALLOWED_ROLE_IDS.includes(role.id));

  if (!isAdmin && !hasAllowedRole) {
    return interaction.reply({ content: '❌ Bạn không có quyền sử dụng bot.', ephemeral: true });
  }

  const targetUser = options.getUser('user');
  const targetMember = targetUser ? await guild.members.fetch(targetUser.id).catch(() => null) : null;
  const reason = options.getString('reason') || 'Không có lý do';
  const duration = options.getString('duration');
  const role = options.getRole?.('role');
  const userId = options.getString('userid') || targetUser?.id;

  const sendLog = async (title, color) => {
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel?.isTextBased()) return;
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(color)
      .addFields(
        { name: 'Người bị xử lý', value: `${targetUser} (${targetUser.id})`, inline: false },
        { name: 'Lý do', value: reason, inline: false },
        { name: 'Mod thực hiện', value: `${user.tag}`, inline: false }
      )
      .setTimestamp();
    logChannel.send({ embeds: [embed] });
  };

  switch (commandName) {
    case 'warn':
      await interaction.reply({ content: `⚠️ Đã cảnh cáo ${targetUser}`, ephemeral: true });
      try { await targetUser.send(`⚠️ Bạn đã bị cảnh cáo tại **${guild.name}** vì: ${reason}`); } catch {}
      addLog(targetUser.id, { type: 'warn', duration: 'N/A', reason, moderator: user.tag, timestamp: Date.now() });
      sendLog('Warn', commandColors.warn);
      break;

    case 'kick':
      await targetMember.kick(reason);
      await interaction.reply({ content: `👢 Đã kick ${targetUser}`, ephemeral: true });
      try { await targetUser.send(`👢 Bạn đã bị kick khỏi **${guild.name}** vì: ${reason}`); } catch {}
      addLog(targetUser.id, { type: 'kick', duration: 'N/A', reason, moderator: user.tag, timestamp: Date.now() });
      sendLog('Kick', commandColors.kick);
      break;

    case 'ban':
      await guild.members.ban(targetUser.id, { reason });
      await interaction.reply({ content: `🔨 Đã ban ${targetUser}`, ephemeral: true });
      addLog(targetUser.id, { type: 'ban', duration: 'permanent', reason, moderator: user.tag, timestamp: Date.now() });
      sendLog('Ban', commandColors.ban);
      break;

    case 'unban':
      await guild.members.unban(userId, reason);
      await interaction.reply({ content: `✅ Đã unban <@${userId}>`, ephemeral: true });
      sendLog('Unban', commandColors.unban);
      break;

    case 'timeout':
      await targetMember.timeout(ms(duration), reason);
      await interaction.reply({ content: `⏲️ Đã timeout ${targetUser} trong ${duration}`, ephemeral: true });
      addLog(targetUser.id, { type: 'timeout', duration, reason, moderator: user.tag, timestamp: Date.now() });
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
      sendLog('Add Role', commandColors.addrole);
      break;

    case 'removerole':
      await targetMember.roles.remove(role, reason);
      await interaction.reply({ content: `✅ Đã gỡ role ${role.name} khỏi ${targetUser}`, ephemeral: true });
      sendLog('Remove Role', commandColors.removerole);
      break;

    case 'addtemprole':
      await targetMember.roles.add(role, reason);
      setTimeout(() => targetMember.roles.remove(role, 'Tự động gỡ role tạm thời'), ms(duration));
      await interaction.reply({ content: `⏲️ Đã thêm role tạm thời ${role.name} cho ${targetUser}`, ephemeral: true });
      sendLog('Add Temp Role', commandColors.addtemprole);
      break;

    case 'showpunishment': {
      const db = loadDB();
      const history = db[targetUser.id] || [];
      const canDM = await targetUser.createDM().then(() => true).catch(() => false);
      const embed = new EmbedBuilder()
        .setTitle(`📄 Lịch sử phạt của ${targetUser.tag}`)
        .setDescription(history.length
          ? history.map(e => {
              const time = `<t:${Math.floor(e.timestamp / 1000)}:R>`;
              const emoji = { warn: '⚠️', ban: '🔨', kick: '👢', timeout: '⏲️' }[e.type] || '🔸';
              return `${emoji} ${time} – ${e.duration || 'N/A'} – ${e.reason} (${e.moderator})`;
            }).join('\n')
          : '✅ Người dùng này chưa bị phạt.')
        .setFooter({ text: `Tổng cộng: ${history.length} hình phạt • DMs: ${canDM ? 'mở' : 'đóng'}` })
        .setColor('#ffaa00')
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'removelog': {
      const type = options.getString('type');
      const result = removeLogsByType(targetUser.id, type);
      await interaction.reply({
        content: result
          ? `🗑️ Đã xoá các log loại \`${type}\` của ${targetUser}`
          : `⚠️ Không tìm thấy log loại \`${type}\` cho ${targetUser}`,
        ephemeral: true
      });
      break;
    }

    case 'removealllog': {
      const result = removeAllLogs(targetUser.id);
      await interaction.reply({
        content: result
          ? `🗑️ Đã xoá toàn bộ log của ${targetUser}`
          : `⚠️ Người dùng không có log nào để xoá`,
        ephemeral: true
      });
      break;
    }

    case 'allowedroles':
      if (!isAdmin) return interaction.reply({ content: '❌ Lệnh này chỉ dành cho admin.', ephemeral: true });
      return interaction.reply({
        content: `✅ Các role có quyền sử dụng bot:\n${ALLOWED_ROLE_IDS.map(id => `<@&${id}>`).join('\n')}`,
        ephemeral: true
      });

    case 'addallowedrole':
      if (!isAdmin) return interaction.reply({ content: '❌ Lệnh này chỉ dành cho admin.', ephemeral: true });
      const newRole = options.getRole('role');
      if (ALLOWED_ROLE_IDS.includes(newRole.id)) {
        return interaction.reply({ content: `⚠️ Role <@&${newRole.id}> đã nằm trong danh sách.`, ephemeral: true });
      }
      ALLOWED_ROLE_IDS.push(newRole.id);
      return interaction.reply({ content: `✅ Đã thêm <@&${newRole.id}> vào danh sách role được phép sử dụng bot.`, ephemeral: true });
  }
});

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    console.log('🚀 Đăng slash command...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands.map(cmd => cmd.toJSON()) });
    console.log('✅ Slash command đã sẵn sàng!');
  } catch (err) {
    console.error(err);
  }
})();

const app = express();
app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(PORT, () => console.log(`🌐 Server tại cổng ${PORT}`));
