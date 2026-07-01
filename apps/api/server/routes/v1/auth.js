const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('../../db');
const { signToken, requireJwt } = require('../../middleware/jwt');
const { sendVerificationCode } = require('../../email');
const { encrypt, decrypt } = require('../../crypto');

const router = express.Router();

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;

// In-memory resend cooldown: email → timestamp
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

function verifyOtpHash(code, hash) {
  return bcrypt.compareSync(code, hash);
}

// ============================
// POST /signup
// ============================
router.post('/signup', (req, res) => {
  const { email, password, username, restaurantName, phone } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (!phone || !/^\d{7,15}$/.test(phone)) {
    return res.status(400).json({ error: 'Valid phone number required' });
  }

  const emailHash = hashEmail(email);
  const existing = db.prepare('SELECT id, email_verified FROM owners WHERE email_hash = ?').get(emailHash);
  if (existing) {
    if (existing.email_verified) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    // Unverified — allow re-sending OTP without re-creating account
    const code = generateOtp();
    const hash = hashOtp(code);
    const expires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();
    db.prepare('INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?)').run(email, hash, expires);
    sendVerificationCode(email, code).catch(() => {});
    console.log('[AUTH] Resent OTP for existing unverified account: ' + email.replace(/(.{3}).+(@)/, '$1***$2'));
    return res.json({ success: true, message: 'Verification code sent to your email' });
  }

  const uname = username || email.split('@')[0];
  const rid = 'rest-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);

  const existingUser = db.prepare('SELECT id FROM owners WHERE username = ?').get(uname);
  if (existingUser) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const pwdHash = bcrypt.hashSync(password, 10);
  const encEmail = encrypt(email);

  const code = generateOtp();
  const hash = hashOtp(code);
  const expires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

  const transaction = db.transaction(() => {
    db.prepare('INSERT INTO restaurants (id, name) VALUES (?, ?)').run(rid, restaurantName || uname + "'s Restaurant");
    db.prepare(
      'INSERT INTO owners (username, password, email, email_hash, email_verified, phone, restaurant_id, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(uname, pwdHash, encEmail, emailHash, 0, phone, rid, 'owner');
    db.prepare('INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?)').run(email, hash, expires);
  });
  transaction();

  sendVerificationCode(email, code).catch(() => {});
  console.log('[AUTH] Signup: ' + email.replace(/(.{3}).+(@)/, '$1***$2'));

  res.status(201).json({ success: true, message: 'Verification code sent to your email' });
});

// ============================
// POST /verify-otp
// ============================
router.post('/verify-otp', (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: 'Email and code required' });
  }

  const rows = db.prepare(
    "SELECT * FROM verification_codes WHERE email = ? AND used = 0 AND expires_at > datetime('now') ORDER BY created_at DESC"
  ).all(email);

  let matched = null;
  for (const row of rows) {
    if (verifyOtpHash(code, row.code)) {
      matched = row;
      break;
    }
  }

  if (!matched) {
    return res.status(400).json({ error: 'Invalid or expired code' });
  }

  db.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(matched.id);
  const emailHash = hashEmail(email);
  db.prepare('UPDATE owners SET email_verified = 1 WHERE email_hash = ?').run(emailHash);

  const owner = db.prepare('SELECT * FROM owners WHERE email_hash = ?').get(emailHash);
  if (!owner) {
    return res.status(404).json({ error: 'Account not found' });
  }

  const token = signToken({
    ownerId: owner.id,
    restaurantId: owner.restaurant_id,
    username: owner.username,
    role: owner.role
  });

  const restaurant = db.prepare('SELECT name FROM restaurants WHERE id = ?').get(owner.restaurant_id);

  console.log('[AUTH] Email verified: ' + email.replace(/(.{3}).+(@)/, '$1***$2'));
  res.json({
    success: true,
    token,
    role: owner.role,
    restaurantId: owner.restaurant_id,
    restaurantName: restaurant ? restaurant.name : null
  });
});

// ============================
// POST /resend-otp
// ============================
router.post('/resend-otp', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  const now = Date.now();
  const last = resendCooldowns.get(email);
  if (last && now - last < 60000) {
    const remaining = Math.ceil((60000 - (now - last)) / 1000);
    return res.status(429).json({ error: 'Please wait ' + remaining + 's before requesting another code' });
  }

  const emailHash = hashEmail(email);
  const owner = db.prepare('SELECT id, email_verified FROM owners WHERE email_hash = ?').get(emailHash);
  if (!owner) {
    return res.status(404).json({ error: 'No account with that email' });
  }
  if (owner.email_verified) {
    return res.status(400).json({ error: 'Email already verified' });
  }

  const code = generateOtp();
  const hash = hashOtp(code);
  const expires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();
  db.prepare('INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?)').run(email, hash, expires);

  resendCooldowns.set(email, now);

  sendVerificationCode(email, code).catch(() => {});
  console.log('[AUTH] Resent OTP to ' + email.replace(/(.{3}).+(@)/, '$1***$2'));

  res.json({ success: true, message: 'New verification code sent' });
});

