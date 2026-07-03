const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('../../db');
const { requireJwt, requireSuperAdmin, signToken } = require('../../middleware/jwt');
const { encrypt, decrypt } = require('../../crypto');

const router = express.Router();

const adminCode = process.env.ADMIN_CODE || '13082008';

function hashEmail(email) {
  return crypto.createHash('sha256').update((email || '').toLowerCase().trim()).digest('hex');
}

router.post('/login', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });
  if (code !== adminCode) return res.status(401).json({ error: 'Invalid code' });

  const admin = db.prepare("SELECT id, username, role, restaurant_id FROM owners WHERE role = 'super_admin' LIMIT 1").get();
  if (!admin) return res.status(500).json({ error: 'No super admin found' });

  const token = signToken({ id: admin.id, username: admin.username, role: admin.role, restaurantId: admin.restaurant_id });
  res.json({ token, role: admin.role, username: admin.username });
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

    db.prepare('DELETE FROM registration_codes WHERE used_by = ?').run(ownerId);
    db.prepare('DELETE FROM owners WHERE id = ?').run(ownerId);
    res.json({ success: true, deleted: owner.username });
  } catch (err) {
    console.error('Delete owner error:', err);
    res.status(500).json({ error: 'Failed to delete owner: ' + err.message });
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

module.exports = router;
