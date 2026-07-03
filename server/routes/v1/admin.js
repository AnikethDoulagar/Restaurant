const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { db } = require('../../db');
const { requireJwt, requireSuperAdmin, signToken } = require('../../middleware/jwt');
const { encrypt, decrypt } = require('../../crypto');

const router = express.Router();
const jwt = require('jsonwebtoken');

const adminCode = process.env.ADMIN_CODE || '13082008';
const JWT_SECRET = process.env.JWT_SECRET || 'restaurant-platform-jwt-secret-change-in-production';

function hashEmail(email) {
  return crypto.createHash('sha256').update((email || '').toLowerCase().trim()).digest('hex');
}

function signTempToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '5m' });
}

router.post('/login', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });
  if (code !== adminCode) return res.status(401).json({ error: 'Invalid code' });

  const admin = db.prepare("SELECT id, username, role, restaurant_id, totp_secret, totp_enabled FROM owners WHERE role = 'super_admin' LIMIT 1").get();
  if (!admin) return res.status(500).json({ error: 'No super admin found' });

  if (!admin.totp_enabled) {
    const secret = speakeasy.generateSecret({ length: 20, name: 'Restaurant Platform (Super Admin)' });
    db.prepare('UPDATE owners SET totp_secret = ? WHERE id = ?').run(secret.base32, admin.id);
    const otpauth = speakeasy.otpauthURL({
      secret: secret.base32,
      label: 'Super Admin',
      issuer: 'Restaurant Platform',
      encoding: 'base32'
    });
    let qrDataUrl = '';
    try { qrDataUrl = await QRCode.toDataURL(otpauth); } catch (e) {}
    const tempToken = signTempToken({ step: 'totp_setup', adminId: admin.id });
    return res.json({ step: 'setup', tempToken, secret: secret.base32, qrCode: qrDataUrl });
  }

  const tempToken = signTempToken({ step: 'totp_verify', adminId: admin.id });
  res.json({ step: 'verify', tempToken });
});

router.post('/verify-totp', (req, res) => {
  const { tempToken, code } = req.body;
  if (!tempToken || !code) return res.status(400).json({ error: 'Token and code required' });

  try {
    const payload = jwt.verify(tempToken, JWT_SECRET);
    if (!payload.adminId) return res.status(401).json({ error: 'Invalid token' });

    const admin = db.prepare("SELECT id, username, role, restaurant_id, totp_secret FROM owners WHERE id = ?").get(payload.adminId);
    if (!admin || !admin.totp_secret) return res.status(400).json({ error: 'TOTP not configured' });

    const verified = speakeasy.totp.verify({
      secret: admin.totp_secret,
      encoding: 'base32',
      token: code,
      window: 1
    });

    if (!verified) return res.status(401).json({ error: 'Invalid code' });

    if (payload.step === 'totp_setup') {
      db.prepare('UPDATE owners SET totp_enabled = 1 WHERE id = ?').run(admin.id);
    }

    const token = signToken({ id: admin.id, username: admin.username, role: admin.role, restaurantId: admin.restaurant_id });
    res.json({ token, role: admin.role, username: admin.username });
  } catch (e) {
    return res.status(401).json({ error: 'Token expired or invalid' });
  }
});

router.get('/owners', requireJwt, requireSuperAdmin, (req, res) => {
  const owners = db.prepare(
    'SELECT o.id, o.username, o.email, o.email_verified, o.role, o.restaurant_id, o.created_at, r.name as restaurant_name FROM owners o LEFT JOIN restaurants r ON o.restaurant_id = r.id ORDER BY o.created_at DESC'
  ).all();
  const decrypted = owners.map(function(o) {
    if (o.email && o.email.includes(':')) o.email = decrypt(o.email);
    return o;
  });
  res.json(decrypted);
});

