const express = require('express');
const { queryAll, queryGet, queryRun } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// List clients with search
router.get('/', (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM clients WHERE active = 1';
    let countQuery = 'SELECT COUNT(*) as total FROM clients WHERE active = 1';
    const params = [];
    const countParams = [];

    if (search) {
      const searchClause = ' AND (cedula LIKE ? OR nombre LIKE ? OR apellido LIKE ? OR email LIKE ? OR telefono LIKE ?)';
      query += searchClause;
      countQuery += searchClause;
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam, searchParam);
      countParams.push(searchParam, searchParam, searchParam, searchParam, searchParam);
    }

    const totalRow = queryGet(countQuery, countParams);
    const total = totalRow ? totalRow.total : 0;

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    const clients = queryAll(query, params);

    res.json({
      clients,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener clientes: ' + err.message });
  }
});

// Get single client
router.get('/:id', (req, res) => {
  try {
    const client = queryGet('SELECT * FROM clients WHERE id = ? AND active = 1', [req.params.id]);
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado.' });

    const policies = queryAll('SELECT * FROM policies WHERE client_id = ? ORDER BY created_at DESC', [req.params.id]);
    res.json({ client, policies });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener cliente: ' + err.message });
  }
});

// Create client
router.post('/', (req, res) => {
  try {
    const { cedula, nombre, apellido, telefono, email, direccion, ciudad, estado_region, fecha_nacimiento } = req.body;

    if (!cedula || !nombre || !apellido) {
      return res.status(400).json({ error: 'Cédula, nombre y apellido son obligatorios.' });
    }

    const existing = queryGet('SELECT id FROM clients WHERE cedula = ?', [cedula]);
    if (existing) {
      return res.status(409).json({ error: 'Ya existe un cliente con esta cédula.' });
    }

    const result = queryRun(
      'INSERT INTO clients (cedula, nombre, apellido, telefono, email, direccion, ciudad, estado_region, fecha_nacimiento) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [cedula, nombre, apellido, telefono || null, email || null, direccion || null, ciudad || null, estado_region || null, fecha_nacimiento || null]
    );

    const client = queryGet('SELECT * FROM clients WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json({ message: 'Cliente creado exitosamente.', client });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear cliente: ' + err.message });
  }
});

// Update client
router.put('/:id', (req, res) => {
  try {
    const client = queryGet('SELECT * FROM clients WHERE id = ? AND active = 1', [req.params.id]);
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado.' });

    const { cedula, nombre, apellido, telefono, email, direccion, ciudad, estado_region, fecha_nacimiento } = req.body;

    if (cedula && cedula !== client.cedula) {
      const existing = queryGet('SELECT id FROM clients WHERE cedula = ? AND id != ?', [cedula, req.params.id]);
      if (existing) return res.status(409).json({ error: 'Ya existe un cliente con esta cédula.' });
    }

    queryRun(
      'UPDATE clients SET cedula = ?, nombre = ?, apellido = ?, telefono = ?, email = ?, direccion = ?, ciudad = ?, estado_region = ?, fecha_nacimiento = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [
        cedula || client.cedula, nombre || client.nombre, apellido || client.apellido,
        telefono !== undefined ? telefono : client.telefono,
        email !== undefined ? email : client.email,
        direccion !== undefined ? direccion : client.direccion,
        ciudad !== undefined ? ciudad : client.ciudad,
        estado_region !== undefined ? estado_region : client.estado_region,
        fecha_nacimiento !== undefined ? fecha_nacimiento : client.fecha_nacimiento,
        req.params.id
      ]
    );

    const updated = queryGet('SELECT * FROM clients WHERE id = ?', [req.params.id]);
    res.json({ message: 'Cliente actualizado exitosamente.', client: updated });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar cliente: ' + err.message });
  }
});

// Delete client (soft delete)
router.delete('/:id', (req, res) => {
  try {
    const client = queryGet('SELECT * FROM clients WHERE id = ? AND active = 1', [req.params.id]);
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado.' });

    const activePolicies = queryGet("SELECT COUNT(*) as count FROM policies WHERE client_id = ? AND estado = 'activa'", [req.params.id]);
    if (activePolicies && activePolicies.count > 0) {
      return res.status(400).json({ error: 'No se puede eliminar un cliente con pólizas activas.' });
    }

    queryRun('UPDATE clients SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
    res.json({ message: 'Cliente eliminado exitosamente.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar cliente: ' + err.message });
  }
});

module.exports = router;
