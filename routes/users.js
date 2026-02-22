const express = require('express');
const bcrypt = require('bcryptjs');
const { queryAll, queryGet, queryRun } = require('../db/database');
const { authenticateToken, requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

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
    let { username, email, password, role } = req.body;
    
    // REGLA PARA ADMIN: Ahora puede crear 'register' y 'admin'
    if (req.user.role === 'admin') {
      if (role !== 'admin' && role !== 'register') {
        role = 'register'; // Filtro de seguridad por si intentan enviar un rol no permitido
      }
    }

    const password_hash = bcrypt.hashSync(password, 10);
    const result = await queryRun(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email, password_hash, role || 'register']
    );
    res.status(201).json({ message: 'Usuario creado con éxito', id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear usuario: ' + err.message });
  }
});

router.put('/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { username, email, role, active, password } = req.body;
    const user = await queryGet('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    let updateQuery = 'UPDATE users SET username = ?, email = ?, role = ?, active = ? WHERE id = ?';
    let params = [username || user.username, email || user.email, role || user.role, active !== undefined ? active : user.active, req.params.id];

    if (password) {
      const password_hash = bcrypt.hashSync(password, 10);
      updateQuery = 'UPDATE users SET username = ?, email = ?, role = ?, active = ?, password_hash = ? WHERE id = ?';
      params = [username || user.username, email || user.email, role || user.role, active !== undefined ? active : user.active, password_hash, req.params.id];
    }

    await queryRun(updateQuery, params);
    res.json({ message: 'Usuario actualizado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireSuperAdmin, async (req, res) => {
  try {
    if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
    await queryRun('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: 'Usuario eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;