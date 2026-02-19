const express = require('express');
const { queryAll, queryGet, queryRun } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// Generate policy number (persistent 8-digit numeric sequence)
function generatePolicyNumber() {
  // Use a global sequence name to keep an ever-increasing 8-digit counter
  const seqName = 'policy';

  // Get or create the global sequence
  let seq = queryGet('SELECT value FROM sequences WHERE name = ?', [seqName]);
  if (!seq) {
    // Initialize from existing policies: support both old formats (YEAR-########)
    // and existing numeric-only policy numbers. Extract the numeric portion when present.
    const maxRow = queryGet(
      `SELECT MAX(CAST(CASE WHEN INSTR(policy_number, '-')>0 THEN SUBSTR(policy_number, -8) ELSE policy_number END AS INTEGER)) as maxNum FROM policies`
    );
    const startVal = maxRow && maxRow.maxNum ? maxRow.maxNum : 0;
    queryRun('INSERT INTO sequences (name, value) VALUES (?, ?)', [seqName, startVal]);
    seq = { value: startVal };
  }

  const nextNum = seq.value + 1;
  queryRun('UPDATE sequences SET value = ? WHERE name = ?', [nextNum, seqName]);
  return String(nextNum).padStart(8, '0');
}

// Dynamic coverage pricing from DB
function getCoveragePricing(coverageName) {
  const coverage = queryGet('SELECT * FROM coverages WHERE nombre = ? AND active = 1', [coverageName]);
  if (!coverage) return { prima: 0, monto: 0 };
  const prima = coverage.prima || 0;
  let monto = 0;
  for (let i = 1; i <= 10; i++) {
    monto += coverage[`cob_${i}_monto`] || 0;
  }
  return { prima, monto };
}

