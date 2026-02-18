const jwt = require('jsonwebtoken');
const { queryGet } = require('../db/database');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Acceso no autorizado. Token requerido.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = queryGet('SELECT id, username, email, role, active FROM users WHERE id = ?', [decoded.userId]);
    
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Usuario no encontrado o desactivado.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido o expirado.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No tiene permisos para esta acción.' });
    }
    next();
  };
}

module.exports = { authenticateToken, requireRole };
