const express = require('express');
const { db } = require('../db');
const { requireJwt } = require('../middleware/jwt');

const router = express.Router();

router.get('/', requireJwt, (req, res) => {
  const items = db.prepare(
    'SELECT * FROM menu_items WHERE restaurant_id = ? ORDER BY category, name'
  ).all(req.jwt.restaurantId);
  res.json(items);
});

router.post('/', requireJwt, (req, res) => {
  const { name, description, price, category, imageUrl, isVeg } = req.body;
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'Name and price required' });
  }

  const result = db.prepare(
    'INSERT INTO menu_items (restaurant_id, name, description, price, category, image_url, is_veg) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(req.jwt.restaurantId, name, description || '', Number(price), category || 'General', imageUrl || '', isVeg !== undefined ? (isVeg ? 1 : 0) : 1);

  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(item);
});

router.put('/:id', requireJwt, (req, res) => {
  const item = db.prepare(
    'SELECT * FROM menu_items WHERE id = ? AND restaurant_id = ?'
  ).get(req.params.id, req.jwt.restaurantId);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const { name, description, price, category, available, imageUrl, isVeg } = req.body;
  db.prepare(
    'UPDATE menu_items SET name = ?, description = ?, price = ?, category = ?, available = ?, image_url = ?, is_veg = ? WHERE id = ?'
  ).run(
    name ?? item.name,
    description ?? item.description,
    price !== undefined ? Number(price) : item.price,
    category ?? item.category,
    available !== undefined ? (available ? 1 : 0) : item.available,
    imageUrl !== undefined ? imageUrl : item.image_url,
    isVeg !== undefined ? (isVeg ? 1 : 0) : item.is_veg,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/:id', requireJwt, (req, res) => {
  const result = db.prepare(
    'DELETE FROM menu_items WHERE id = ? AND restaurant_id = ?'
  ).run(req.params.id, req.jwt.restaurantId);
  if (result.changes === 0) return res.status(404).json({ error: 'Item not found' });
  res.json({ success: true });
});

router.get('/public/:restaurantId', (req, res) => {
  const restaurant = db.prepare(
    'SELECT id, name, name_image_url FROM restaurants WHERE id = ?'
  ).get(req.params.restaurantId);
  if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });

  const items = db.prepare(
    'SELECT id, name, description, price, category, image_url, is_veg FROM menu_items WHERE restaurant_id = ? AND available = 1 ORDER BY category, name'
  ).all(req.params.restaurantId);

  res.json({ restaurant, items });
});

module.exports = router;
