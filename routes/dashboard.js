const express = require('express');
const { queryGet, queryAll } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

router.get('/stats', async (req, res) => {
  try {
    const clientsCount = await queryGet('SELECT COUNT(*) as count FROM clients');
    const activePolicies = await queryGet("SELECT COUNT(*) as count FROM policies WHERE estado = 'activa'");
    const pendingPolicies = await queryGet("SELECT COUNT(*) as count FROM policies WHERE estado = 'pendiente'");
    const expiredPolicies = await queryGet("SELECT COUNT(*) as count FROM policies WHERE estado = 'vencida'");
    
    const sumPrimasRow = await queryGet('SELECT SUM(prima) as total FROM policies');
    const sumMontosRow = await queryGet('SELECT SUM(monto) as total FROM policies');
    const totalPrimas = sumPrimasRow && sumPrimasRow.total ? sumPrimasRow.total : 0;
    const totalMontos = sumMontosRow && sumMontosRow.total ? sumMontosRow.total : 0;

    const recentClients = await queryAll('SELECT id, nombre, apellido, cedula, ciudad, created_at FROM clients ORDER BY created_at DESC LIMIT 5');
    
    // Usamos CONCAT para unir nombre y apellido en MySQL
    const recentPolicies = await queryAll(`
      SELECT p.id, p.policy_number, CONCAT(c.nombre, ' ', c.apellido) as client_name, p.tipo_vehiculo, p.placa, p.estado 
      FROM policies p 
      JOIN clients c ON p.client_id = c.id 
      ORDER BY p.created_at DESC LIMIT 5
    `);

    res.json({
      stats: {
        totalClients: clientsCount ? clientsCount.count : 0,
        activePolicies: activePolicies ? activePolicies.count : 0,
        pendingPolicies: pendingPolicies ? pendingPolicies.count : 0,
        expiredPolicies: expiredPolicies ? expiredPolicies.count : 0,
        totalPrimas,
        totalMontos
      },
      recentClients,
      recentPolicies
    });
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo estadísticas: ' + err.message });
  }
});

module.exports = router;