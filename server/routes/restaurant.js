const express = require('express');
const { db } = require('../db');
const { requireJwt } = require('../middleware/jwt');

const router = express.Router();

router.get('/settings', requireJwt, (req, res) => {
  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.jwt.restaurantId);
  if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });
  res.json(restaurant);
});

router.put('/settings', requireJwt, (req, res) => {
  const { name, name_image_url } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  if (name_image_url !== undefined) {
    db.prepare('UPDATE restaurants SET name = ?, name_image_url = ? WHERE id = ?').run(name, name_image_url, req.jwt.restaurantId);
  } else {
    db.prepare('UPDATE restaurants SET name = ? WHERE id = ?').run(name, req.jwt.restaurantId);
  }
  const updated = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.jwt.restaurantId);
  res.json(updated);
});

// WhatsApp config - per restaurant
router.get('/whatsapp', requireJwt, (req, res) => {
  const config = db.prepare('SELECT * FROM whatsapp_config WHERE restaurant_id = ?').get(req.jwt.restaurantId);
  res.json(config || { restaurant_id: req.jwt.restaurantId, enabled: 0, api_url: '', api_key: '', phone_number_id: '', business_phone: '', verify_token: '' });
});

router.put('/whatsapp', requireJwt, (req, res) => {
  const { enabled, api_url, api_key, phone_number_id, business_phone, verify_token } = req.body;
  const existing = db.prepare('SELECT restaurant_id FROM whatsapp_config WHERE restaurant_id = ?').get(req.jwt.restaurantId);
  if (existing) {
    db.prepare('UPDATE whatsapp_config SET enabled = ?, api_url = ?, api_key = ?, phone_number_id = ?, business_phone = ?, verify_token = ?, updated_at = CURRENT_TIMESTAMP WHERE restaurant_id = ?')
      .run(enabled ? 1 : 0, api_url || '', api_key || '', phone_number_id || '', business_phone || '', verify_token || '', req.jwt.restaurantId);
  } else {
    db.prepare('INSERT INTO whatsapp_config (restaurant_id, enabled, api_url, api_key, phone_number_id, business_phone, verify_token) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(req.jwt.restaurantId, enabled ? 1 : 0, api_url || '', api_key || '', phone_number_id || '', business_phone || '', verify_token || '');
  }
  const updated = db.prepare('SELECT * FROM whatsapp_config WHERE restaurant_id = ?').get(req.jwt.restaurantId);
  res.json(updated);
});

router.post('/whatsapp/test', requireJwt, async (req, res) => {
  const config = db.prepare('SELECT * FROM whatsapp_config WHERE restaurant_id = ?').get(req.jwt.restaurantId);
  if (!config || !config.api_url || !config.api_key) {
    return res.status(400).json({ error: 'WhatsApp API not configured' });
  }
  try {
    const testUrl = config.api_url.replace(/\/$/, '') + '/test';
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + config.api_key, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
    res.json({ success: response.ok, status: response.status, message: response.ok ? 'Connection successful' : 'Connection failed with status ' + response.status });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Connection failed: ' + e.message });
  }
});

router.get('/:restaurantId', (req, res) => {
  const restaurant = db.prepare(
    'SELECT id, name, name_image_url FROM restaurants WHERE id = ?'
  ).get(req.params.restaurantId);
  if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });
  res.json(restaurant);
});

module.exports = router;