router.post('/owners', requireJwt, requireSuperAdmin, (req, res) => {
  const { username, password, email, restaurantId, restaurantName } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existing = db.prepare('SELECT id FROM owners WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  let rid = restaurantId;
  if (rid) {
    const exists = db.prepare('SELECT id FROM restaurants WHERE id = ?').get(rid);
    if (!exists) {
      db.prepare('INSERT INTO restaurants (id, name) VALUES (?, ?)').run(rid, restaurantName || 'Restaurant');
    }
  } else {
    rid = 'rest-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    db.prepare('INSERT INTO restaurants (id, name) VALUES (?, ?)').run(rid, restaurantName || 'New Restaurant');
  }

  const hash = bcrypt.hashSync(password, 10);
  const encEmail = email ? encrypt(email) : '';
  const emailHash = email ? hashEmail(email) : '';
  db.prepare(
    'INSERT INTO owners (username, password, email, email_verified, restaurant_id, role) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(username, hash, encEmail, email ? 1 : 0, rid, 'owner');

  const owner = db.prepare(
    'SELECT o.id, o.username, o.email, o.email_verified, o.role, o.restaurant_id, o.created_at, r.name as restaurant_name FROM owners o LEFT JOIN restaurants r ON o.restaurant_id = r.id WHERE o.username = ?'
  ).get(username);

  res.status(201).json(owner);
});

router.delete('/owners/:id', requireJwt, requireSuperAdmin, (req, res) => {
  try {
    const ownerId = parseInt(req.params.id);
    if (isNaN(ownerId)) return res.status(400).json({ error: 'Invalid owner ID' });

    const owner = db.prepare('SELECT * FROM owners WHERE id = ?').get(ownerId);
    if (!owner) return res.status(404).json({ error: 'Owner not found' });
    if (owner.role === 'super_admin') return res.status(403).json({ error: 'Cannot delete a super admin' });

    const transaction = db.transaction(function() {
      db.prepare('UPDATE registration_codes SET used_by = NULL WHERE used_by = ?').run(ownerId);
      db.prepare('DELETE FROM owners WHERE id = ?').run(ownerId);
    });
    transaction();

    res.json({ success: true, deleted: owner.username });
  } catch (err) {
    console.error('Delete owner error:', err);
    res.status(500).json({ error: 'Failed to delete owner. Server error: ' + err.message });
  }
});

router.put('/owners/:id/reset-password', requireJwt, requireSuperAdmin, (req, res) => {
  const ownerId = parseInt(req.params.id);
  const { password } = req.body;
  if (isNaN(ownerId)) return res.status(400).json({ error: 'Invalid owner ID' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const owner = db.prepare('SELECT * FROM owners WHERE id = ?').get(ownerId);
  if (!owner) return res.status(404).json({ error: 'Owner not found' });

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE owners SET password = ? WHERE id = ?').run(hash, ownerId);
  res.json({ success: true });
});

router.get('/restaurants/stats', requireJwt, requireSuperAdmin, (req, res) => {
  const restaurants = db.prepare('SELECT r.id, r.name, o.username as owner_username FROM restaurants r LEFT JOIN owners o ON o.restaurant_id = r.id WHERE o.role = ? OR o.role IS NULL GROUP BY r.id').all('owner');

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString();

  const stats = restaurants.map(r => {
    const dailyRevenue = db.prepare(
      "SELECT COALESCE(SUM(total),0) as revenue FROM orders WHERE restaurant_id = ? AND created_at >= ? AND status != 'cancelled'"
    ).get(r.id, startOfDay).revenue;

    const weeklyRevenue = db.prepare(
      "SELECT COALESCE(SUM(total),0) as revenue FROM orders WHERE restaurant_id = ? AND created_at >= ? AND status != 'cancelled'"
    ).get(r.id, startOfWeek).revenue;

    const yearlyRevenue = db.prepare(
      "SELECT COALESCE(SUM(total),0) as revenue FROM orders WHERE restaurant_id = ? AND created_at >= ? AND status != 'cancelled'"
    ).get(r.id, startOfYear).revenue;

    const totalOrders = db.prepare(
      "SELECT COUNT(*) as count FROM orders WHERE restaurant_id = ?"
    ).get(r.id).count;

    const totalCustomers = db.prepare(
      "SELECT COUNT(DISTINCT customer_name) as count FROM orders WHERE restaurant_id = ?"
    ).get(r.id).count;

    const menuItems = db.prepare(
      "SELECT COUNT(*) as count FROM menu_items WHERE restaurant_id = ?"
    ).get(r.id).count;

    return {
      id: r.id,
      name: r.name,
      owner: r.owner_username,
      dailyRevenue,
      weeklyRevenue,
      yearlyRevenue,
      totalOrders,
      totalCustomers,
      menuItems
    };
  });

  res.json(stats);
});

router.get('/restaurants/:restaurantId/orders', requireJwt, requireSuperAdmin, (req, res) => {
  const orders = db.prepare(
    'SELECT * FROM orders WHERE restaurant_id = ? ORDER BY created_at DESC LIMIT 50'
  ).all(req.params.restaurantId);

  if (orders.length === 0) return res.json([]);

  const placeholders = orders.map(() => '?').join(',');
  const items = db.prepare(
    `SELECT * FROM order_items WHERE order_id IN (${placeholders}) ORDER BY id`
  ).all(...orders.map(o => o.id));

  const itemsByOrder = {};
  for (const item of items) {
    if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
    itemsByOrder[item.order_id].push(item);
  }

  res.json(orders.map(o => ({ ...o, items: itemsByOrder[o.id] || [] })));
});

router.get('/restaurants/:restaurantId/menu', requireJwt, requireSuperAdmin, (req, res) => {
  const items = db.prepare(
    'SELECT * FROM menu_items WHERE restaurant_id = ? ORDER BY category, name'
  ).all(req.params.restaurantId);
  res.json(items);
});

// =========== REGISTRATION CODES ===========

router.post('/registration-codes', requireJwt, requireSuperAdmin, (req, res) => {
  const code = Math.random().toString(36).slice(2, 10).toUpperCase();
  db.prepare('INSERT INTO registration_codes (code) VALUES (?)').run(code);
  const row = db.prepare('SELECT * FROM registration_codes WHERE code = ?').get(code);
  res.status(201).json(row);
});

router.get('/registration-codes', requireJwt, requireSuperAdmin, (req, res) => {
  const codes = db.prepare('SELECT * FROM registration_codes ORDER BY created_at DESC LIMIT 50').all();
  res.json(codes);
});

router.delete('/registration-codes/:id', requireJwt, requireSuperAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  db.prepare('DELETE FROM registration_codes WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = router;
