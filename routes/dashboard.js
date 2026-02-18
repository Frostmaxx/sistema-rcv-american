const express = require('express');
const { queryAll, queryGet } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

router.get('/stats', (req, res) => {
  try {
    const totalClients = queryGet('SELECT COUNT(*) as count FROM clients WHERE active = 1')?.count || 0;
    const totalPolicies = queryGet('SELECT COUNT(*) as count FROM policies')?.count || 0;
    const activePolicies = queryGet("SELECT COUNT(*) as count FROM policies WHERE estado = 'activa'")?.count || 0;
    const pendingPolicies = queryGet("SELECT COUNT(*) as count FROM policies WHERE estado = 'pendiente'")?.count || 0;
    const expiredPolicies = queryGet("SELECT COUNT(*) as count FROM policies WHERE estado = 'vencida'")?.count || 0;
    const totalUsers = queryGet('SELECT COUNT(*) as count FROM users WHERE active = 1')?.count || 0;

    const totalPrimas = queryGet("SELECT COALESCE(SUM(prima), 0) as total FROM policies WHERE estado = 'activa'")?.total || 0;
    const totalMontos = queryGet("SELECT COALESCE(SUM(monto), 0) as total FROM policies WHERE estado = 'activa'")?.total || 0;

    const recentClients = queryAll('SELECT * FROM clients WHERE active = 1 ORDER BY created_at DESC LIMIT 5');
    const recentPolicies = queryAll(
      `SELECT p.*, c.nombre || ' ' || c.apellido as client_name 
       FROM policies p JOIN clients c ON p.client_id = c.id 
       ORDER BY p.created_at DESC LIMIT 5`
    );

    const byCoverage = queryAll(
      `SELECT cobertura, COUNT(*) as count, SUM(prima) as total_primas 
       FROM policies WHERE estado = 'activa' GROUP BY cobertura`
    );

    const byVehicle = queryAll(
      `SELECT tipo_vehiculo, COUNT(*) as count 
       FROM policies WHERE estado = 'activa' GROUP BY tipo_vehiculo`
    );

    res.json({
      stats: {
        totalClients, totalPolicies, activePolicies, pendingPolicies,
        expiredPolicies, totalUsers, totalPrimas, totalMontos
      },
      recentClients,
      recentPolicies,
      byCoverage,
      byVehicle
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener estadísticas: ' + err.message });
  }
});

module.exports = router;
