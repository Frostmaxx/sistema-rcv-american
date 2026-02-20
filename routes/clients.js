const express = require('express');
const { queryAll, queryGet, queryRun } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM clients WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) as total FROM clients WHERE 1=1';
    const params = [];
    const countParams = [];

    if (search) {
      const searchClause = ' AND (cedula LIKE ? OR nombre LIKE ? OR apellido LIKE ?)';
      query += searchClause;
      countQuery += searchClause;
      const s = `%${search}%`;
      params.push(s, s, s);
      countParams.push(s, s, s);
    }

    const totalRow = await queryGet(countQuery, countParams);
    const total = totalRow ? totalRow.total : 0;

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    const clients = await queryAll(query, params);

    res.json({
      clients,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener clientes: ' + err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const client = await queryGet('SELECT * FROM clients WHERE id = ?', [req.params.id]);
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado.' });
    res.json({ client });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener cliente: ' + err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { cedula, nombre, apellido, telefono, email, direccion, ciudad, estado_region, fecha_nacimiento } = req.body;
    const result = await queryRun(
      `INSERT INTO clients (cedula, nombre, apellido, telefono, email, direccion, ciudad, estado_region, fecha_nacimiento)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cedula, nombre, apellido, telefono || null, email || null, direccion || null, ciudad || null, estado_region || null, fecha_nacimiento || null]
    );
    const client = await queryGet('SELECT * FROM clients WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json({ message: 'Cliente creado exitosamente.', client });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear cliente: ' + err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { cedula, nombre, apellido, telefono, email, direccion, ciudad, estado_region, fecha_nacimiento, active } = req.body;
    const client = await queryGet('SELECT * FROM clients WHERE id = ?', [req.params.id]);
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado.' });

    await queryRun(
      `UPDATE clients SET cedula = ?, nombre = ?, apellido = ?, telefono = ?, email = ?, direccion = ?, ciudad = ?, estado_region = ?, fecha_nacimiento = ?, active = ? WHERE id = ?`,
      [
        cedula || client.cedula, nombre || client.nombre, apellido || client.apellido,
        telefono !== undefined ? telefono : client.telefono,
        email !== undefined ? email : client.email,
        direccion !== undefined ? direccion : client.direccion,
        ciudad !== undefined ? ciudad : client.ciudad,
        estado_region !== undefined ? estado_region : client.estado_region,
        fecha_nacimiento !== undefined ? fecha_nacimiento : client.fecha_nacimiento,
        active !== undefined ? active : client.active,
        req.params.id
      ]
    );
    const updated = await queryGet('SELECT * FROM clients WHERE id = ?', [req.params.id]);
    res.json({ message: 'Cliente actualizado exitosamente.', client: updated });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar cliente: ' + err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const policyCheck = await queryGet('SELECT id FROM policies WHERE client_id = ? LIMIT 1', [req.params.id]);
    if (policyCheck) return res.status(400).json({ error: 'No se puede eliminar el cliente porque tiene pólizas asociadas.' });

    await queryRun('DELETE FROM clients WHERE id = ?', [req.params.id]);
    res.json({ message: 'Cliente eliminado exitosamente.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar cliente: ' + err.message });
  }
});

module.exports = router;