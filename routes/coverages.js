const express = require('express');
const { queryAll, queryGet, queryRun } = require('../db/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();
router.use(authenticateToken);

function parsePositiveId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseNonNegativeAmount(raw, fallback = 0) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const num = Number(raw);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

router.get('/', async (req, res) => {
  try {
    const { active_only, all } = req.query;
    let query = 'SELECT * FROM coverages';
    if (active_only || (!all && all !== '1')) query += ' WHERE active = 1';
    query += ' ORDER BY nombre ASC';
    
    const coverages = await queryAll(query);
    res.json({ coverages });
  } catch (err) {
    console.error('Error al obtener coberturas:', err);
    res.status(500).json({ error: 'Error al obtener coberturas.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const coverageId = parsePositiveId(req.params.id);
    if (!coverageId) return res.status(400).json({ error: 'ID de cobertura inválido.' });

    const coverage = await queryGet('SELECT * FROM coverages WHERE id = ?', [coverageId]);
    if (!coverage) return res.status(404).json({ error: 'Cobertura no encontrada.' });
    res.json({ coverage });
  } catch (err) {
    console.error('Error al obtener cobertura:', err);
    res.status(500).json({ error: 'Error al obtener cobertura.' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { nombre, descripcion, prima, ...items } = req.body;
    const trimmedName = typeof nombre === 'string' ? nombre.trim() : '';
    if (!trimmedName) return res.status(400).json({ error: 'El nombre es obligatorio.' });

    const parsedPrima = parseNonNegativeAmount(prima, 0);
    if (parsedPrima === null) return res.status(400).json({ error: 'La prima anual debe ser un monto válido mayor o igual a 0.' });

    const cols = ['nombre', 'descripcion', 'prima'];
    const vals = [trimmedName, descripcion ? String(descripcion).trim() : null, parsedPrima];
    const placeholders = ['?', '?', '?'];

    for (let i = 1; i <= 10; i++) {
      if (items[`cob_${i}_nombre`] !== undefined) {
        cols.push(`cob_${i}_nombre`);
        const itemName = items[`cob_${i}_nombre`];
        vals.push(itemName ? String(itemName).trim() : null);
        placeholders.push('?');
      }
      if (items[`cob_${i}_monto`] !== undefined) {
        const parsedItemAmt = parseNonNegativeAmount(items[`cob_${i}_monto`], 0);
        if (parsedItemAmt === null) {
          return res.status(400).json({ error: `El monto de la cobertura ${i} debe ser mayor o igual a 0.` });
        }
        cols.push(`cob_${i}_monto`);
        vals.push(parsedItemAmt);
        placeholders.push('?');
      }
    }

    const query = `INSERT INTO coverages (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`;
    const result = await queryRun(query, vals);
    const coverage = await queryGet('SELECT * FROM coverages WHERE id = ?', [result.lastInsertRowid]);
    await logAudit({ req, action: 'CREATE', entity: 'coverage', entityId: coverage.id, details: { nombre: coverage.nombre } });
    res.status(201).json({ message: 'Cobertura creada exitosamente.', coverage });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe una cobertura con ese nombre.' });
    }
    console.error('Error al crear cobertura:', err);
    res.status(500).json({ error: 'Error al crear cobertura.' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const coverageId = parsePositiveId(req.params.id);
    if (!coverageId) return res.status(400).json({ error: 'ID de cobertura inválido.' });

    const data = req.body;
    const coverage = await queryGet('SELECT * FROM coverages WHERE id = ?', [coverageId]);
    if (!coverage) return res.status(404).json({ error: 'Cobertura no encontrada.' });

    const updates = [];
    const vals = [];

    if (data.nombre !== undefined) {
      const trimmedName = typeof data.nombre === 'string' ? data.nombre.trim() : '';
      if (!trimmedName) return res.status(400).json({ error: 'El nombre es obligatorio.' });
      updates.push('nombre = ?');
      vals.push(trimmedName);
    }
    if (data.descripcion !== undefined) {
      updates.push('descripcion = ?');
      vals.push(data.descripcion ? String(data.descripcion).trim() : null);
    }
    if (data.prima !== undefined) {
      const parsedPrima = parseNonNegativeAmount(data.prima, 0);
      if (parsedPrima === null) return res.status(400).json({ error: 'La prima anual debe ser un monto válido mayor o igual a 0.' });
      updates.push('prima = ?');
      vals.push(parsedPrima);
    }
    if (data.active !== undefined) {
      updates.push('active = ?');
      vals.push(data.active ? 1 : 0);
    }

    for (let i = 1; i <= 10; i++) {
      if (data[`cob_${i}_nombre`] !== undefined) {
        const itemName = data[`cob_${i}_nombre`];
        updates.push(`cob_${i}_nombre = ?`);
        vals.push(itemName ? String(itemName).trim() : null);
      }
      if (data[`cob_${i}_monto`] !== undefined) {
        const parsedItemAmt = parseNonNegativeAmount(data[`cob_${i}_monto`], 0);
        if (parsedItemAmt === null) {
          return res.status(400).json({ error: `El monto de la cobertura ${i} debe ser mayor o igual a 0.` });
        }
        updates.push(`cob_${i}_monto = ?`);
        vals.push(parsedItemAmt);
      }
    }

    if (updates.length > 0) {
      vals.push(coverageId);
      const query = `UPDATE coverages SET ${updates.join(', ')} WHERE id = ?`;
      await queryRun(query, vals);
    }

    const updated = await queryGet('SELECT * FROM coverages WHERE id = ?', [coverageId]);
    await logAudit({ req, action: 'UPDATE', entity: 'coverage', entityId: coverageId, details: { nombre: updated.nombre, active: updated.active } });
    res.json({ message: 'Cobertura actualizada exitosamente.', coverage: updated });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe una cobertura con ese nombre.' });
    }
    console.error('Error al actualizar cobertura:', err);
    res.status(500).json({ error: 'Error al actualizar cobertura.' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const coverageId = parsePositiveId(req.params.id);
    if (!coverageId) return res.status(400).json({ error: 'ID de cobertura inválido.' });

    const coverage = await queryGet('SELECT id, nombre FROM coverages WHERE id = ?', [coverageId]);
    if (!coverage) return res.status(404).json({ error: 'Cobertura no encontrada.' });

    const policyCheck = await queryGet('SELECT id FROM policies WHERE cobertura = ? LIMIT 1', [coverage.nombre]);
    if (policyCheck) return res.status(400).json({ error: 'No se puede eliminar la cobertura porque hay pólizas que la usan.' });

    await queryRun('DELETE FROM coverages WHERE id = ?', [coverageId]);
    await logAudit({ req, action: 'DELETE', entity: 'coverage', entityId: coverageId, details: { nombre: coverage.nombre } });
    res.json({ message: 'Cobertura eliminada exitosamente.' });
  } catch (err) {
    console.error('Error al eliminar cobertura:', err);
    res.status(500).json({ error: 'Error al eliminar cobertura.' });
  }
});

module.exports = router;