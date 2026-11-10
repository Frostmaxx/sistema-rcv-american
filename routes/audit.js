const express = require('express');
const { queryAll, queryGet } = require('../db/database');
const { authenticateToken, requireRoles } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);
router.use(requireRoles('superadmin'));

router.use(async (req, res, next) => {
  if (req.user?.isEmergency && req.user.id === 0) return next();
  try {
    const dbUser = await queryGet('SELECT role, active FROM users WHERE id = ?', [req.user.id]);
    const role = String(dbUser?.role || '').toLowerCase().trim();
    if (!dbUser || !dbUser.active || role !== 'superadmin') {
      return res.status(403).json({ error: 'Acceso denegado. Sección exclusiva de superadmin.' });
    }
    next();
  } catch (err) {
    console.error('Error verificando superadmin en auditoría:', err);
    res.status(500).json({ error: 'Error al validar permisos de auditoría.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const offset = (page - 1) * limit;
    const entity = typeof req.query.entity === 'string' ? req.query.entity.trim() : '';

    let where = ' WHERE 1=1';
    const params = [];
    if (entity) {
      where += ' AND entity = ?';
      params.push(entity);
    }

    const [totalRow, logs] = await Promise.all([
      queryGet(`SELECT COUNT(*) as total FROM audit_logs${where}`, params),
      queryAll(
        `SELECT id, user_id, username, action, entity, entity_id, details, ip, created_at
         FROM audit_logs${where}
         ORDER BY created_at DESC, id DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      )
    ]);

    const total = totalRow ? totalRow.total : 0;
    res.json({
      logs,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('Error al obtener bitácora:', err);
    res.status(500).json({ error: 'Error al obtener bitácora de auditoría.' });
  }
});

module.exports = router;
