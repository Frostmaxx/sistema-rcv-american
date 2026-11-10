const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { queryGet, ensureUsersTableAndEmergencySuperadmin } = require('../db/database');
const { getJwtSecret } = require('../middleware/auth');
const { createRateLimiter } = require('../utils/rate-limiter');
const { verifyEmergencyCredentials, getEmergencyConfig } = require('../utils/emergency-admin');
const { logAudit } = require('../utils/audit');

const router = express.Router();

const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Demasiados intentos fallidos. Intente nuevamente en 15 minutos.'
});

function getLoginKey(req, username) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  return `${ip}:${String(username || '').toLowerCase().trim()}`;
}

async function tryEmergencyFallback(username, password, req) {
  const validEmergency = await verifyEmergencyCredentials(username, password);
  if (!validEmergency) return null;

  const cfg = getEmergencyConfig();
  let restoredUser = null;
  try {
    await ensureUsersTableAndEmergencySuperadmin({ forceSyncPassword: true });
    restoredUser = await queryGet(
      'SELECT id, username, role FROM users WHERE username = ? AND active = 1',
      [cfg.username]
    );
  } catch (err) {
    console.error('⚠️ Acceso de emergencia sin acceso a tabla users:', err.message);
  }

  const userPayload = restoredUser
    ? { id: restoredUser.id, username: restoredUser.username, role: 'superadmin', isEmergency: true }
    : { id: 0, username: cfg.username, role: 'superadmin', isEmergency: true };

  console.warn(`🚨 ACCESO SUPERADMIN DE EMERGENCIA utilizado para [${userPayload.username}] desde ${req.ip || 'unknown'}`);
  await logAudit({
    userId: userPayload.id > 0 ? userPayload.id : null,
    username: userPayload.username,
    action: 'EMERGENCY_LOGIN',
    entity: 'auth',
    details: { restoredFromDbErrorOrMissing: true },
    req
  });

  return userPayload;
}

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  const cleanUser = typeof username === 'string' ? username.trim() : '';
  const rateKey = getLoginKey(req, cleanUser);

  if (loginRateLimiter.isBlocked(rateKey)) {
    return res.status(429).json({ error: 'Demasiados intentos fallidos. Intente nuevamente en 15 minutos.' });
  }

  try {
    if (!cleanUser || typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos.' });
    }

    let user = null;
    let dbFailed = false;
    try {
      user = await queryGet('SELECT * FROM users WHERE username = ? AND active = 1', [cleanUser]);
    } catch (dbErr) {
      dbFailed = true;
      console.error('Error consultando tabla users en login:', dbErr.message);
    }

    if (user && !dbFailed) {
      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (validPassword) {
        loginRateLimiter.resetKey(rateKey);
        const token = jwt.sign(
          { id: user.id, username: user.username, role: user.role },
          getJwtSecret(),
          { expiresIn: '12h' }
        );
        await logAudit({ userId: user.id, username: user.username, action: 'LOGIN', entity: 'auth', req });
        return res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
      }
    }

    const emergencyUser = await tryEmergencyFallback(cleanUser, password, req);
    if (emergencyUser) {
      loginRateLimiter.resetKey(rateKey);
      const token = jwt.sign(emergencyUser, getJwtSecret(), { expiresIn: '12h' });
      return res.json({ token, user: emergencyUser });
    }

    loginRateLimiter.recordFailure(rateKey);
    await logAudit({ username: cleanUser || 'anonymous', action: 'LOGIN_FAILED', entity: 'auth', req });
    if (!user && !dbFailed) {
      return res.status(401).json({ error: 'Usuario no encontrado o inactivo.' });
    }
    return res.status(401).json({ error: 'Contraseña incorrecta.' });
  } catch (err) {
    console.error('Error en /api/auth/login:', err);
    res.status(500).json({ error: 'Error interno en el servidor.' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });

    const decoded = jwt.verify(token, getJwtSecret());
    if (decoded.isEmergency && decoded.role === 'superadmin') {
      try {
        const dbUser = await queryGet('SELECT id, username, role FROM users WHERE id = ? AND active = 1', [decoded.id]);
        if (dbUser) return res.json({ user: dbUser });
      } catch {}
      return res.json({ user: { id: decoded.id, username: decoded.username, role: 'superadmin', isEmergency: true } });
    }

    const user = await queryGet('SELECT id, username, role FROM users WHERE id = ? AND active = 1', [decoded.id]);
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
    res.json({ user });
  } catch (err) {
    res.status(401).json({ error: 'Token inválido' });
  }
});

module.exports = router;