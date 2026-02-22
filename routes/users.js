const express = require('express');
const bcrypt = require('bcryptjs');
const { queryAll, queryGet, queryRun } = require('../db/database');
const { authenticateToken, canManageUsers } = require('../middleware/auth');

const router = express.Router();

// 🛡️ Aplicamos seguridad a nivel de router
router.use(authenticateToken);
router.use(canManageUsers); 

// --- GET: Listar todos los usuarios ---
router.get('/', async (req, res) => {
  try {
    let query = 'SELECT id, username, email, role, active, created_at FROM users';
    
    // REGLA INVISIBLE: Si el que consulta es un admin, le ocultamos los superadmin de la lista
    if (req.user.role === 'admin') {
      query += " WHERE role != 'superadmin'";
    }
    
    const users = await queryAll(query);
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuarios: ' + err.message });
  }
});

// --- POST: Crear un nuevo usuario ---
router.post('/', async (req, res) => {
  try {
    let { username, email, password, role, password_hint } = req.body;
    
    // REGLA PARA ADMIN: Ahora puede crear 'register' y 'admin'
    if (req.user.role === 'admin') {
      if (role !== 'admin' && role !== 'register') {
        role = 'register'; // Filtro de seguridad
      }
    }

    const password_hash = bcrypt.hashSync(password, 10);
    const result = await queryRun(
      'INSERT INTO users (username, email, password_hash, role, password_hint) VALUES (?, ?, ?, ?, ?)',
      [username, email, password_hash, role || 'register', password_hint || null]
    );
    res.status(201).json({ message: 'Usuario creado con éxito', id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear usuario: ' + err.message });
  }
});

// --- PUT: Modificar un usuario existente ---
router.put('/:id', async (req, res) => {
  try {
    const { username, email, role, active, password, password_hint } = req.body;
    const targetUserId = Number(req.params.id);
    
    const targetUser = await queryGet('SELECT * FROM users WHERE id = ?', [targetUserId]);
    if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });

    // REGLA PARA ADMIN:
    if (req.user.role === 'admin') {
      // 1. No puede editar a un Superadmin ni a otro Admin (solo a sí mismo)
      if (targetUser.role !== 'register' && req.user.id !== targetUserId) {
        return res.status(403).json({ error: 'No tienes permisos para modificar a este usuario.' });
      }
      // 2. No puede promoverse a sí mismo ni a otros a Superadmin
      if (role === 'superadmin') {
        return res.status(403).json({ error: 'No puedes asignar el rol Superadmin.' });
      }
    }

    let updateQuery = 'UPDATE users SET username = ?, email = ?, role = ?, active = ?, password_hint = ? WHERE id = ?';
    let params = [
        username || targetUser.username, 
        email || targetUser.email, 
        role || targetUser.role, 
        active !== undefined ? active : targetUser.active, 
        password_hint !== undefined ? password_hint : targetUser.password_hint,
        targetUserId
    ];

    if (password) {
      const password_hash = bcrypt.hashSync(password, 10);
      updateQuery = 'UPDATE users SET username = ?, email = ?, role = ?, active = ?, password_hash = ?, password_hint = ? WHERE id = ?';
      params = [
          username || targetUser.username, 
          email || targetUser.email, 
          role || targetUser.role, 
          active !== undefined ? active : targetUser.active, 
          password_hash, 
          password_hint !== undefined ? password_hint : targetUser.password_hint,
          targetUserId
      ];
    }

    await queryRun(updateQuery, params);
    res.json({ message: 'Usuario actualizado correctamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar usuario: ' + err.message });
  }
});

// --- DELETE: Eliminar un usuario ---
router.delete('/:id', async (req, res) => {
  try {
    const targetUserId = Number(req.params.id);
    if (targetUserId === req.user.id) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });

    const targetUser = await queryGet('SELECT role FROM users WHERE id = ?', [targetUserId]);
    if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });

    // REGLA PARA ADMIN: Puede eliminar roles 'register' y 'admin', pero NO 'superadmin'
    if (req.user.role === 'admin' && targetUser.role === 'superadmin') {
      return res.status(403).json({ error: 'No tienes permitido eliminar a un Super Admin.' });
    }

    await queryRun('DELETE FROM users WHERE id = ?', [targetUserId]);
    res.json({ message: 'Usuario eliminado exitosamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar usuario: ' + err.message });
  }
});

module.exports = router;