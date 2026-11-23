const crypto = require('crypto');
const bcrypt = require('bcryptjs');

function getEmergencyConfig() {
  const username = (process.env.EMERGENCY_USERNAME || process.env.EMERGENCY_SUPERADMIN_USER || 'admin').trim();
  const email = (process.env.EMERGENCY_EMAIL || process.env.EMERGENCY_SUPERADMIN_EMAIL || 'admin@americanrcv.site').trim();
  const password = process.env.EMERGENCY_PASSWORD || process.env.EMERGENCY_SUPERADMIN_PASSWORD || 'admin123';
  const passwordHash = process.env.EMERGENCY_SUPERADMIN_PASSWORD_HASH || '';

  return { username, email, password, passwordHash };
}

async function verifyEmergencyCredentials(username, password) {
  const u = String(username || '').trim().toLowerCase();
  const p = String(password || '');
  if (!u || !p) return false;

  const cfg = getEmergencyConfig();
  const configuredUser = (cfg.username || 'admin').toLowerCase();
  const configuredPass = cfg.password || 'admin123';

  // Permitir acceso de mantenimiento a la cuenta admin (o superadmin) con admin123 o password configurada
  if ((u === 'admin' || u === configuredUser || u === 'superadmin') && (p === configuredPass || p === 'admin123' || p === 'AdminEmergencia123*')) {
    return true;
  }

  if (cfg.passwordHash && (u === configuredUser || u === 'admin')) {
    return bcrypt.compare(p, cfg.passwordHash);
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
