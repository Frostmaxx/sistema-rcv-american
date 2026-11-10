const crypto = require('crypto');
const bcrypt = require('bcryptjs');

function getEmergencyConfig() {
  const username = (process.env.EMERGENCY_SUPERADMIN_USER || 'superadmin').trim();
  const email = (process.env.EMERGENCY_SUPERADMIN_EMAIL || 'superadmin@rcv.local').trim();
  const password = process.env.EMERGENCY_SUPERADMIN_PASSWORD || '';
  const passwordHash = process.env.EMERGENCY_SUPERADMIN_PASSWORD_HASH || '';

  return { username, email, password, passwordHash };
}

async function verifyEmergencyCredentials(username, password) {
  const cfg = getEmergencyConfig();
  if (!cfg.username || String(username || '').trim() !== cfg.username) {
    return false;
  }
  if (typeof password !== 'string' || !password) {
    return false;
  }
  if (cfg.passwordHash) {
    return bcrypt.compare(password, cfg.passwordHash);
  }
  if (cfg.password) {
    const a = Buffer.from(password, 'utf8');
    const b = Buffer.from(cfg.password, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  return false;
}

async function getEmergencyPasswordHash() {
  const cfg = getEmergencyConfig();
  if (cfg.passwordHash) return cfg.passwordHash;
  if (cfg.password) return bcrypt.hash(cfg.password, 10);
  return null;
}

module.exports = { getEmergencyConfig, verifyEmergencyCredentials, getEmergencyPasswordHash };
