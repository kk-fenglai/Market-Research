// Send one test email to verify SMTP is actually working end-to-end.
// Usage: TEST_EMAIL_TO=you@example.com node scripts/testSmtp.js
require('../src/config/env');
const { sendMail } = require('../src/services/mailer');

const now = new Date().toLocaleString();

sendMail({
  to: process.env.TEST_EMAIL_TO || 'you@example.com',
  subject: '[market-research] SMTP 配置测试',
  text: '如果你在 163 邮箱里看到这封邮件，说明 SMTP 已经正常工作，管理员 2FA 验证码也能正常发到你这里了。发送时间: ' + now,
  html: '<div style="font-family:system-ui;padding:24px"><h2 style="color:#1e40af">✅ SMTP 工作正常</h2><p>如果你收到这封邮件，说明：</p><ul><li>163 授权码正确</li><li>smtp.163.com:465 连通</li><li>管理员 2FA 验证码能正常送达</li></ul><p style="color:#6b7280;font-size:12px">发送时间: ' + now + '</p></div>',
}).then((r) => {
  console.log('✅ test email sent');
  console.log('   messageId:', r.messageId || '(n/a)');
  console.log('   → 现在去 163 收件箱查收（也看下垃圾箱）');
}).catch((e) => {
  console.error('❌ send failed:', e.message);
  process.exit(1);
});
