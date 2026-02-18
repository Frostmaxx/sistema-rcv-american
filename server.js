require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

async function startServer() {
  // Initialize database
  await initDatabase();
  console.log('✅ Base de datos inicializada');

  // API Routes
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/clients', require('./routes/clients'));
  app.use('/api/policies', require('./routes/policies'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/coverages', require('./routes/coverages'));
  app.use('/api/dashboard', require('./routes/dashboard'));

  // SPA fallback
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Endpoint no encontrado.' });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // Error handling
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Error interno del servidor.' });
  });

  app.listen(PORT, () => {
    console.log(`🛡️  Sistema RCV ejecutándose en http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Error al iniciar el servidor:', err);
  process.exit(1);
});
