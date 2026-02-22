const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { queryGet } = require('../db/database');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await queryGet('SELECT * FROM users WHERE username = ? AND active = 1', [username]);

    // 1. Validamos si el usuario existe
    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado o inactivo.' });
    }

    // 2. Validamos la contraseña
    if (!bcrypt.compareSync(password, user.password_hash)) {
      let mensajeError = 'Contraseña incorrecta.';
      
      // Lógica inteligente: Si es admin y tiene indicio configurado, lo mostramos
      if (user.role === 'admin' && user.password_hint) {
        mensajeError = `Contraseña incorrecta. 💡 Indicio: ${user.password_hint}`;
      }
      
      return res.status(401).json({ error: mensajeError });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '12h' }
    );

    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Error en el servidor: ' + err.message });
  }
});

router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const user = await queryGet('SELECT id, username, role FROM users WHERE id = ? AND active = 1', [decoded.id]);

    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
    res.json({ user });
  } catch (err) {
    res.status(401).json({ error: 'Token inválido' });
  }
});

module.exports = router;