// List policies
router.get('/', (req, res) => {
  try {
    const { search, estado, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = `SELECT p.*, c.nombre || ' ' || c.apellido as client_name, c.cedula as client_cedula 
                 FROM policies p JOIN clients c ON p.client_id = c.id WHERE 1=1`;
    let countQuery = `SELECT COUNT(*) as total FROM policies p JOIN clients c ON p.client_id = c.id WHERE 1=1`;
    const params = [];
    const countParams = [];

    if (estado) {
      query += ' AND p.estado = ?';
      countQuery += ' AND p.estado = ?';
      params.push(estado);
      countParams.push(estado);
    }

    if (search) {
      const searchClause = ' AND (p.policy_number LIKE ? OR p.placa LIKE ? OR c.nombre LIKE ? OR c.apellido LIKE ? OR c.cedula LIKE ?)';
      query += searchClause;
      countQuery += searchClause;
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
      countParams.push(s, s, s, s, s);
    }

    const totalRow = queryGet(countQuery, countParams);
    const total = totalRow ? totalRow.total : 0;

    query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    const policies = queryAll(query, params);

    res.json({
      policies,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener pólizas: ' + err.message });
  }
});

// Get single policy
router.get('/:id', (req, res) => {
  try {
    if (req.params.id === 'config') return res.status(400).json({ error: 'Use /config/pricing' });
    const policy = queryGet(
      `SELECT p.*, c.nombre || ' ' || c.apellido as client_name, c.cedula as client_cedula, c.telefono as client_telefono, c.email as client_email
       FROM policies p JOIN clients c ON p.client_id = c.id WHERE p.id = ?`,
      [req.params.id]
    );

    if (!policy) return res.status(404).json({ error: 'Póliza no encontrada.' });
    res.json({ policy });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener póliza: ' + err.message });
  }
});

// Create policy
router.post('/', (req, res) => {
  try {
    const { client_id, tipo_vehiculo, placa, marca, modelo, anio, color, serial_carroceria, cobertura, fecha_inicio, fecha_fin, notas } = req.body;

    if (!client_id || !tipo_vehiculo || !placa || !marca || !modelo || !anio || !cobertura || !fecha_inicio || !fecha_fin) {
      return res.status(400).json({ error: 'Todos los campos obligatorios deben ser completados.' });
    }

    const client = queryGet('SELECT id FROM clients WHERE id = ? AND active = 1', [client_id]);
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado.' });

    const policy_number = generatePolicyNumber();
    const { prima, monto } = getCoveragePricing(cobertura);

    const result = queryRun(
      `INSERT INTO policies (policy_number, client_id, tipo_vehiculo, placa, marca, modelo, anio, color, serial_carroceria, cobertura, monto, prima, fecha_inicio, fecha_fin, estado, notas, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activa', ?, ?)`,
      [policy_number, client_id, tipo_vehiculo, placa.toUpperCase(), marca, modelo, anio, color || null, serial_carroceria || null, cobertura, monto, prima, fecha_inicio, fecha_fin, notas || null, req.user.id]
    );

    const policy = queryGet('SELECT * FROM policies WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json({ message: 'Póliza creada exitosamente.', policy });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear póliza: ' + err.message });
  }
});

// Update policy
router.put('/:id', (req, res) => {
  try {
    const policy = queryGet('SELECT * FROM policies WHERE id = ?', [req.params.id]);
    if (!policy) return res.status(404).json({ error: 'Póliza no encontrada.' });

    const { estado, notas, cobertura, fecha_fin } = req.body;

    // Recalculate pricing if coverage changes
    let newPrima = policy.prima;
    let newMonto = policy.monto;
    if (cobertura && cobertura !== policy.cobertura) {
      const pricing = getCoveragePricing(cobertura);
      if (pricing.prima > 0) {
        newPrima = pricing.prima;
        newMonto = pricing.monto;
      }
    }

    queryRun(
      'UPDATE policies SET estado = ?, notas = ?, cobertura = ?, fecha_fin = ?, prima = ?, monto = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [
        estado || policy.estado,
        notas !== undefined ? notas : policy.notas,
        cobertura || policy.cobertura,
        fecha_fin || policy.fecha_fin,
        newPrima,
        newMonto,
        req.params.id
      ]
    );

    const updated = queryGet(
      `SELECT p.*, c.nombre || ' ' || c.apellido as client_name FROM policies p JOIN clients c ON p.client_id = c.id WHERE p.id = ?`,
      [req.params.id]
    );
    res.json({ message: 'Póliza actualizada exitosamente.', policy: updated });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar póliza: ' + err.message });
  }
});

// Renew policy — reset dates and recalculate pricing
router.post('/:id/renew', (req, res) => {
  try {
    const policy = queryGet(
      `SELECT p.*, c.nombre || ' ' || c.apellido as client_name FROM policies p JOIN clients c ON p.client_id = c.id WHERE p.id = ?`,
      [req.params.id]
    );
    if (!policy) return res.status(404).json({ error: 'Póliza no encontrada.' });

    // New dates: today → today + 1 year
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    const fecha_inicio = today.toISOString().split('T')[0];
    const fecha_fin = nextYear.toISOString().split('T')[0];

    // Recalculate pricing from current coverage rates
    const { prima, monto } = getCoveragePricing(policy.cobertura);

    queryRun(
      `UPDATE policies SET fecha_inicio = ?, fecha_fin = ?, prima = ?, monto = ?, estado = 'activa', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [fecha_inicio, fecha_fin, prima || policy.prima, monto || policy.monto, req.params.id]
    );

    const updated = queryGet(
      `SELECT p.*, c.nombre || ' ' || c.apellido as client_name, c.cedula as client_cedula FROM policies p JOIN clients c ON p.client_id = c.id WHERE p.id = ?`,
      [req.params.id]
    );
    res.json({ message: 'Póliza renovada exitosamente.', policy: updated });
  } catch (err) {
    res.status(500).json({ error: 'Error al renovar póliza: ' + err.message });
  }
});

// Delete policy
router.delete('/:id', (req, res) => {
  try {
    const policy = queryGet('SELECT * FROM policies WHERE id = ?', [req.params.id]);
    if (!policy) return res.status(404).json({ error: 'Póliza no encontrada.' });

    queryRun('DELETE FROM policies WHERE id = ?', [req.params.id]);
    res.json({ message: 'Póliza eliminada exitosamente.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar póliza: ' + err.message });
  }
});

// Get all active coverages with pricing
router.get('/config/pricing', (req, res) => {
  try {
    const coverages = queryAll('SELECT * FROM coverages WHERE active = 1 ORDER BY nombre ASC');
    const pricing = {};
    coverages.forEach(c => {
      let totalMonto = 0;
      const items = [];
      for (let i = 1; i <= 10; i++) {
        const name = c[`cob_${i}_nombre`];
        const monto = c[`cob_${i}_monto`] || 0;
        if (name) { items.push({ nombre: name, monto }); totalMonto += monto; }
      }
      pricing[c.nombre] = {
        prima: c.prima,
        monto: totalMonto,
        descripcion: c.descripcion,
        items
      };
    });
    res.json({ pricing });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener precios: ' + err.message });
  }
});

module.exports = router;
