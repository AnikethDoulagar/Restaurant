const { db } = require('./db');

const SEQ_KEY = 'kot_sequence';

function nextSeq() {
  const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get(SEQ_KEY);
  const val = row ? row.value + 1 : 1;
  db.prepare(
    'INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
  ).run(SEQ_KEY, val, val);
  return val;
}

function genTicket() {
  const d = new Date();
  const dat = [
    String(d.getDate()).padStart(2, '0'),
    String(d.getMonth() + 1).padStart(2, '0'),
    d.getFullYear().toString().slice(-2)
  ].join('');
  return 'KOT-' + dat + '-' + String(nextSeq()).padStart(3, '0');
}

function bar(c) { return c.repeat(42); }

function generateKOT(order) {
  const ticket = genTicket();
  const date = new Date(order.created_at).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  const items = order.items || [];
  const total = order.total || 0;
  const L = bar('=');
  const D = bar('-');
  const p = [];

  p.push(L);
  p.push('            KITCHEN ORDER TICKET');
  p.push(L);
  p.push('');
  p.push('  Ticket: ' + ticket);
  p.push('  Date:   ' + date);
  p.push('  Order:  #' + order.id);
  p.push('  Table:  ' + (order.table_number ? 'Table ' + order.table_number : 'Takeaway'));
  p.push('  Server: ' + (order.customer_name || 'Guest'));
  p.push('');
  p.push(D);
  p.push('  ITEM                 QTY   AMT');
  p.push(D);

  for (const i of items) {
    const name = i.name && i.name.length > 20 ? i.name.slice(0, 20) : (i.name || '');
    const amt = (i.price * (i.quantity || 1)).toFixed(2);
    const q = String(i.quantity || 1);
    p.push('  ' + name.padEnd(20) + q.padStart(3) + '  Rs ' + amt.padStart(7));
  }

  p.push(D);
  p.push('  TOTAL:      Rs ' + total.toFixed(2));
  p.push(L);
  p.push('');

  const content = p.join('\n');

  db.prepare(
    'INSERT INTO kot_history (ticket_number, order_id, restaurant_id, content) VALUES (?, ?, ?, ?)'
  ).run(ticket, order.id, order.restaurant_id, content);

  return { ticketNumber: ticket, content };
}

function getKOTsForRestaurant(restaurantId) {
  return db.prepare(
    'SELECT * FROM kot_history WHERE restaurant_id = ? ORDER BY printed_at DESC'
  ).all(restaurantId);
}

module.exports = { generateKOT, getKOTsForRestaurant };
