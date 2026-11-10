const express = require('express');
const { queryAll, queryGet, queryRun, withTransaction, expireOverduePolicies } = require('../db/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { extractCoverageItems, getCoverageDetailsByName } = require('../utils/coverages');
const { signPolicyVerification } = require('../utils/qr-signature');
const { logAudit } = require('../utils/audit');

const ALLOWED_POLICY_STATUSES = ['activa', 'pendiente', 'vencida', 'cancelada'];

function csvCell(val) {
  let str = val === null || val === undefined ? '' : String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

function buildPolicyFilters({ estado, search, expiring }) {
  let where = ' WHERE 1=1';
  const params = [];

  if (estado && ALLOWED_POLICY_STATUSES.includes(String(estado).toLowerCase().trim())) {
    where += ' AND p.estado = ?';
    params.push(String(estado).toLowerCase().trim());
  }

  if (expiring === '1' || expiring === 'true') {
    where += " AND p.estado = 'activa' AND p.fecha_fin BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 15 DAY)";
  }

  if (search) {
    where += ' AND (p.policy_number LIKE ? OR p.placa LIKE ? OR c.nombre LIKE ? OR c.apellido LIKE ? OR c.cedula LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s, s);
  }

  return { where, params };
}

const router = express.Router();
router.use(authenticateToken);

async function getCoveragePricing(coverageName, db = { queryGet }) {
  return getCoverageDetailsByName(coverageName, db, { activeOnly: true });
}

async function generatePolicyNumber(tx) {
  const seqName = 'policy';
  let seq = await tx.queryGet('SELECT value FROM sequences WHERE name = ? FOR UPDATE', [seqName]);

  if (!seq) {
    const maxRow = await tx.queryGet(`SELECT MAX(CAST(RIGHT(policy_number, 8) AS UNSIGNED)) as maxNum FROM policies`);
    const startVal = maxRow && maxRow.maxNum ? maxRow.maxNum : 0;
    await tx.queryRun('INSERT INTO sequences (name, value) VALUES (?, ?)', [seqName, startVal]);
    seq = { value: startVal };
  }

  const nextNum = seq.value + 1;
  await tx.queryRun('UPDATE sequences SET value = ? WHERE name = ?', [nextNum, seqName]);
  return String(nextNum).padStart(8, '0');
}

router.get('/config/pricing', async (req, res) => {
  try {
    const coverages = await queryAll('SELECT * FROM coverages WHERE active = 1 ORDER BY nombre ASC');
    const pricing = {};
    coverages.forEach(c => {
      const { items, totalMonto } = extractCoverageItems(c);
      pricing[c.nombre] = { prima: c.prima, monto: totalMonto, descripcion: c.descripcion, items };
    });
    res.json({ pricing });
  } catch (err) {
    console.error('Error al obtener precios:', err);
    res.status(500).json({ error: 'Error al obtener precios.' });
  }
});

router.get('/export', async (req, res) => {
  try {
    await expireOverduePolicies();
    const { where, params } = buildPolicyFilters(req.query);

    const rows = await queryAll(
      `SELECT p.policy_number, c.cedula AS client_cedula, CONCAT(c.nombre, ' ', c.apellido) AS client_name,
              c.telefono AS client_telefono, p.tipo_vehiculo, p.marca, p.modelo, p.anio, p.placa,
              p.cobertura, p.prima, p.monto, p.fecha_inicio, p.fecha_fin, p.estado
       FROM policies p JOIN clients c ON p.client_id = c.id${where}
       ORDER BY p.created_at DESC
       LIMIT 5000`,
      params
    );

    const headers = [
      'Nro Poliza', 'Documento ID', 'Cliente', 'Telefono', 'Tipo Vehiculo',
      'Marca', 'Modelo', 'Anio', 'Placa', 'Cobertura', 'Prima EUR', 'Monto EUR',
      'Fecha Inicio', 'Fecha Fin', 'Estado'
    ];
    const lines = [headers.map(csvCell).join(',')];
    for (const r of rows) {
      lines.push([
        r.policy_number,
        r.client_cedula,
        r.client_name,
        r.client_telefono || '',
        r.tipo_vehiculo,
        r.marca,
        r.modelo,
        r.anio,
        r.placa,
        r.cobertura,
        r.prima,
        r.monto,
        r.fecha_inicio instanceof Date ? r.fecha_inicio.toISOString().slice(0, 10) : String(r.fecha_inicio || '').slice(0, 10),
        r.fecha_fin instanceof Date ? r.fecha_fin.toISOString().slice(0, 10) : String(r.fecha_fin || '').slice(0, 10),
        r.estado
      ].map(csvCell).join(','));
    }

    await logAudit({ req, action: 'EXPORT_CSV', entity: 'policy', details: { count: rows.length } });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="polizas_rcv_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send('\uFEFF' + lines.join('\r\n'));
  } catch (err) {
    console.error('Error al exportar pólizas:', err);
    res.status(500).json({ error: 'Error al exportar pólizas.' });
  }
});

router.get('/', async (req, res) => {
  try {
    await expireOverduePolicies();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const { where, params } = buildPolicyFilters(req.query);
    const baseFrom = 'FROM policies p JOIN clients c ON p.client_id = c.id';
    const query = `SELECT p.id, p.policy_number, p.client_id, p.tipo_vehiculo, p.placa, p.marca, p.modelo,
                          p.cobertura, p.prima, p.fecha_fin, p.estado, p.created_at,
                          CONCAT(c.nombre, ' ', c.apellido) as client_name, c.cedula as client_cedula 
                   ${baseFrom}${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;
    const countQuery = `SELECT COUNT(*) as total ${baseFrom}${where}`;

    const [totalRow, policies] = await Promise.all([
      queryGet(countQuery, params),
      queryAll(query, [...params, limit, offset])
    ]);
    const total = totalRow ? totalRow.total : 0;

    res.json({
      policies,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('Error al obtener pólizas:', err);
    res.status(500).json({ error: 'Error al obtener pólizas.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const policyId = Number(req.params.id);
    if (!Number.isInteger(policyId) || policyId <= 0) {
      return res.status(400).json({ error: 'ID de póliza inválido.' });
    }

    const policy = await queryGet(
      `SELECT p.*, CONCAT(c.nombre, ' ', c.apellido) as client_name, c.cedula as client_cedula, c.telefono as client_telefono, c.email as client_email, c.direccion as client_direccion
       FROM policies p JOIN clients c ON p.client_id = c.id WHERE p.id = ?`,
      [policyId]
    );

    if (!policy) return res.status(404).json({ error: 'Póliza no encontrada.' });
    const coverageDetails = await getCoverageDetailsByName(policy.cobertura, { queryGet }, { activeOnly: false });
    policy.garantias = coverageDetails.items;
    policy.qr_sig = signPolicyVerification(policy.policy_number);
    res.set('Cache-Control', 'no-store');
    res.json({ policy });
  } catch (err) {
    console.error('Error al obtener póliza:', err);
    res.status(500).json({ error: 'Error al obtener póliza.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { client_id, tipo_vehiculo, placa, marca, modelo, anio, color, serial_carroceria, serial_motor, cobertura, fecha_inicio, fecha_fin, notas } = req.body;

    if (!client_id || !tipo_vehiculo || !placa || !marca || !modelo || !anio || !cobertura || !fecha_inicio || !fecha_fin) {
      return res.status(400).json({ error: 'Todos los campos obligatorios deben ser completados.' });
    }

    const client = await queryGet('SELECT id FROM clients WHERE id = ? AND active = 1', [client_id]);
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado.' });

    const createdBy = req.user && req.user.id > 0 ? req.user.id : null;
    const policy = await withTransaction(async (tx) => {
      const policy_number = await generatePolicyNumber(tx);
      const { prima, monto } = await getCoveragePricing(cobertura, tx);

      const result = await tx.queryRun(
        `INSERT INTO policies (policy_number, client_id, tipo_vehiculo, placa, marca, modelo, anio, color, serial_carroceria, serial_motor, cobertura, monto, prima, fecha_inicio, fecha_fin, estado, notas, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activa', ?, ?)`,
        [policy_number, client_id, tipo_vehiculo, String(placa).toUpperCase(), marca, modelo, anio, color || null, serial_carroceria || null, serial_motor || null, cobertura, monto, prima, fecha_inicio, fecha_fin, notas || null, createdBy]
      );

      return tx.queryGet('SELECT * FROM policies WHERE id = ?', [result.lastInsertRowid]);
    });

    await logAudit({ req, action: 'CREATE', entity: 'policy', entityId: policy.id, details: { policy_number: policy.policy_number, placa: policy.placa } });
    res.status(201).json({ message: 'Póliza creada exitosamente.', policy });
  } catch (err) {
    console.error('Error al crear póliza:', err);
    res.status(500).json({ error: 'Error al crear póliza.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const policyId = Number(req.params.id);
    if (!Number.isInteger(policyId) || policyId <= 0) {
      return res.status(400).json({ error: 'ID de póliza inválido.' });
    }

    const policy = await queryGet('SELECT * FROM policies WHERE id = ?', [policyId]);
    if (!policy) return res.status(404).json({ error: 'Póliza no encontrada.' });

    const { estado, notas, cobertura, fecha_inicio, fecha_fin, placa, marca, modelo, anio, color, serial_carroceria, serial_motor } = req.body;

    let newPrima = policy.prima;
    let newMonto = policy.monto;
    if (cobertura && cobertura !== policy.cobertura) {
      const pricing = await getCoveragePricing(cobertura);
      if (pricing.found) {
        newPrima = pricing.prima;
        newMonto = pricing.monto;
      }
    }

    await queryRun(
      `UPDATE policies SET 
        estado = ?, notas = ?, cobertura = ?, fecha_inicio = ?, fecha_fin = ?, prima = ?, monto = ?,
        placa = ?, marca = ?, modelo = ?, anio = ?, color = ?, serial_carroceria = ?, serial_motor = ?
      WHERE id = ?`,
      [
        estado || policy.estado, notas !== undefined ? notas : policy.notas, cobertura || policy.cobertura,
        fecha_inicio || policy.fecha_inicio, fecha_fin || policy.fecha_fin,
        newPrima, newMonto, placa ? String(placa).toUpperCase() : policy.placa, marca || policy.marca, modelo || policy.modelo,
        anio || policy.anio, color !== undefined ? color : policy.color,
        serial_carroceria !== undefined ? serial_carroceria : policy.serial_carroceria,
        serial_motor !== undefined ? serial_motor : policy.serial_motor, policyId
      ]
    );

    const updated = await queryGet(
      `SELECT p.*, CONCAT(c.nombre, ' ', c.apellido) as client_name FROM policies p JOIN clients c ON p.client_id = c.id WHERE p.id = ?`,
      [policyId]
    );
    await logAudit({ req, action: 'UPDATE', entity: 'policy', entityId: policyId, details: { policy_number: updated.policy_number, estado: updated.estado } });
    res.json({ message: 'Póliza actualizada exitosamente.', policy: updated });
  } catch (err) {
    console.error('Error al actualizar póliza:', err);
    res.status(500).json({ error: 'Error al actualizar póliza.' });
  }
});

router.patch('/:id/status', requireAdmin, async (req, res) => {
  try {
    const policyId = Number(req.params.id);
    if (!Number.isInteger(policyId) || policyId <= 0) {
      return res.status(400).json({ error: 'ID de póliza inválido.' });
    }
    const nextStatus = String(req.body?.estado || '').toLowerCase().trim();
    if (!ALLOWED_POLICY_STATUSES.includes(nextStatus)) {
      return res.status(400).json({ error: 'Estado de póliza inválido.' });
    }
    const policy = await queryGet('SELECT id, policy_number, estado FROM policies WHERE id = ?', [policyId]);
    if (!policy) return res.status(404).json({ error: 'Póliza no encontrada.' });

    await queryRun('UPDATE policies SET estado = ? WHERE id = ?', [nextStatus, policyId]);
    await logAudit({ req, action: 'STATUS_CHANGE', entity: 'policy', entityId: policyId, details: { from: policy.estado, to: nextStatus } });
    res.json({ message: 'Estado de póliza actualizado.', estado: nextStatus });
  } catch (err) {
    console.error('Error al cambiar estado de póliza:', err);
    res.status(500).json({ error: 'Error al cambiar estado de póliza.' });
  }
});

router.post('/:id/renew', async (req, res) => {
  try {
    const policyId = Number(req.params.id);
    if (!Number.isInteger(policyId) || policyId <= 0) {
      return res.status(400).json({ error: 'ID de póliza inválido.' });
    }

    const policy = await queryGet(`SELECT p.*, CONCAT(c.nombre, ' ', c.apellido) as client_name FROM policies p JOIN clients c ON p.client_id = c.id WHERE p.id = ?`, [policyId]);
    if (!policy) return res.status(404).json({ error: 'Póliza no encontrada.' });

    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    const fecha_inicio = today.toISOString().split('T')[0];
    const fecha_fin = nextYear.toISOString().split('T')[0];

    const pricing = await getCoveragePricing(policy.cobertura);

    await queryRun(
      `UPDATE policies SET fecha_inicio = ?, fecha_fin = ?, prima = ?, monto = ?, estado = 'activa' WHERE id = ?`,
      [fecha_inicio, fecha_fin, pricing.found ? pricing.prima : policy.prima, pricing.found ? pricing.monto : policy.monto, policyId]
    );

    const updated = await queryGet(`SELECT p.*, CONCAT(c.nombre, ' ', c.apellido) as client_name, c.cedula as client_cedula FROM policies p JOIN clients c ON p.client_id = c.id WHERE p.id = ?`, [policyId]);
    await logAudit({ req, action: 'RENEW', entity: 'policy', entityId: policyId, details: { policy_number: updated.policy_number } });
    res.json({ message: 'Póliza renovada exitosamente.', policy: updated });
  } catch (err) {
    console.error('Error al renovar póliza:', err);
    res.status(500).json({ error: 'Error al renovar póliza.' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const policyId = Number(req.params.id);
    if (!Number.isInteger(policyId) || policyId <= 0) {
      return res.status(400).json({ error: 'ID de póliza inválido.' });
    }

    const policy = await queryGet('SELECT * FROM policies WHERE id = ?', [policyId]);
    if (!policy) return res.status(404).json({ error: 'Póliza no encontrada.' });

    await queryRun('DELETE FROM policies WHERE id = ?', [policyId]);
    await logAudit({ req, action: 'DELETE', entity: 'policy', entityId: policyId, details: { policy_number: policy.policy_number } });
    res.json({ message: 'Póliza eliminada exitosamente.' });
  } catch (err) {
    console.error('Error al eliminar póliza:', err);
    res.status(500).json({ error: 'Error al eliminar póliza.' });
  }
});

module.exports = router;
