require('dotenv').config({ path: __dirname + '/../.env' });
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { init } = require('./db');
const authRoutes = require('./routes/auth');
const menuRoutes = require('./routes/menu');
const orderRoutes = require('./routes/orders');
const restaurantRoutes = require('./routes/restaurant');
const uploadRoutes = require('./routes/upload');
const qrRoutes = require('./routes/qr');
const serverRoutes = require('./routes/server');
const v1AuthRoutes = require('./routes/v1/auth');
const v1AdminRoutes = require('./routes/v1/admin');

const app = express();
const PORT = process.env.PORT || 3000;

init();

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

app.listen(PORT, () => {
  console.log('Restaurant Platform running on http://localhost:' + PORT);
  console.log('Owner dashboard: http://localhost:' + PORT + '/');
  console.log('Customer menu (demo): http://localhost:' + PORT + '/customer/menu.html?restaurant=demo-001');
});
