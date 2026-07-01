const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const { db } = require('../../db');
const { requireJwt, requireSuperAdmin, signToken, verifyToken, JWT_SECRET } = require('../../middleware/jwt');
const { encrypt, decrypt } = require('../../crypto');

const jwt = require('jsonwebtoken');

const router = express.Router();

function hashEmail(email) {
  return crypto.createHash('sha256').update((email || '').toLowerCase().trim()).digest('hex');
}

function getSetting(key, def) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : def;
}

function setSetting(key, value) {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

function getAdminCode() {
  return getSetting('admin_code', process.env.ADMIN_CODE || '13082008');
}

router.post('/login', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });
  if (code !== getAdminCode()) return res.status(401).json({ error: 'Invalid code' });

  const admin = db.prepare("SELECT id, username, role, restaurant_id FROM owners WHERE role = 'super_admin' LIMIT 1").get();
  if (!admin) return res.status(500).json({ error: 'No super admin found' });

  const totpEnabled = getSetting('totp_enabled', '0') === '1';
  if (totpEnabled) {
    const tempToken = jwt.sign({ totp_pending: true, id: admin.id, username: admin.username, role: admin.role, restaurantId: admin.restaurant_id }, JWT_SECRET, { expiresIn: '5m' });
    return res.json({ totp_required: true, temp_token: tempToken });
  }

  const token = signToken({ id: admin.id, username: admin.username, role: admin.role, restaurantId: admin.restaurant_id });
  res.json({ token, role: admin.role, username: admin.username });
});

router.post('/login/totp', (req, res) => {
  const { temp_token, code } = req.body;
  if (!temp_token || !code) return res.status(400).json({ error: 'Temp token and code required' });

  const payload = verifyToken(temp_token);
  if (!payload || !payload.totp_pending) return res.status(401).json({ error: 'Invalid or expired temp token' });

  const secret = getSetting('totp_secret', '');
  if (!secret) return res.status(400).json({ error: 'TOTP not configured' });

  const isValid = authenticator.check(code, secret);
  if (!isValid) return res.status(401).json({ error: 'Invalid authenticator code' });

  const admin = db.prepare("SELECT id, username, role, restaurant_id FROM owners WHERE role = 'super_admin' LIMIT 1").get();
  if (!admin) return res.status(500).json({ error: 'No super admin found' });

  const token = signToken({ id: admin.id, username: admin.username, role: admin.role, restaurantId: admin.restaurant_id });
  res.json({ token, role: admin.role, username: admin.username });
});

router.get('/owners', requireJwt, requireSuperAdmin, (req, res) => {
  const owners = db.prepare(
    'SELECT o.id, o.username, o.email, o.email_verified, o.phone, o.role, o.restaurant_id, o.created_at, r.name as restaurant_name FROM owners o LEFT JOIN restaurants r ON o.restaurant_id = r.id ORDER BY o.created_at DESC'
  ).all();
  const decrypted = owners.map(function(o) {
    if (o.email && o.email.includes(':')) o.email = decrypt(o.email);
    return o;
  });
  res.json(decrypted);
});

router.post('/owners', requireJwt, requireSuperAdmin, (req, res) => {
  const { username, password, email, phone, restaurantId, restaurantName } = req.body;
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
    'INSERT INTO owners (username, password, email, email_verified, phone, restaurant_id, role) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(username, hash, encEmail, email ? 1 : 0, phone || '', rid, 'owner');

  const owner = db.prepare(
    'SELECT o.id, o.username, o.email, o.email_verified, o.role, o.restaurant_id, o.created_at, r.name as restaurant_name FROM owners o LEFT JOIN restaurants r ON o.restaurant_id = r.id WHERE o.username = ?'
  ).get(username);

  res.status(201).json(owner);
});

