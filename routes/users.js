const express = require('express');
const bcrypt = require('bcryptjs');
const { queryAll, queryGet, queryRun } = require('../db/database');
const { authenticateToken, canManageUsers } = require('../middleware/auth');
const { getEmergencyConfig } = require('../utils/emergency-admin');
const { logAudit } = require('../utils/audit');

const router = express.Router();

router.use(authenticateToken);
router.use(canManageUsers);

const ALLOWED_ROLES = ['register', 'admin', 'superadmin'];

function parsePositiveId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeRole(role) {
  return String(role || '').toLowerCase().trim();
}

router.get('/', async (req, res) => {
  try {
    let query = 'SELECT id, username, email, role, active, password_hint, created_at FROM users';
    if (normalizeRole(req.user.role) !== 'superadmin') {
      query += " WHERE LOWER(TRIM(role)) != 'superadmin'";
    }
    
    const users = await queryAll(query);
    res.json({ users });
  } catch (err) {
    console.error('Error al obtener usuarios:', err);
    res.status(500).json({ error: 'Error al obtener usuarios.' });
  }
});

router.post('/', async (req, res) => {
  try {
    let { username, email, password, role, password_hint } = req.body;
    const cleanUsername = typeof username === 'string' ? username.trim() : '';
    const cleanEmail = typeof email === 'string' ? email.trim() : '';

    if (!cleanUsername || !cleanEmail || typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'Usuario, email y contraseña son obligatorios.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    role = role ? String(role).toLowerCase().trim() : 'register';
    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Rol inválido.' });
    }
    
    if (normalizeRole(req.user.role) !== 'superadmin' && role === 'superadmin') {
      return res.status(403).json({ error: 'No puedes asignar el rol Superadmin.' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const result = await queryRun(
      'INSERT INTO users (username, email, password_hash, role, password_hint) VALUES (?, ?, ?, ?, ?)',
      [cleanUsername, cleanEmail, password_hash, role, password_hint ? String(password_hint).trim() : null]
    );
    await logAudit({ req, action: 'CREATE', entity: 'user', entityId: result.lastInsertRowid, details: { username: cleanUsername, role } });
    res.status(201).json({ message: 'Usuario creado con éxito', id: result.lastInsertRowid });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe un usuario con ese nombre o correo.' });
    }
    console.error('Error al crear usuario:', err);
    res.status(500).json({ error: 'Error al crear usuario.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { username, email, role, active, password, password_hint } = req.body;
    const targetUserId = parsePositiveId(req.params.id);
    if (!targetUserId) return res.status(400).json({ error: 'ID de usuario inválido.' });
    
    const targetUser = await queryGet('SELECT * FROM users WHERE id = ?', [targetUserId]);
    if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });

    const nextRole = role !== undefined ? String(role).toLowerCase().trim() : targetUser.role;
    if (!ALLOWED_ROLES.includes(nextRole)) {
      return res.status(400).json({ error: 'Rol inválido.' });
    }

    const actorRole = normalizeRole(req.user.role);
    const currentTargetRole = normalizeRole(targetUser.role);
    if (actorRole !== 'superadmin') {
      if (currentTargetRole !== 'register' && req.user.id !== targetUserId) {
        return res.status(403).json({ error: 'No tienes permisos para modificar a este usuario.' });
      }
      if (nextRole === 'superadmin') {
        return res.status(403).json({ error: 'No puedes asignar el rol Superadmin.' });
      }
    }

    const nextUsername = typeof username === 'string' && username.trim() ? username.trim() : targetUser.username;
    const nextEmail = typeof email === 'string' && email.trim() ? email.trim() : targetUser.email;
    const nextActive = active !== undefined ? (active ? 1 : 0) : targetUser.active;
    const nextHint = password_hint !== undefined
      ? (password_hint ? String(password_hint).trim() : null)
      : targetUser.password_hint;

    const emergencyUser = getEmergencyConfig().username;
    if (targetUser.username === emergencyUser && (nextRole !== 'superadmin' || !nextActive)) {
      return res.status(400).json({ error: 'No se puede degradar ni desactivar la cuenta superadmin de emergencia.' });
    }

    if (targetUser.role === 'superadmin' && targetUser.active && (nextRole !== 'superadmin' || !nextActive)) {
      const saCount = await queryGet("SELECT COUNT(*) as total FROM users WHERE role = 'superadmin' AND active = 1");
      if (saCount && saCount.total <= 1) {
        return res.status(400).json({ error: 'Debe existir al menos un superadmin activo en el sistema.' });
      }
    }

    let updateQuery = 'UPDATE users SET username = ?, email = ?, role = ?, active = ?, password_hint = ? WHERE id = ?';
    let params = [nextUsername, nextEmail, nextRole, nextActive, nextHint, targetUserId];

    if (typeof password === 'string' && password) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
      }
      const password_hash = await bcrypt.hash(password, 10);
      updateQuery = 'UPDATE users SET username = ?, email = ?, role = ?, active = ?, password_hash = ?, password_hint = ? WHERE id = ?';
      params = [nextUsername, nextEmail, nextRole, nextActive, password_hash, nextHint, targetUserId];
    }

    await queryRun(updateQuery, params);
    await logAudit({ req, action: 'UPDATE', entity: 'user', entityId: targetUserId, details: { username: nextUsername, role: nextRole, active: nextActive } });
    res.json({ message: 'Usuario actualizado correctamente' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe un usuario con ese nombre o correo.' });
    }
    console.error('Error al actualizar usuario:', err);
    res.status(500).json({ error: 'Error al actualizar usuario.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const targetUserId = parsePositiveId(req.params.id);
    if (!targetUserId) return res.status(400).json({ error: 'ID de usuario inválido.' });
    if (targetUserId === req.user.id) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });

    const targetUser = await queryGet('SELECT username, role FROM users WHERE id = ?', [targetUserId]);
    if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (targetUser.username === getEmergencyConfig().username) {
      return res.status(400).json({ error: 'No se puede eliminar el usuario superadmin de emergencia.' });
    }

    if (normalizeRole(req.user.role) !== 'superadmin' && normalizeRole(targetUser.role) !== 'register') {
      return res.status(403).json({ error: 'No tienes permitido eliminar a un Admin o Super Admin.' });
    }

    if (targetUser.role === 'superadmin') {
      const saCount = await queryGet("SELECT COUNT(*) as total FROM users WHERE role = 'superadmin' AND active = 1");
      if (saCount && saCount.total <= 1) {
        return res.status(400).json({ error: 'No se puede eliminar el último superadmin activo.' });
      }
    }

    await queryRun('DELETE FROM users WHERE id = ?', [targetUserId]);
    await logAudit({ req, action: 'DELETE', entity: 'user', entityId: targetUserId, details: { username: targetUser.username } });
    res.json({ message: 'Usuario eliminado exitosamente' });
  } catch (err) {
    console.error('Error al eliminar usuario:', err);
    res.status(500).json({ error: 'Error al eliminar usuario.' });
  }
});

module.exports = router;