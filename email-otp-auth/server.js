require('dotenv').config();

const express = require('express');
const authRoutes = require('./routes/auth');

if (!process.env.JWT_SECRET) {
  console.error('[SERVER] FATAL: JWT_SECRET must be set in .env');
  process.exit(1);
}
if (!process.env.BREVO_API_KEY) {
  console.warn('[SERVER] WARNING: BREVO_API_KEY not set — emails will be logged to console only');
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use('/api/auth', authRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log('[SERVER] Email OTP Auth running on http://localhost:' + PORT);
  console.log('[SERVER] Endpoints:');
  console.log('  POST /api/auth/signup     — Create account + send OTP');
  console.log('  POST /api/auth/verify-otp — Verify OTP + get JWT');
  console.log('  POST /api/auth/resend-otp — Resend OTP (60s cooldown)');
  console.log('  POST /api/auth/login      — Login (blocks unverified)');
});
