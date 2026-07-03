const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('../../db');
const { signToken, requireJwt } = require('../../middleware/jwt');
const { sendVerificationCode } = require('../../email');
const { encrypt, decrypt } = require('../../crypto');

const router = express.Router();

function hashEmail(email) {
  return crypto.createHash('sha256').update((email || '').toLowerCase().trim()).digest('hex');
}

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

  const token = signToken({
    ownerId: owner.id,
    restaurantId: owner.restaurant_id,
    username: owner.username,
    role: owner.role
  });

  res.json({
    success: true,
    token,
    role: owner.role,
    restaurantId: owner.restaurant_id,
    restaurantName: db.prepare('SELECT name FROM restaurants WHERE id = ?').get(owner.restaurant_id)?.name
  });
});

router.get('/verify', requireJwt, (req, res) => {
  res.json({
    authenticated: true,
    role: req.jwt.role,
    restaurantId: req.jwt.restaurantId,
    username: req.jwt.username
  });
});

router.post('/logout', (req, res) => {
  res.json({ success: true });
});

router.post('/register', (req, res) => {
  const { username, password, email, phone, restaurantName, registrationCode } = req.body;
  if (!username || !password || !email) {
    return res.status(400).json({ error: 'Username, password, and email required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  if (!registrationCode) {
    return res.status(400).json({ error: 'Registration code required. Ask the super admin for one.' });
  }

  const codeRow = db.prepare('SELECT * FROM registration_codes WHERE code = ? AND used = 0').get(registrationCode);
  if (!codeRow) {
    return res.status(400).json({ error: 'Invalid or already used registration code.' });
  }

  const emailHash = hashEmail(email);
  const existing = db.prepare('SELECT id FROM owners WHERE username = ? OR email_hash = ?').get(username, emailHash);
  if (existing) {
    return res.status(409).json({ error: 'Username or email already taken' });
  }

  const rid = 'rest-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  db.prepare('INSERT INTO restaurants (id, name) VALUES (?, ?)').run(rid, restaurantName || username + "'s Restaurant");

  const hash = bcrypt.hashSync(password, 10);
  const encEmail = encrypt(email);
  const result = db.prepare(
    'INSERT INTO owners (username, password, email, email_hash, email_verified, restaurant_id, role) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(username, hash, encEmail, emailHash, 1, rid, 'owner');

  db.prepare('UPDATE registration_codes SET used = 1, used_by = ? WHERE id = ?').run(result.lastInsertRowid, codeRow.id);

  const token = signToken({
    ownerId: result.lastInsertRowid,
    restaurantId: rid,
    username,
    role: 'owner'
  });

  res.status(201).json({
    success: true,
    token,
    role: 'owner',
    restaurantId: rid,
    restaurantName: restaurantName || username + "'s Restaurant"
  });
});

router.post('/verify-code', (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Email and code required' });

  const row = db.prepare(
    'SELECT * FROM verification_codes WHERE email = ? AND code = ? AND used = 0 AND expires_at > datetime(\'now\') ORDER BY created_at DESC LIMIT 1'
  ).get(email, code);

  if (!row) return res.status(400).json({ error: 'Invalid or expired code' });

  db.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(row.id);

  res.json({ success: true, message: 'Email verified' });
});

router.post('/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const emailHash = hashEmail(email);
  const owner = db.prepare('SELECT id FROM owners WHERE email_hash = ?').get(emailHash);
  if (!owner) return res.status(404).json({ error: 'No account with that email' });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  db.prepare('INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?)').run(email, code, expires);

  sendVerificationCode(email, code).catch(() => {});

  res.json({ success: true, message: 'Password reset code sent to your email' });
});

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

router.post('/reset-password', (req, res) => {
  const { email, code, password } = req.body;
  if (!email || !code || !password) return res.status(400).json({ error: 'Email, code, and new password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const emailHash = hashEmail(email);
  const row = db.prepare(
    'SELECT * FROM verification_codes WHERE email = ? AND code = ? AND used = 0 AND expires_at > datetime(\'now\') ORDER BY created_at DESC LIMIT 1'
  ).get(email, code);
  if (!row) return res.status(400).json({ error: 'Invalid or expired code' });

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE owners SET password = ? WHERE email_hash = ?').run(hash, emailHash);
  db.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(row.id);

  res.json({ success: true, message: 'Password reset successfully' });
});

module.exports = router;
