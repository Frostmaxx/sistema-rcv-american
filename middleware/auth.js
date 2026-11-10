const crypto = require('crypto');
const jwt = require('jsonwebtoken');

let fallbackJwtSecret = null;

function getJwtSecret() {
  const configured = process.env.JWT_SECRET && process.env.JWT_SECRET.trim();
  if (configured && configured !== 'secret') {
    return configured;
  }
  if (!fallbackJwtSecret) {
    fallbackJwtSecret = crypto.randomBytes(32).toString('hex');
    console.warn(
      '⚠️  JWT_SECRET no está configurado (o usa el valor inseguro por defecto). Se generó un secreto temporal para esta ejecución.'
    );
  }
  return fallbackJwtSecret;
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Acceso denegado, token faltante.' });

  jwt.verify(token, getJwtSecret(), (err, user) => {
    if (err) return res.status(401).json({ error: 'Token inválido o expirado.' });
    req.user = user;
    next();
  });
}

function requireRoles(...roles) {
  const allowed = roles.map(r => String(r).toLowerCase().trim());
  return (req, res, next) => {
    const userRole = req.user && String(req.user.role || '').toLowerCase().trim();
    if (userRole && allowed.includes(userRole)) {
      return next();
    }
    return res.status(403).json({ error: 'Acceso denegado. No tienes permisos suficientes.' });
  };
}

const requireAdmin = requireRoles('superadmin', 'admin');
const canManageUsers = requireAdmin;

module.exports = { authenticateToken, canManageUsers, requireAdmin, requireRoles, getJwtSecret };