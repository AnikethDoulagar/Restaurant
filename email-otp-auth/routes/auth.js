const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const { sendVerificationCode } = require('../email');
const { sign } = require('../middleware/jwt');
const { signupLimiter, otpLimiter, loginLimiter, resendLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const OTP_EXPIRY_MINUTES = 10;

// In-memory resend cooldown (per email)
const resendCooldowns = new Map();
setInterval(() => {
  const cutoff = Date.now() - 120000;
  for (const [email, ts] of resendCooldowns) {
    if (ts < cutoff) resendCooldowns.delete(email);
  }
}, 60000);

function hashEmail(email) {
  return crypto.createHash('sha256').update((email || '').toLowerCase().trim()).digest('hex');
}

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashOtp(code) {
  return bcrypt.hashSync(code, 10);
}

function verifyOtp(code, hash) {
  return bcrypt.compareSync(code, hash);
}

// ───── POST /signup ─────
router.post('/signup', signupLimiter, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  const emailHash = hashEmail(email);
  const existing = db.prepare('SELECT id, email_verified FROM users WHERE email_hash = ?').get(emailHash);

  if (existing) {
    if (existing.email_verified) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    // Unverified: resend OTP
    const code = generateOtp();
    const otpHash = hashOtp(code);
    const expires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();
    db.prepare('INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?)').run(email, otpHash, expires);
    sendVerificationCode(email, code).catch(() => {});
    return res.json({ success: true, message: 'Verification code sent to your email' });
  }

  const pwdHash = bcrypt.hashSync(password, 10);
  const code = generateOtp();
  const otpHash = hashOtp(code);
  const expires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

  const insertUser = db.prepare('INSERT INTO users (email, email_hash, password) VALUES (?, ?, ?)');
  const insertCode = db.prepare('INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?)');

  const transaction = db.transaction(() => {
    insertUser.run(email, emailHash, pwdHash);
    insertCode.run(email, otpHash, expires);
  });
  transaction();

  sendVerificationCode(email, code).catch(() => {});
  console.log('[AUTH] Signup: ' + email.replace(/(.{3}).+(@)/, '$1***$2'));

  res.status(201).json({ success: true, message: 'Verification code sent to your email' });
});

// ───── POST /verify-otp ─────
router.post('/verify-otp', otpLimiter, (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: 'Email and code required' });
  }

  const rows = db.prepare(
    "SELECT * FROM verification_codes WHERE email = ? AND used = 0 AND expires_at > datetime('now') ORDER BY created_at DESC"
  ).all(email);

  let matched = null;
  for (const row of rows) {
    if (verifyOtp(code, row.code)) {
      matched = row;
      break;
    }
  }

  if (!matched) {
    return res.status(400).json({ error: 'Invalid or expired code' });
  }

  db.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(matched.id);
  db.prepare('UPDATE users SET email_verified = 1 WHERE email_hash = ?').run(hashEmail(email));

  const user = db.prepare('SELECT id, email FROM users WHERE email_hash = ?').get(hashEmail(email));
  const token = sign({ userId: user.id, email: user.email });

  console.log('[AUTH] Verified: ' + email.replace(/(.{3}).+(@)/, '$1***$2'));
  res.json({ success: true, token, email: user.email });
});

// ───── POST /resend-otp ─────
router.post('/resend-otp', resendLimiter, (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const now = Date.now();
  const last = resendCooldowns.get(email);
  if (last && now - last < 60000) {
    const remaining = Math.ceil((60000 - (now - last)) / 1000);
    return res.status(429).json({ error: 'Please wait ' + remaining + 's before requesting another code' });
  }

  const existing = db.prepare('SELECT id, email_verified FROM users WHERE email_hash = ?').get(hashEmail(email));
  if (!existing) return res.status(404).json({ error: 'No account with that email' });
  if (existing.email_verified) return res.status(400).json({ error: 'Email already verified' });

  const code = generateOtp();
  const otpHash = hashOtp(code);
  const expires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();
  db.prepare('INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?)').run(email, otpHash, expires);

  resendCooldowns.set(email, now);
  sendVerificationCode(email, code).catch(() => {});

  res.json({ success: true, message: 'New verification code sent' });
});

// ───── POST /login ─────
router.post('/login', loginLimiter, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email_hash = ?').get(hashEmail(email));
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (!user.email_verified) {
    return res.status(403).json({
      error: 'Email not verified',
      unverified: true,
      email: user.email
    });
  }

  const token = sign({ userId: user.id, email: user.email });
  res.json({ success: true, token, email: user.email });
});

module.exports = router;
