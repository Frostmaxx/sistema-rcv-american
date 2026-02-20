require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./db/database');
const { queryGet } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

async function startServer() {
  // Initialize database
  await initDatabase();
  console.log('✅ Base de datos inicializada');

  // ==========================================
  // 🛡️ RUTA PÚBLICA DE VERIFICACIÓN (CÓDIGO QR)
  // ==========================================
  app.get('/api/verify/:policy_number', async (req, res) => {
    try {
      const policy = await queryGet(
        `SELECT p.*, CONCAT(c.nombre, ' ', c.apellido) as client_name, c.cedula as client_cedula, c.telefono as client_telefono, c.email as client_email, c.direccion as client_direccion
        FROM policies p JOIN clients c ON p.client_id = c.id 
        WHERE p.policy_number LIKE ?`,
        [`%${req.params.policy_number}`]
      );

      if (!policy) return res.status(404).json({ error: 'Póliza no encontrada' });
      res.json({ policy });
    } catch (err) {
      res.status(500).json({ error: 'Error en la verificación' });
    }
  });
  // ==========================================

  // Rutas protegidas existentes...
  app.use('/api/auth', authRoutes);

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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🛡️  Sistema RCV ejecutándose en el puerto ${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Error al iniciar el servidor:', err);
  process.exit(1);
});
