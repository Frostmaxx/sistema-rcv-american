const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { queryGet, queryRun } = require('../db/database');

const router = express.Router();

// Register
router.post('/register', (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    const existing = queryGet('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existing) {
      return res.status(409).json({ error: 'El usuario o email ya existe.' });
    }

    const password_hash = bcrypt.hashSync(password, 10);
    const result = queryRun(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email, password_hash, 'admin']
    );

    const token = jwt.sign({ userId: result.lastInsertRowid }, process.env.JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({
      message: 'Usuario registrado exitosamente.',
      token,
      user: { id: result.lastInsertRowid, username, email, role: 'admin' }
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar usuario: ' + err.message });
  }
});

// Login
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son obligatorios.' });
    }

    const user = queryGet('SELECT * FROM users WHERE username = ? AND active = 1', [username]);
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '24h' });

    res.json({
      message: 'Inicio de sesión exitoso.',
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al iniciar sesión: ' + err.message });
  }
});

// Get current user
router.get('/me', require('../middleware/auth').authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
