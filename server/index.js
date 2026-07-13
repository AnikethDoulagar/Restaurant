require('dotenv').config({ path: __dirname + '/../.env' });
const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { init, db } = require('./db');
const authRoutes = require('./routes/auth');
const menuRoutes = require('./routes/menu');
const orderRoutes = require('./routes/orders');
const restaurantRoutes = require('./routes/restaurant');
const uploadRoutes = require('./routes/upload');
const qrRoutes = require('./routes/qr');
const serverRoutes = require('./routes/server');
const v1AuthRoutes = require('./routes/v1/auth');
const v1AdminRoutes = require('./routes/v1/admin');
const v1SidebarRoutes = require('./routes/v1/sidebar');
const { generateKOT, getKOTsForRestaurant } = require('./kot');
const { requireJwt } = require('./middleware/jwt');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;

init();

// Make io accessible to routes
app.set('io', io);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/admin/login', authLimiter);
app.use('/api/auth/login', authLimiter);

app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/restaurant', restaurantRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/server', serverRoutes);
app.use('/api/v1/auth', v1AuthRoutes);
app.use('/api/v1/admin', v1AdminRoutes);
app.use('/api/v1/sidebar', v1SidebarRoutes);

// KOT API
app.get('/api/kot/:orderId', requireJwt, (req, res) => {
  try {
    const order = db.prepare(
      'SELECT * FROM orders WHERE id = ? AND restaurant_id = ?'
    ).get(req.params.orderId, req.jwt.restaurantId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const items = db.prepare(
      'SELECT * FROM order_items WHERE order_id = ?'
    ).all(order.id);

    const kot = generateKOT({ ...order, items });
    res.json(kot);
  } catch (e) {
    res.status(500).json({ error: 'KOT generation failed' });
  }
});

app.get('/api/kot/history/:restaurantId', requireJwt, (req, res) => {
  try {
    const kots = getKOTsForRestaurant(req.jwt.restaurantId);
    res.json(kots);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch KOT history' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

const adminSecretPath = process.env.ADMIN_SECRET_PATH || null;
if (adminSecretPath) {
  app.get('/' + adminSecretPath, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'private', 'admin.html'));
  });
  console.log('Admin panel: http://localhost:' + PORT + '/' + adminSecretPath);
} else {
  console.log('Admin panel: not exposed (set ADMIN_SECRET_PATH in .env to enable)');
}

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'owner', 'index.html'));
});

server.listen(PORT, () => {
  console.log('Restaurant Platform running on http://localhost:' + PORT);
  console.log('Owner dashboard: http://localhost:' + PORT + '/');
  console.log('Customer menu (demo): http://localhost:' + PORT + '/customer/menu.html?restaurant=demo-001');
});
