const express = require('express');
const { db } = require('../../db');
const { requireJwt, requireSuperAdmin } = require('../../middleware/jwt');

const router = express.Router();

router.get('/', requireJwt, (req, res) => {
  const rid = req.query.restaurantId || req.jwt.restaurantId;
  const links = db.prepare(
    'SELECT * FROM sidebar_links WHERE restaurant_id = ? ORDER BY sort_order ASC, id ASC'
  ).all(rid);
  res.json(links);
});

router.get('/all', requireJwt, requireSuperAdmin, (req, res) => {
  const links = db.prepare(
    'SELECT sl.*, r.name as restaurant_name FROM sidebar_links sl LEFT JOIN restaurants r ON sl.restaurant_id = r.id ORDER BY sl.restaurant_id, sl.sort_order ASC'
  ).all();
  res.json(links);
});

router.put('/', requireJwt, requireSuperAdmin, (req, res) => {
  const { restaurantId, links } = req.body;
  if (!restaurantId || !Array.isArray(links)) {
    return res.status(400).json({ error: 'restaurantId and links array required' });
  }

  const del = db.prepare('DELETE FROM sidebar_links WHERE restaurant_id = ?');
  const ins = db.prepare(
    'INSERT INTO sidebar_links (restaurant_id, label, icon, link_type, link_value, sort_order, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const tx = db.transaction(() => {
    del.run(restaurantId);
    for (let i = 0; i < links.length; i++) {
      const l = links[i];
      ins.run(restaurantId, l.label, l.icon || '', l.link_type || 'view', l.link_value, i, l.enabled !== false ? 1 : 0);
    }
  });
  tx();

  const updated = db.prepare(
    'SELECT * FROM sidebar_links WHERE restaurant_id = ? ORDER BY sort_order ASC'
  ).all(restaurantId);
  res.json(updated);
});

module.exports = router;