// دالة لتشغيل حالة الـ Playing للبوت
function setBotStatus(client) {
  client.user.setPresence({
    activities: [{ name: 'BY VBC', type: 0 }], // نوع 0 يعني Playing (يلعب)
    status: 'online', // الدائرة الخضراء
  });
  console.log("🎮 Bot Status (Playing /help) has been loaded successfully!");
}

module.exports = { setBotStatus };
