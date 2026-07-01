const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const owner = db.prepare('SELECT * FROM owners WHERE username = ?').get(username);
  if (!owner || !bcrypt.compareSync(password, owner.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.ownerId = owner.id;
  req.session.restaurantId = owner.restaurant_id;
  res.json({ success: true, restaurantId: owner.restaurant_id });
});

router.post('/signup', (req, res) => {
  const { username, password, restaurantName } = req.body;
  if (!username || !password || !restaurantName) {
    return res.status(400).json({ error: 'Username, password, and restaurant name required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existing = db.prepare('SELECT id FROM owners WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const restaurantId = 'rest-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);

  const insertRestaurant = db.prepare('INSERT INTO restaurants (id, name) VALUES (?, ?)');
  const insertOwner = db.prepare('INSERT INTO owners (username, password, restaurant_id) VALUES (?, ?, ?)');

  const hash = bcrypt.hashSync(password, 10);

  const transaction = db.transaction(() => {
    insertRestaurant.run(restaurantId, restaurantName);
    insertOwner.run(username, hash, restaurantId);
  });

  transaction();

  req.session.ownerId = db.prepare('SELECT id FROM owners WHERE username = ?').get(username).id;
  req.session.restaurantId = restaurantId;

  res.status(201).json({ success: true, restaurantId, restaurantName });
});

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

router.get('/check', (req, res) => {
  if (req.session && req.session.ownerId) {
    return res.json({
      authenticated: true,
      restaurantId: req.session.restaurantId
    });
  }
  res.json({ authenticated: false });
});

module.exports = router;
