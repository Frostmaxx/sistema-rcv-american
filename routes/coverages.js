const express = require('express');
const { queryAll, queryGet, queryRun } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const { active_only, all } = req.query;
    let query = 'SELECT * FROM coverages';
    if (active_only || (!all && all !== '1')) query += ' WHERE active = 1';
    query += ' ORDER BY nombre ASC';
    
    const coverages = await queryAll(query);
    res.json({ coverages });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener coberturas: ' + err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const coverage = await queryGet('SELECT * FROM coverages WHERE id = ?', [req.params.id]);
    if (!coverage) return res.status(404).json({ error: 'Cobertura no encontrada.' });
    res.json({ coverage });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener cobertura: ' + err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { nombre, descripcion, prima, ...items } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio.' });

    const cols = ['nombre', 'descripcion', 'prima'];
    const vals = [nombre, descripcion || null, prima || 0];
    const placeholders = ['?', '?', '?'];

    for (let i = 1; i <= 10; i++) {
      if (items[`cob_${i}_nombre`] !== undefined) {
        cols.push(`cob_${i}_nombre`);
        vals.push(items[`cob_${i}_nombre`]);
        placeholders.push('?');
      }
      if (items[`cob_${i}_monto`] !== undefined) {
        cols.push(`cob_${i}_monto`);
        vals.push(items[`cob_${i}_monto`] || 0);
        placeholders.push('?');
      }
    }

    const query = `INSERT INTO coverages (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`;
    const result = await queryRun(query, vals);
    const coverage = await queryGet('SELECT * FROM coverages WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json({ message: 'Cobertura creada exitosamente.', coverage });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear cobertura: ' + err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const data = req.body;
    const coverage = await queryGet('SELECT * FROM coverages WHERE id = ?', [req.params.id]);
    if (!coverage) return res.status(404).json({ error: 'Cobertura no encontrada.' });

    const updates = [];
    const vals = [];
    const fields = ['nombre', 'descripcion', 'prima', 'active'];
    for (let i = 1; i <= 10; i++) { fields.push(`cob_${i}_nombre`); fields.push(`cob_${i}_monto`); }

    fields.forEach(f => {
      if (data[f] !== undefined) {
        updates.push(`${f} = ?`);
        vals.push(data[f]);
      }
    });

    if (updates.length > 0) {
      vals.push(req.params.id);
      const query = `UPDATE coverages SET ${updates.join(', ')} WHERE id = ?`;
      await queryRun(query, vals);
    }

    const updated = await queryGet('SELECT * FROM coverages WHERE id = ?', [req.params.id]);
    res.json({ message: 'Cobertura actualizada exitosamente.', coverage: updated });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar cobertura: ' + err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const policyCheck = await queryGet('SELECT id FROM policies WHERE cobertura = (SELECT nombre FROM coverages WHERE id = ?) LIMIT 1', [req.params.id]);
    if (policyCheck) return res.status(400).json({ error: 'No se puede eliminar la cobertura porque hay pólizas que la usan.' });

    await queryRun('DELETE FROM coverages WHERE id = ?', [req.params.id]);
    res.json({ message: 'Cobertura eliminada exitosamente.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar cobertura: ' + err.message });
  }
});

module.exports = router;