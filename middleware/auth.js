const jwt = require('jsonwebtoken');

// 1. Verificador de Sesión General (Para todo el sistema)
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Acceso denegado, token faltante.' });

  jwt.verify(token, process.env.JWT_SECRET || 'secret', (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido o expirado.' });
    req.user = user; // Inyectamos la info del usuario en la petición
    next();
  });
}

// 2. Verificador de Privilegios Altos (Para crear/borrar usuarios)
function requireSuperAdmin(req, res, next) {
  if (req.user && req.user.role === 'superadmin') {
    next(); // Tiene permisos, lo dejamos pasar a la ruta
  } else {
    res.status(403).json({ error: 'Acceso denegado. Esta acción está reservada para el nivel Super Admin.' });
  }
}

module.exports = { authenticateToken, requireSuperAdmin };