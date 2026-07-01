const https = require('https');

const API_KEY = process.env.BREVO_API_KEY;
const SENDER = process.env.SENDER_EMAIL || 'noreply@example.com';

async function sendVerificationCode(email, code) {
  if (!API_KEY) {
    console.log('[EMAIL] BREVO_API_KEY not set — skipping send');
    return;
  }

  const data = JSON.stringify({
    sender: { name: 'Email OTP Auth', email: SENDER },
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
          console.log('[EMAIL] Sent to ' + email.replace(/(.{3}).+(@)/, '$1***$2'));
          resolve();
        } else {
          reject(new Error('Brevo API returned ' + res.statusCode + ': ' + body));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

module.exports = { sendVerificationCode };