// ============================
// POST /login
// ============================
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const emailHash = hashEmail(username);
  const owner = db.prepare('SELECT * FROM owners WHERE username = ? OR email_hash = ?').get(username, emailHash);
  if (!owner || !bcrypt.compareSync(password, owner.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (!owner.email_verified) {
    const email = owner.email ? decrypt(owner.email) : null;
    return res.status(403).json({
      error: 'Email not verified',
      unverified: true,
      email: email || (username.includes('@') ? username : null)
    });
  }

  const token = signToken({
    ownerId: owner.id,
    restaurantId: owner.restaurant_id,
    username: owner.username,
    role: owner.role
  });

  const restaurant = db.prepare('SELECT name FROM restaurants WHERE id = ?').get(owner.restaurant_id);

  res.json({
    success: true,
    token,
    role: owner.role,
    restaurantId: owner.restaurant_id,
    restaurantName: restaurant ? restaurant.name : null
  });
});

// ============================
// Backward-compat aliases
// ============================
router.post('/register', (req, res, next) => {
  req.url = '/signup';
  router.handle(req, res, next);
});
router.post('/verify-and-login', (req, res, next) => {
  req.url = '/verify-otp';
  router.handle(req, res, next);
});
router.post('/send-code', (req, res, next) => {
  req.url = '/resend-otp';
  router.handle(req, res, next);
});

// ============================
// GET /verify (unchanged)
// ============================
router.get('/verify', requireJwt, (req, res) => {
  res.json({
    authenticated: true,
    role: req.jwt.role,
    restaurantId: req.jwt.restaurantId,
    username: req.jwt.username
  });
});

// ============================
// POST /logout (unchanged)
// ============================
router.post('/logout', (req, res) => {
  res.json({ success: true });
});

// ============================
// POST /verify-code (standalone, no JWT)
// ============================
router.post('/verify-code', (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Email and code required' });

  const rows = db.prepare(
    "SELECT * FROM verification_codes WHERE email = ? AND used = 0 AND expires_at > datetime('now') ORDER BY created_at DESC"
  ).all(email);

  let matched = null;
  for (const row of rows) {
    if (verifyOtpHash(code, row.code)) {
      matched = row;
      break;
    }
  }

  if (!matched) return res.status(400).json({ error: 'Invalid or expired code' });

  db.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(matched.id);
  res.json({ success: true, message: 'Code verified' });
});

// ============================
// POST /forgot-password
// ============================
router.post('/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const emailHash = hashEmail(email);
  const owner = db.prepare('SELECT id FROM owners WHERE email_hash = ?').get(emailHash);
  if (!owner) return res.status(404).json({ error: 'No account with that email' });

  const code = generateOtp();
  const hash = hashOtp(code);
  const expires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();
  db.prepare('INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?)').run(email, hash, expires);

  sendVerificationCode(email, code).catch(() => {});
  res.json({ success: true, message: 'Password reset code sent to your email' });
});

// ============================
// POST /reset-password
// ============================
router.post('/reset-password', (req, res) => {
  const { email, code, password } = req.body;
  if (!email || !code || !password) return res.status(400).json({ error: 'Email, code, and new password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const rows = db.prepare(
    "SELECT * FROM verification_codes WHERE email = ? AND used = 0 AND expires_at > datetime('now') ORDER BY created_at DESC"
  ).all(email);

  let matched = null;
  for (const row of rows) {
    if (verifyOtpHash(code, row.code)) {
      matched = row;
      break;
    }
  }

  if (!matched) return res.status(400).json({ error: 'Invalid or expired code' });

  const emailHash = hashEmail(email);
  const pwdHash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE owners SET password = ? WHERE email_hash = ?').run(pwdHash, emailHash);
  db.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(matched.id);

  res.json({ success: true, message: 'Password reset successfully' });
});

// ============================
// PUT /change-password (authenticated)
// ============================
router.put('/change-password', requireJwt, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const owner = db.prepare('SELECT * FROM owners WHERE id = ?').get(req.jwt.ownerId);
  if (!owner || !bcrypt.compareSync(currentPassword, owner.password)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE owners SET password = ? WHERE id = ?').run(hash, owner.id);

  res.json({ success: true, message: 'Password changed successfully' });
});

module.exports = router;
