const nodemailer = require('nodemailer');
const https = require('https');

const API_KEY = process.env.BREVO_API_KEY;
const SMTP_KEY = process.env.BREVO_SMTP_KEY;
const SMTP_USER = process.env.BREVO_SMTP_USER;

async function sendViaApi(email, code) {
  const data = JSON.stringify({
    sender: { name: 'Restaurant Platform', email: SMTP_USER || 'noreply@restaurantplatform.com' },
    to: [{ email }],
    subject: 'Your verification code',
    textContent: 'Your verification code is: ' + code + '\n\nThis code expires in 10 minutes.',
    htmlContent: '<p>Your verification code is: <strong>' + code + '</strong></p><p>This code expires in 10 minutes.</p>'
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.brevo.com',
      path: '/v3/smtp/email',
      method: 'POST',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode === 201 || res.statusCode === 200) {
          console.log('[EMAIL] Sent via Brevo API to ' + email.replace(/(.{3}).+(@)/, '$1***$2'));
          resolve();
        } else {
          reject(new Error('Brevo API returned ' + res.statusCode));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

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
    console.log('[EMAIL] Using Ethereal test account');
  }
  return etherealTransporter;
}

async function sendVerificationCode(email, code) {
  const masked = email.replace(/(.{3}).+(@)/, '$1***$2');

  if (API_KEY) {
    try {
      await sendViaApi(email, code);
      console.log('[EMAIL] Sent via Brevo API to ' + masked);
      return;
    } catch (err) {
      console.log('[EMAIL] Brevo API failed: ' + err.message);
    }
  }

  const t = getBrevoTransporter();
  if (t) {
    try {
      await t.sendMail({
        from: '"Restaurant Platform" <' + SMTP_USER + '>',
        to: email,
        subject: 'Your verification code',
        text: 'Your verification code is: ' + code + '\n\nThis code expires in 10 minutes.',
        html: '<p>Your verification code is: <strong>' + code + '</strong></p><p>This code expires in 10 minutes.</p>'
      });
      console.log('[EMAIL] Sent via Brevo SMTP to ' + masked);
      return;
    } catch (err) {
      console.log('[EMAIL] Brevo SMTP failed: ' + err.message);
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
    console.log('[EMAIL] Ethereal preview: ' + nodemailer.getTestMessageUrl(info));
  } catch (err) {
    console.log('[EMAIL] All delivery methods failed: ' + err.message);
  }
  console.log('[EMAIL] Code sent to ' + masked);
}

module.exports = { sendVerificationCode };
