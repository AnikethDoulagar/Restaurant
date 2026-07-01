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

const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many signup attempts, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many verification attempts, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/signup', signupLimiter);
app.use('/api/v1/auth/verify-otp', otpLimiter);
app.use('/api/v1/auth/verify-code', otpLimiter);
app.use('/api/v1/auth/resend-otp', signupLimiter);
app.use('/api/v1/auth/register', signupLimiter);
app.use('/api/v1/auth/verify-and-login', otpLimiter);
app.use('/api/v1/auth/send-code', signupLimiter);
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
}

app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads')));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log('API server running on http://localhost:' + PORT);
});
