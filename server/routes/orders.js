const express = require('express');
const { db } = require('../db');
const { requireJwt } = require('../middleware/jwt');

const router = express.Router();

function getIO(req) { return req.app.get('io'); }

router.get('/', requireJwt, (req, res) => {
  const orders = db.prepare(
    'SELECT * FROM orders WHERE restaurant_id = ? ORDER BY created_at DESC'
  ).all(req.jwt.restaurantId);

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

router.post('/', (req, res) => {
  const { restaurantId, customerName, tableNumber, items } = req.body;
  if (!restaurantId || !items || items.length === 0) {
    return res.status(400).json({ error: 'Restaurant ID and items required' });
  }

  const restaurant = db.prepare('SELECT id FROM restaurants WHERE id = ?').get(restaurantId);
  if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });

  for (const item of items) {
    const menuItem = db.prepare(
      'SELECT * FROM menu_items WHERE id = ? AND restaurant_id = ?'
    ).get(item.menuItemId, restaurantId);
    if (!menuItem) {
      return res.status(400).json({ error: `Item ${item.menuItemId} not found` });
    }
  }

  let total = 0;
  const itemDetails = [];
  for (const item of items) {
    const menuItem = db.prepare(
      'SELECT * FROM menu_items WHERE id = ? AND restaurant_id = ?'
    ).get(item.menuItemId, restaurantId);
    const qty = item.quantity || 1;
    total += menuItem.price * qty;
    itemDetails.push({ ...menuItem, quantity: qty });
  }
  total = Math.round(total * 100) / 100;

  const tableNum = tableNumber ? parseInt(tableNumber) : null;
  const orderResult = db.prepare(
    'INSERT INTO orders (restaurant_id, customer_name, table_number, total) VALUES (?, ?, ?, ?)'
  ).run(restaurantId, customerName || 'Guest', tableNum, total);

  const insertItem = db.prepare(
    'INSERT INTO order_items (order_id, restaurant_id, menu_item_id, name, quantity, price) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const det of itemDetails) {
    insertItem.run(orderResult.lastInsertRowid, restaurantId, det.id, det.name, det.quantity, det.price);
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderResult.lastInsertRowid);
  const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderResult.lastInsertRowid);

  res.status(201).json({ ...order, items: orderItems });
});

router.delete('/today', requireJwt, (req, res) => {
  const today = new Date();
  const startOfDay = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')} 00:00:00`;
  const endOfDay = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')} 23:59:59`;

  const orders = db.prepare(
    'SELECT id FROM orders WHERE restaurant_id = ? AND created_at BETWEEN ? AND ?'
  ).all(req.jwt.restaurantId, startOfDay, endOfDay);

  if (orders.length === 0) return res.json({ deleted: 0 });

  const ids = orders.map(o => o.id);
  const placeholders = ids.map(() => '?').join(',');

  const deleteItems = db.prepare(
    `DELETE FROM order_items WHERE order_id IN (${placeholders}) AND restaurant_id = ?`
  );
  const deleteOrders = db.prepare(
    `DELETE FROM orders WHERE id IN (${placeholders}) AND restaurant_id = ?`
  );

  db.transaction(() => {
    deleteItems.run(...ids, req.jwt.restaurantId);
    deleteOrders.run(...ids, req.jwt.restaurantId);
  })();

  res.json({ deleted: orders.length });
});

router.delete('/all', requireJwt, (req, res) => {
  const orders = db.prepare(
    'SELECT id FROM orders WHERE restaurant_id = ?'
  ).all(req.jwt.restaurantId);

  if (orders.length === 0) return res.json({ deleted: 0 });

  const ids = orders.map(o => o.id);
  const placeholders = ids.map(() => '?').join(',');

  const deleteItems = db.prepare(
    `DELETE FROM order_items WHERE order_id IN (${placeholders}) AND restaurant_id = ?`
  );
  const deleteOrders = db.prepare(
    `DELETE FROM orders WHERE id IN (${placeholders}) AND restaurant_id = ?`
  );

  db.transaction(() => {
    deleteItems.run(...ids, req.jwt.restaurantId);
    deleteOrders.run(...ids, req.jwt.restaurantId);
  })();

  res.json({ deleted: orders.length });
});

router.put('/:id/status', requireJwt, (req, res) => {
  const { status } = req.body;
  const valid = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const result = db.prepare(
    'UPDATE orders SET status = ? WHERE id = ? AND restaurant_id = ?'
  ).run(status, req.params.id, req.jwt.restaurantId);
  if (result.changes === 0) return res.status(404).json({ error: 'Order not found' });

  res.json({ success: true });
});

module.exports = router;