router.delete('/owners/:id', requireJwt, requireSuperAdmin, (req, res) => {
  const ownerId = parseInt(req.params.id);
  if (isNaN(ownerId)) return res.status(400).json({ error: 'Invalid owner ID' });

  const owner = db.prepare('SELECT * FROM owners WHERE id = ?').get(ownerId);
  if (!owner) return res.status(404).json({ error: 'Owner not found' });
  if (owner.role === 'super_admin') return res.status(403).json({ error: 'Cannot delete a super admin' });

  db.prepare('DELETE FROM owners WHERE id = ?').run(ownerId);
  res.json({ success: true, deleted: owner.username });
});

router.put('/owners/:id', requireJwt, requireSuperAdmin, (req, res) => {
  const ownerId = parseInt(req.params.id);
  if (isNaN(ownerId)) return res.status(400).json({ error: 'Invalid owner ID' });

  const owner = db.prepare('SELECT * FROM owners WHERE id = ?').get(ownerId);
  if (!owner) return res.status(404).json({ error: 'Owner not found' });
  if (owner.role === 'super_admin') return res.status(403).json({ error: 'Cannot edit a super admin' });

  const { username, email, phone, restaurantName } = req.body;

  if (username && username !== owner.username) {
    const existing = db.prepare('SELECT id FROM owners WHERE username = ? AND id != ?').get(username, ownerId);
    if (existing) return res.status(409).json({ error: 'Username already taken' });
  }

  const transaction = db.transaction(() => {
    if (username) db.prepare('UPDATE owners SET username = ? WHERE id = ?').run(username, ownerId);
    if (email !== undefined) {
      const encEmail = email ? encrypt(email) : '';
      const emailHash = email ? hashEmail(email) : '';
      db.prepare('UPDATE owners SET email = ?, email_hash = ?, email_verified = ? WHERE id = ?').run(encEmail, emailHash, email ? owner.email_verified : 0, ownerId);
    }
    if (phone !== undefined) db.prepare('UPDATE owners SET phone = ? WHERE id = ?').run(phone || '', ownerId);
    if (restaurantName) db.prepare('UPDATE restaurants SET name = ? WHERE id = ?').run(restaurantName, owner.restaurant_id);
  });
  transaction();

  const updated = db.prepare(
    'SELECT o.id, o.username, o.email, o.email_verified, o.phone, o.role, o.restaurant_id, o.created_at, r.name as restaurant_name FROM owners o LEFT JOIN restaurants r ON o.restaurant_id = r.id WHERE o.id = ?'
  ).get(ownerId);
  if (updated.email && updated.email.includes(':')) updated.email = decrypt(updated.email);

  res.json(updated);
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

// ============================
// Settings (admin code, etc.)
// ============================
router.get('/settings', requireJwt, requireSuperAdmin, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) {
    if (row.key === 'totp_secret') continue; // never expose secret
    settings[row.key] = row.value;
  }
  // Mask the admin code
  if (settings.admin_code) {
    const c = settings.admin_code;
    settings.admin_code_masked = c.length > 4 ? c.slice(0, 2) + '****' + c.slice(-2) : '****';
  }
  res.json(settings);
});

router.put('/settings', requireJwt, requireSuperAdmin, (req, res) => {
  const { admin_code } = req.body;
  if (admin_code !== undefined) {
    if (!admin_code || admin_code.length < 4) {
      return res.status(400).json({ error: 'Admin code must be at least 4 characters' });
    }
    setSetting('admin_code', admin_code);
  }
  res.json({ success: true });
});

// ============================
// TOTP (Google Authenticator)
// ============================
router.post('/totp/setup', requireJwt, requireSuperAdmin, (req, res) => {
  const secret = authenticator.generateSecret();
  const admin = db.prepare("SELECT username FROM owners WHERE role = 'super_admin' LIMIT 1").get();
  const service = 'Restaurant Platform';
  const label = (admin ? admin.username : 'Super Admin') + '@' + service;
  const otpauth = authenticator.keyuri(label, service, secret);

  // Store temporarily until confirmed
  setSetting('totp_pending_secret', secret);

  QRCode.toDataURL(otpauth, function(err, qrDataUrl) {
    if (err) return res.status(500).json({ error: 'Failed to generate QR code' });
    res.json({ secret, qr_code: qrDataUrl, otpauth });
  });
});

