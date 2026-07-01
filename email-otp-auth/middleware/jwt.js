const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  console.error('[JWT] FATAL: JWT_SECRET not set in environment');
  process.exit(1);
}

function sign(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '24h' });
}

function verify(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    req.user = jwt.verify(header.split(' ')[1], SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { sign, verify };
