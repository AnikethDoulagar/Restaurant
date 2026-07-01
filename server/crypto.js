const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY = crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY || 'restaurant-platform-default-key-change-in-production').digest();

function encrypt(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return iv.toString('hex') + ':' + authTag + ':' + encrypted;
}

function decrypt(encoded) {
  if (!encoded || !encoded.includes(':')) return encoded;
  const parts = encoded.split(':');
  if (parts.length !== 3) return encoded;
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return encoded;
  }
}

module.exports = { encrypt, decrypt };