router.post('/totp/confirm', requireJwt, requireSuperAdmin, (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Verification code required' });

  const pendingSecret = getSetting('totp_pending_secret', '');
  if (!pendingSecret) return res.status(400).json({ error: 'No pending TOTP setup. Start setup first.' });

  const isValid = authenticator.check(code, pendingSecret);
  if (!isValid) return res.status(400).json({ error: 'Invalid code. Make sure your authenticator app shows the correct code.' });

  setSetting('totp_secret', pendingSecret);
  setSetting('totp_enabled', '1');
  db.prepare("DELETE FROM settings WHERE key = 'totp_pending_secret'").run();

  res.json({ success: true, message: 'Two-factor authentication enabled' });
});

router.post('/totp/disable', requireJwt, requireSuperAdmin, (req, res) => {
  const { code } = req.body;
  const secret = getSetting('totp_secret', '');
  if (!secret) return res.status(400).json({ error: 'TOTP is not enabled' });

  if (!code || !authenticator.check(code, secret)) {
    return res.status(400).json({ error: 'Invalid authenticator code' });
  }

  db.prepare("DELETE FROM settings WHERE key IN ('totp_secret', 'totp_enabled', 'totp_pending_secret')").run();
  res.json({ success: true, message: 'Two-factor authentication disabled' });
});

// ============================
// Orphan restaurant cleanup
// ============================
router.delete('/restaurants/orphans', requireJwt, requireSuperAdmin, (req, res) => {
  const all = db.prepare('SELECT id FROM restaurants').all();
  const orphaned = all.filter(function(r) {
    const owner = db.prepare("SELECT id FROM owners WHERE restaurant_id = ? LIMIT 1").get(r.id);
    return !owner;
  });
  const ids = orphaned.map(function(r) { return r.id; });
  if (ids.length === 0) return res.json({ deleted: 0, message: 'No orphan restaurants found' });

  const transaction = db.transaction(function() {
    for (var i = 0; i < ids.length; i++) {
      db.prepare("DELETE FROM order_items WHERE restaurant_id = ?").run(ids[i]);
      db.prepare("DELETE FROM orders WHERE restaurant_id = ?").run(ids[i]);
      db.prepare("DELETE FROM menu_items WHERE restaurant_id = ?").run(ids[i]);
      db.prepare("DELETE FROM restaurants WHERE id = ?").run(ids[i]);
    }
  });
  transaction();

  res.json({ deleted: ids.length, deleted_restaurants: ids });
});

// ============================
// System info
// ============================
router.get('/system/info', requireJwt, requireSuperAdmin, (req, res) => {
  const dbSize = db.prepare("SELECT page_count * page_size as size FROM pragma_page_count, pragma_page_size").get();
  const ownerCount = db.prepare("SELECT COUNT(*) as c FROM owners WHERE role = 'owner'").get().c;
  const adminCount = db.prepare("SELECT COUNT(*) as c FROM owners WHERE role = 'super_admin'").get().c;
  const restaurantCount = db.prepare("SELECT COUNT(*) as c FROM restaurants").get().c;
  const orderCount = db.prepare("SELECT COUNT(*) as c FROM orders").get().c;
  const menuCount = db.prepare("SELECT COUNT(*) as c FROM menu_items").get().c;

  res.json({
    database_size_bytes: dbSize ? dbSize.size : 0,
    owners: ownerCount,
    super_admins: adminCount,
    restaurants: restaurantCount,
    total_orders: orderCount,
    total_menu_items: menuCount,
    node_version: process.version,
    platform: process.platform,
    uptime_seconds: Math.floor(process.uptime())
  });
});

module.exports = router;
