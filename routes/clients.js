const express = require('express');
const { queryAll, queryGet, queryRun } = require('../db/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();
router.use(authenticateToken);

function normalizeDocumentId(raw) {
  const value = String(raw || '').trim();
  const match = value.match(/^([VEJvej])[-.\s]*(\d[\d.\s-]*)$/);
  if (!match) return null;
  const prefix = match[1].toUpperCase();
  const digits = match[2].replace(/\D/g, '');
  if (!digits || digits.length > 45) return null;
  return `${prefix}-${digits}`;
}

function normalizeBirthDate(raw) {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime()) || raw.getFullYear() <= 1900) return null;
    return raw.toISOString().slice(0, 10);
  }
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed.startsWith('0000-00-00') || trimmed.startsWith('1899-11-30')) return null;
  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  return isoMatch ? isoMatch[1] : false;
}

router.get('/', async (req, res) => {
  try {
    const { search, compact } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const selectCols = compact === '1'
      ? 'id, cedula, nombre, apellido'
      : 'id, cedula, nombre, apellido, telefono, email, ciudad, created_at';
    let query = `SELECT ${selectCols} FROM clients WHERE 1=1`;
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

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [totalRow, clients] = await Promise.all([
      queryGet(countQuery, countParams),
      queryAll(query, params)
    ]);
    const total = totalRow ? totalRow.total : 0;

    res.json({
      clients,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('Error al obtener clientes:', err);
    res.status(500).json({ error: 'Error al obtener clientes.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const clientId = Number(req.params.id);
    if (!Number.isInteger(clientId) || clientId <= 0) {
      return res.status(400).json({ error: 'ID de cliente inválido.' });
    }
    const client = await queryGet('SELECT * FROM clients WHERE id = ?', [clientId]);
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado.' });
    res.json({ client });
  } catch (err) {
    console.error('Error al obtener cliente:', err);
    res.status(500).json({ error: 'Error al obtener cliente.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { cedula, nombre, apellido, telefono, email, direccion, ciudad, estado_region, fecha_nacimiento } = req.body;
    const normalizedCedula = normalizeDocumentId(cedula);
    if (!normalizedCedula) {
      return res.status(400).json({ error: 'Documento ID inválido. Use V-, E- o J- seguido de dígitos.' });
    }
    if (!nombre || !apellido) {
      return res.status(400).json({ error: 'Nombre y apellido son obligatorios.' });
    }

    const normalizedBirthDate = normalizeBirthDate(fecha_nacimiento);
    if (normalizedBirthDate === false) {
      return res.status(400).json({ error: 'Fecha de nacimiento inválida.' });
    }

    const result = await queryRun(
      `INSERT INTO clients (cedula, nombre, apellido, telefono, email, direccion, ciudad, estado_region, fecha_nacimiento)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizedCedula,
        String(nombre).trim(),
        String(apellido).trim(),
        telefono ? String(telefono).trim() : null,
        email ? String(email).trim() : null,
        direccion ? String(direccion).trim() : null,
        ciudad ? String(ciudad).trim() : null,
        estado_region ? String(estado_region).trim() : null,
        normalizedBirthDate ?? null
      ]
    );
    const client = await queryGet('SELECT * FROM clients WHERE id = ?', [result.lastInsertRowid]);
    await logAudit({ req, action: 'CREATE', entity: 'client', entityId: client.id, details: { cedula: client.cedula } });
    res.status(201).json({ message: 'Cliente creado exitosamente.', client });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe un cliente registrado con ese Documento ID.' });
    }
    console.error('Error al crear cliente:', err);
    res.status(500).json({ error: 'Error al crear cliente.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const clientId = Number(req.params.id);
    if (!Number.isInteger(clientId) || clientId <= 0) {
      return res.status(400).json({ error: 'ID de cliente inválido.' });
    }
    const { cedula, nombre, apellido, telefono, email, direccion, ciudad, estado_region, fecha_nacimiento, active } = req.body;
    const client = await queryGet('SELECT * FROM clients WHERE id = ?', [clientId]);
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado.' });

    let nextCedula = client.cedula;
    if (cedula !== undefined) {
      nextCedula = normalizeDocumentId(cedula);
      if (!nextCedula) {
        return res.status(400).json({ error: 'Documento ID inválido. Use V-, E- o J- seguido de dígitos.' });
      }
    }

    let nextBirthDate = normalizeBirthDate(client.fecha_nacimiento);
    if (nextBirthDate === false) nextBirthDate = null;
    if (fecha_nacimiento !== undefined) {
      const parsedBirthDate = normalizeBirthDate(fecha_nacimiento);
      if (parsedBirthDate === false) {
        return res.status(400).json({ error: 'Fecha de nacimiento inválida.' });
      }
      nextBirthDate = parsedBirthDate;
    }

    await queryRun(
      `UPDATE clients SET cedula = ?, nombre = ?, apellido = ?, telefono = ?, email = ?, direccion = ?, ciudad = ?, estado_region = ?, fecha_nacimiento = ?, active = ? WHERE id = ?`,
      [
        nextCedula,
        nombre !== undefined ? (String(nombre).trim() || client.nombre) : client.nombre,
        apellido !== undefined ? (String(apellido).trim() || client.apellido) : client.apellido,
        telefono !== undefined ? (telefono ? String(telefono).trim() : null) : client.telefono,
        email !== undefined ? (email ? String(email).trim() : null) : client.email,
        direccion !== undefined ? (direccion ? String(direccion).trim() : null) : client.direccion,
        ciudad !== undefined ? (ciudad ? String(ciudad).trim() : null) : client.ciudad,
        estado_region !== undefined ? (estado_region ? String(estado_region).trim() : null) : client.estado_region,
        nextBirthDate,
        active !== undefined ? active : client.active,
        clientId
      ]
    );
    const updated = await queryGet('SELECT * FROM clients WHERE id = ?', [clientId]);
    await logAudit({ req, action: 'UPDATE', entity: 'client', entityId: clientId, details: { cedula: updated.cedula } });
    res.json({ message: 'Cliente actualizado exitosamente.', client: updated });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe un cliente registrado con ese Documento ID.' });
    }
    console.error('Error al actualizar cliente:', err);
    res.status(500).json({ error: 'Error al actualizar cliente.' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const clientId = Number(req.params.id);
    if (!Number.isInteger(clientId) || clientId <= 0) {
      return res.status(400).json({ error: 'ID de cliente inválido.' });
    }
    const client = await queryGet('SELECT id FROM clients WHERE id = ?', [clientId]);
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado.' });

    const policyCheck = await queryGet('SELECT id FROM policies WHERE client_id = ? LIMIT 1', [clientId]);
    if (policyCheck) return res.status(400).json({ error: 'No se puede eliminar el cliente porque tiene pólizas asociadas.' });

    await queryRun('DELETE FROM clients WHERE id = ?', [clientId]);
    await logAudit({ req, action: 'DELETE', entity: 'client', entityId: clientId });
    res.json({ message: 'Cliente eliminado exitosamente.' });
  } catch (err) {
    console.error('Error al eliminar cliente:', err);
    res.status(500).json({ error: 'Error al eliminar cliente.' });
  }
});

module.exports = router;