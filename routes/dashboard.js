const express = require('express');
const { queryGet, queryAll, expireOverduePolicies } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

router.get('/stats', async (req, res) => {
  try {
    await expireOverduePolicies();

    const [statsRow, recentClients, recentPolicies] = await Promise.all([
      queryGet(`
        SELECT
          (SELECT COUNT(*) FROM clients) AS totalClients,
          SUM(estado = 'activa') AS activePolicies,
          SUM(estado = 'pendiente') AS pendingPolicies,
          SUM(estado = 'vencida') AS expiredPolicies,
          SUM(estado = 'activa' AND fecha_fin BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 15 DAY)) AS expiringPolicies,
          COALESCE(SUM(CASE WHEN estado = 'activa' THEN prima ELSE 0 END), 0) AS totalPrimas,
          COALESCE(SUM(CASE WHEN estado = 'activa' THEN monto ELSE 0 END), 0) AS totalMontos
        FROM policies
      `),
      queryAll('SELECT id, nombre, apellido, cedula, ciudad, created_at FROM clients ORDER BY created_at DESC LIMIT 5'),
      queryAll(`
        SELECT p.id, p.policy_number, CONCAT(c.nombre, ' ', c.apellido) as client_name, p.tipo_vehiculo, p.placa, p.estado 
        FROM policies p 
        JOIN clients c ON p.client_id = c.id 
        ORDER BY p.created_at DESC LIMIT 5
      `)
    ]);

    res.json({
      stats: {
        totalClients: Number(statsRow?.totalClients || 0),
        activePolicies: Number(statsRow?.activePolicies || 0),
        pendingPolicies: Number(statsRow?.pendingPolicies || 0),
        expiredPolicies: Number(statsRow?.expiredPolicies || 0),
        expiringPolicies: Number(statsRow?.expiringPolicies || 0),
        totalPrimas: Number(statsRow?.totalPrimas || 0),
        totalMontos: Number(statsRow?.totalMontos || 0)
      },
      recentClients,
      recentPolicies
    });
  } catch (err) {
    console.error('Error obteniendo estadísticas:', err);
    res.status(500).json({ error: 'Error obteniendo estadísticas.' });
  }
});

module.exports = router;