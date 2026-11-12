const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const { initDatabase, queryGet, closeDatabase, expireOverduePolicies } = require('./db/database');
const { getCoverageDetailsByName } = require('./utils/coverages');
const { createRateLimiter } = require('./utils/rate-limiter');
const { verifyPolicySignature } = require('./utils/qr-signature');
const { securityHeaders, buildCorsOptions } = require('./middleware/security');

const app = express();

app.set('trust proxy', 1);
app.use(securityHeaders);
app.use(compression({ threshold: 512 }));
app.use(cors(buildCorsOptions()));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), { etag: true }));

async function startServer() {
  await initDatabase();
  console.log('✅ Base de datos inicializada');

  app.get('/api/health', async (req, res) => {
    try {
      await queryGet('SELECT 1 AS ok');
      res.set('Cache-Control', 'no-store');
      res.json({ status: 'ok', db: 'connected', uptimeSeconds: Math.round(process.uptime()) });
    } catch (err) {
      res.status(503).json({ status: 'degraded', db: 'error' });
    }
  });

  const verifyRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 60,
    message: 'Demasiadas consultas de verificación. Intente nuevamente en un minuto.'
  });

  app.get('/api/verify/:policy_number', verifyRateLimiter, async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      await expireOverduePolicies();
      const raw = String(req.params.policy_number || '').trim();
      if (!/^[A-Za-z0-9-]{4,50}$/.test(raw)) {
        return res.status(400).json({ error: 'Número de póliza inválido' });
      }

      const selectSql = `SELECT p.id, p.policy_number, p.tipo_vehiculo, p.placa, p.marca, p.modelo, p.anio, p.color,
                p.serial_carroceria, p.serial_motor, p.cobertura, p.monto, p.prima,
                p.fecha_inicio, p.fecha_fin, p.estado, p.created_at,
                CONCAT(c.nombre, ' ', c.apellido) as client_name,
                c.cedula as client_cedula, c.telefono as client_telefono, c.direccion as client_direccion
         FROM policies p JOIN clients c ON p.client_id = c.id`;

      let policy = await queryGet(`${selectSql} WHERE p.policy_number = ? LIMIT 1`, [raw]);
      if (!policy && raw.length === 8) {
        policy = await queryGet(`${selectSql} WHERE RIGHT(p.policy_number, 8) = ? LIMIT 1`, [raw]);
      }

      if (!policy) return res.status(404).json({ error: 'Póliza no encontrada' });

      const signatureStatus = verifyPolicySignature(policy.policy_number, req.query.sig);
      if (signatureStatus === 'invalid') {
        return res.status(403).json({ error: 'Firma de verificación QR inválida o alterada.' });
      }

      const coverageDetails = await getCoverageDetailsByName(policy.cobertura, { queryGet }, { activeOnly: false });
      policy.garantias = coverageDetails.items;
      policy.signature_status = signatureStatus;
      res.json({ policy });
    } catch (err) {
      console.error('Error en /api/verify:', err);
      res.status(500).json({ error: 'Error en la verificación' });
    }
  });

  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/clients', require('./routes/clients'));
  app.use('/api/policies', require('./routes/policies'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/coverages', require('./routes/coverages'));
  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api/audit', require('./routes/audit'));

  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Endpoint no encontrado.' });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.use((err, req, res, next) => {
    if (err && err.message === 'Origen no permitido por CORS') {
      return res.status(403).json({ error: err.message });
    }
    console.error(err.stack);
    res.status(500).json({ error: 'Error interno del servidor.' });
  });

  const rawPort = process.env.PORT || 4000;
  const numericPort = Number(rawPort);
  const onListen = () => {
    console.log(`🛡️  Sistema RCV ejecutándose en el puerto ${rawPort}`);
  };
  const server = Number.isInteger(numericPort) && numericPort > 0
    ? app.listen(numericPort, process.env.HOST || '0.0.0.0', onListen)
    : app.listen(rawPort, onListen);

  const shutdown = async () => {
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch(err => {
  console.error('Error al iniciar el servidor:', err);
  process.exit(1);
});
