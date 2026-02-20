const express = require('express');
const bcrypt = require('bcryptjs');
const { queryAll, queryGet, queryRun } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// List users
router.get('/', (req, res) => {
  try {
    const users = queryAll('SELECT id, username, email, role, active, created_at, updated_at FROM users ORDER BY created_at DESC');
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuarios: ' + err.message });
  }
});

// NUEVA RUTA: Crear usuario (Solo accesible internamente)
router.post('/', (req, res) => {
  try {
    // 1. Recibimos los datos enviados desde el formulario del Dashboard
    const { username, email, password, role } = req.body;

    // 2. Validación estricta: No permitimos campos vacíos
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Usuario, email y contraseña son obligatorios.' });
    }

    // 3. Verificamos que no exista un clon en la base de datos
    const existing = queryGet('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existing) {
      return res.status(409).json({ error: 'El usuario o email ya existe.' });
    }

    // 4. Seguridad: Encriptamos la clave usando bcrypt antes de guardarla en SQLite
    // El "10" es el nivel de salting (complejidad matemática de la encriptación)
    const password_hash = bcrypt.hashSync(password, 10);
    
    // 5. Asignamos el rol. Si no envían uno, por defecto será 'admin'
    const userRole = role || 'admin';

    // 6. Guardamos en la base de datos (con active = 1 para que pueda loguearse)
    const result = queryRun(
      'INSERT INTO users (username, email, password_hash, role, active) VALUES (?, ?, ?, ?, 1)',
      [username, email, password_hash, userRole]
    );

    // 7. Respondemos con éxito al Frontend
    res.status(201).json({ message: 'Usuario creado exitosamente.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear usuario: ' + err.message });
  }
});

// Update user
router.put('/:id', (req, res) => {
  try {
    const user = queryGet('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

    const { username, email, password, role, active } = req.body;

    if (username && username !== user.username) {
      const existing = queryGet('SELECT id FROM users WHERE username = ? AND id != ?', [username, req.params.id]);
      if (existing) return res.status(409).json({ error: 'El nombre de usuario ya está en uso.' });
    }

    if (email && email !== user.email) {
      const existing = queryGet('SELECT id FROM users WHERE email = ? AND id != ?', [email, req.params.id]);
      if (existing) return res.status(409).json({ error: 'El email ya está en uso.' });
    }

    const newPasswordHash = password ? bcrypt.hashSync(password, 10) : user.password_hash;

    queryRun(
      'UPDATE users SET username = ?, email = ?, password_hash = ?, role = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [
        username || user.username,
        email || user.email,
        newPasswordHash,
        role || user.role,
        active !== undefined ? active : user.active,
        req.params.id
      ]
    );

    const updated = queryGet('SELECT id, username, email, role, active, created_at, updated_at FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: 'Usuario actualizado exitosamente.', user: updated });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar usuario: ' + err.message });
  }
});

// Delete user
router.delete('/:id', (req, res) => {
  try {
    if (Number(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'No puede eliminar su propia cuenta.' });
    }

    const user = queryGet('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

    queryRun('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: 'Usuario eliminado exitosamente.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar usuario: ' + err.message });
  }
});

module.exports = router;
