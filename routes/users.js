const express = require('express');
const bcrypt = require('bcryptjs');
const { queryAll, queryGet, queryRun } = require('../db/database');
const { authenticateToken, requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const users = await queryAll('SELECT id, username, email, role, active, created_at FROM users');
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireSuperAdmin, async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    const password_hash = bcrypt.hashSync(password, 10);
    const result = await queryRun(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email, password_hash, role || 'admin']
    );
    res.status(201).json({ message: 'Usuario creado', id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
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