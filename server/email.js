const nodemailer = require('nodemailer');

const SMTP_KEY = process.env.BREVO_SMTP_KEY;
const SMTP_USER = process.env.BREVO_SMTP_USER;

let brevoTransporter = null;

function getBrevoTransporter() {
  if (!brevoTransporter && SMTP_KEY && SMTP_USER) {
    brevoTransporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_KEY }
    });
  }
  return brevoTransporter;
}

let etherealTransporter = null;

async function getEtherealTransporter() {
  if (!etherealTransporter) {
    const testAccount = await nodemailer.createTestAccount();
    etherealTransporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass }
    });
    console.log('[EMAIL] Using Ethereal test account: ' + testAccount.user);
    console.log('[EMAIL] View emails at: https://ethereal.email/login');
  }
  return etherealTransporter;
}

async function sendVerificationCode(email, code) {
  const t = getBrevoTransporter();
  if (t) {
    try {
      const info = await t.sendMail({
        from: '"Restaurant Platform" <' + SMTP_USER + '>',
        to: email,
        subject: 'Your verification code',
        text: 'Your verification code is: ' + code + '\n\nThis code expires in 10 minutes.',
        html: '<p>Your verification code is: <strong>' + code + '</strong></p><p>This code expires in 10 minutes.</p>'
      });
      console.log('[EMAIL] Sent via Brevo to ' + email);
      return;
    } catch (err) {
      console.log('[EMAIL] Brevo failed: ' + err.message);
      console.log('[EMAIL] Make sure SMTP is enabled at https://app.brevo.com/settings/keys/smtp');
      console.log('[EMAIL] And verify sender at https://app.brevo.com/settings/senders');
    }
  }

  try {
    const et = await getEtherealTransporter();
    const info = await et.sendMail({
      from: '"Restaurant Platform" <noreply@restaurantplatform.com>',
      to: email,
      subject: 'Your verification code',
      text: 'Your verification code is: ' + code + '\n\nThis code expires in 10 minutes.',
      html: '<p>Your verification code is: <strong>' + code + '</strong></p><p>This code expires in 10 minutes.</p>'
    });
    console.log('[EMAIL] Preview URL: ' + nodemailer.getTestMessageUrl(info));
  } catch (err) {
    console.log('[EMAIL] Ethereal failed: ' + err.message);
  }
  console.log('[EMAIL] Verification code for ' + email + ': ' + code);
}

module.exports = { sendVerificationCode };
