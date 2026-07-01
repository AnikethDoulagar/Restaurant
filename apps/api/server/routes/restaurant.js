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

router.get('/:restaurantId', (req, res) => {
  const restaurant = db.prepare(
    'SELECT id, name, name_image_url FROM restaurants WHERE id = ?'
  ).get(req.params.restaurantId);
  if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });
  res.json(restaurant);
});

module.exports = router;
