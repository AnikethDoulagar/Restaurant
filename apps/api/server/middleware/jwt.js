const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'restaurant-platform-jwt-secret-change-in-production';
if (!process.env.JWT_SECRET) {
  console.warn('[JWT] WARNING: Using default JWT_SECRET. Set JWT_SECRET in .env for production.');
}
const JWT_EXPIRES = '24h';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function requireJwt(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.jwt = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireSuperAdmin(req, res, next) {
  if (req.jwt && req.jwt.role === 'super_admin') {
    return next();
  }
  return res.status(403).json({ error: 'Forbidden: super admin access required' });
}

function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch (e) { return null; }
}

module.exports = { signToken, requireJwt, requireSuperAdmin, verifyToken, JWT_SECRET };
