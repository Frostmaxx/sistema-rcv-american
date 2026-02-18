const express = require('express');
const { queryAll, queryGet, queryRun } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// Coverage item field names
const COB_FIELDS = [];
for (let i = 1; i <= 10; i++) {
  COB_FIELDS.push(`cob_${i}_nombre`, `cob_${i}_monto`);
}

// List all coverages (active only by default)
router.get('/', (req, res) => {
  try {
    const showAll = req.query.all === '1';
    const condition = showAll ? '' : 'WHERE active = 1';
    const coverages = queryAll(`SELECT * FROM coverages ${condition} ORDER BY nombre ASC`);
    res.json({ coverages });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener coberturas: ' + err.message });
  }
});

// Get single coverage
router.get('/:id', (req, res) => {
  try {
    const coverage = queryGet('SELECT * FROM coverages WHERE id = ?', [req.params.id]);
    if (!coverage) return res.status(404).json({ error: 'Cobertura no encontrada.' });
    res.json({ coverage });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener cobertura: ' + err.message });
  }
});

// Create coverage
router.post('/', (req, res) => {
  try {
    const { nombre, descripcion, prima } = req.body;

    if (!nombre) {
      return res.status(400).json({ error: 'El nombre de la cobertura es obligatorio.' });
    }

    const existing = queryGet('SELECT id FROM coverages WHERE nombre = ?', [nombre]);
    if (existing) {
      return res.status(409).json({ error: 'Ya existe una cobertura con este nombre.' });
    }

    const cobValues = [];
    for (let i = 1; i <= 10; i++) {
      cobValues.push(req.body[`cob_${i}_nombre`] || null);
      cobValues.push(Number(req.body[`cob_${i}_monto`]) || 0);
    }

    const result = queryRun(
      `INSERT INTO coverages (nombre, descripcion, prima, ${COB_FIELDS.join(', ')}) 
       VALUES (?, ?, ?, ${COB_FIELDS.map(() => '?').join(', ')})`,
      [nombre, descripcion || null, Number(prima) || 0, ...cobValues]
    );

    const coverage = queryGet('SELECT * FROM coverages WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json({ message: 'Cobertura creada exitosamente.', coverage });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear cobertura: ' + err.message });
  }
});

// Update coverage
router.put('/:id', (req, res) => {
  try {
    const coverage = queryGet('SELECT * FROM coverages WHERE id = ?', [req.params.id]);
    if (!coverage) return res.status(404).json({ error: 'Cobertura no encontrada.' });

    const { nombre, descripcion, prima, active } = req.body;

    if (nombre && nombre !== coverage.nombre) {
      const existing = queryGet('SELECT id FROM coverages WHERE nombre = ? AND id != ?', [nombre, req.params.id]);
      if (existing) return res.status(409).json({ error: 'Ya existe otra cobertura con este nombre.' });
    }

    // Build coverage item values
    const cobValues = [];
    for (let i = 1; i <= 10; i++) {
      const nKey = `cob_${i}_nombre`;
      const mKey = `cob_${i}_monto`;
      cobValues.push(req.body[nKey] !== undefined ? req.body[nKey] : coverage[nKey]);
      cobValues.push(req.body[mKey] !== undefined ? Number(req.body[mKey]) : coverage[mKey]);
    }

    queryRun(
      `UPDATE coverages SET nombre = ?, descripcion = ?, prima = ?, 
       ${COB_FIELDS.map(f => `${f} = ?`).join(', ')},
       active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [
        nombre || coverage.nombre,
        descripcion !== undefined ? descripcion : coverage.descripcion,
        prima !== undefined ? Number(prima) : coverage.prima,
        ...cobValues,
        active !== undefined ? active : coverage.active,
        req.params.id
      ]
    );

    const updated = queryGet('SELECT * FROM coverages WHERE id = ?', [req.params.id]);
    res.json({ message: 'Cobertura actualizada exitosamente.', coverage: updated });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar cobertura: ' + err.message });
  }
});

// Delete coverage
router.delete('/:id', (req, res) => {
  try {
    const coverage = queryGet('SELECT * FROM coverages WHERE id = ?', [req.params.id]);
    if (!coverage) return res.status(404).json({ error: 'Cobertura no encontrada.' });

    // Check if any policies use this coverage
    const usedBy = queryGet("SELECT COUNT(*) as count FROM policies WHERE cobertura = ?", [coverage.nombre]);
    if (usedBy && usedBy.count > 0) {
      return res.status(400).json({ error: `No se puede eliminar: ${usedBy.count} póliza(s) usan esta cobertura. Puede desactivarla en su lugar.` });
    }

    queryRun('DELETE FROM coverages WHERE id = ?', [req.params.id]);
    res.json({ message: 'Cobertura eliminada exitosamente.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar cobertura: ' + err.message });
  }
});

// Get pricing for a specific coverage
router.get('/pricing/:coverageName', (req, res) => {
  try {
    const coverage = queryGet('SELECT * FROM coverages WHERE nombre = ? AND active = 1', [req.params.coverageName]);
    if (!coverage) return res.status(404).json({ error: 'Cobertura no encontrada.' });

    // Build coverage items list
    const items = [];
    for (let i = 1; i <= 10; i++) {
      const name = coverage[`cob_${i}_nombre`];
      const monto = coverage[`cob_${i}_monto`];
      if (name) items.push({ nombre: name, monto });
    }

    const totalMonto = items.reduce((sum, item) => sum + (item.monto || 0), 0);

    res.json({ prima: coverage.prima, monto: totalMonto, items, cobertura: coverage.nombre });
  } catch (err) {
    res.status(500).json({ error: 'Error al calcular precio: ' + err.message });
  }
});

module.exports = router;
