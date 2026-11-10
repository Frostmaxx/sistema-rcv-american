const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { getEmergencyConfig, getEmergencyPasswordHash } = require('../utils/emergency-admin');

let pool;
let lastExpireCheckAt = 0;

async function ensureIndex(table, indexName, columnsSql) {
  try {
    await pool.query(`CREATE INDEX ${indexName} ON ${table} (${columnsSql})`);
  } catch (err) {
    // 1061 = ER_DUP_KEYNAME (el índice ya existe)
    if (err.errno !== 1061) {
      console.log(`⚠️ Nota sobre índice ${indexName}:`, err.message);
    }
  }
}

async function initDatabase() {
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'rcv_db',
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
  });

  console.log('🔄 Conectando a MySQL...');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'admin',
      password_hint VARCHAR(255) DEFAULT NULL,
      active TINYINT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  try {
    await pool.query("ALTER TABLE users ADD COLUMN password_hint VARCHAR(255) DEFAULT NULL");
    console.log('✅ Base de datos parcheada: Columna password_hint añadida exitosamente.');
  } catch (err) {
    // 1060 = Duplicate column name
    if (err.errno !== 1060) {
      console.log('⚠️ Nota sobre password_hint:', err.message);
    }
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cedula VARCHAR(50) UNIQUE NOT NULL,
      nombre VARCHAR(255) NOT NULL,
      apellido VARCHAR(255) NOT NULL,
      telefono VARCHAR(50),
      email VARCHAR(255),
      direccion TEXT,
      ciudad VARCHAR(100),
      estado_region VARCHAR(100),
      fecha_nacimiento DATE,
      active TINYINT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS policies (
      id INT AUTO_INCREMENT PRIMARY KEY,
      policy_number VARCHAR(50) UNIQUE NOT NULL,
      client_id INT NOT NULL,
      tipo_vehiculo VARCHAR(50) NOT NULL,
      placa VARCHAR(20) NOT NULL,
      marca VARCHAR(100) NOT NULL,
      modelo VARCHAR(100) NOT NULL,
      anio INT NOT NULL,
      color VARCHAR(50),
      serial_carroceria VARCHAR(100),
      serial_motor VARCHAR(100),
      cobertura VARCHAR(100) NOT NULL,
      monto DECIMAL(12,2) NOT NULL,
      prima DECIMAL(12,2) NOT NULL,
      fecha_inicio DATE NOT NULL,
      fecha_fin DATE NOT NULL,
      estado VARCHAR(50) DEFAULT 'activa',
      notas TEXT,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS coverages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(100) UNIQUE NOT NULL,
      descripcion TEXT,
      prima DECIMAL(12,2) DEFAULT 0,
      cob_1_nombre VARCHAR(255), cob_1_monto DECIMAL(12,2) DEFAULT 0,
      cob_2_nombre VARCHAR(255), cob_2_monto DECIMAL(12,2) DEFAULT 0,
      cob_3_nombre VARCHAR(255), cob_3_monto DECIMAL(12,2) DEFAULT 0,
      cob_4_nombre VARCHAR(255), cob_4_monto DECIMAL(12,2) DEFAULT 0,
      cob_5_nombre VARCHAR(255), cob_5_monto DECIMAL(12,2) DEFAULT 0,
      cob_6_nombre VARCHAR(255), cob_6_monto DECIMAL(12,2) DEFAULT 0,
      cob_7_nombre VARCHAR(255), cob_7_monto DECIMAL(12,2) DEFAULT 0,
      cob_8_nombre VARCHAR(255), cob_8_monto DECIMAL(12,2) DEFAULT 0,
      cob_9_nombre VARCHAR(255), cob_9_monto DECIMAL(12,2) DEFAULT 0,
      cob_10_nombre VARCHAR(255), cob_10_monto DECIMAL(12,2) DEFAULT 0,
      active TINYINT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sequences (
      name VARCHAR(50) PRIMARY KEY,
      value INT DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      username VARCHAR(100) NOT NULL,
      action VARCHAR(50) NOT NULL,
      entity VARCHAR(50) NOT NULL,
      entity_id VARCHAR(50) NULL,
      details TEXT NULL,
      ip VARCHAR(64) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await Promise.all([
    ensureIndex('clients', 'idx_clients_created_at', 'created_at'),
    ensureIndex('clients', 'idx_clients_nombre_apellido', 'nombre(50), apellido(50)'),
    ensureIndex('policies', 'idx_policies_created_at', 'created_at'),
    ensureIndex('policies', 'idx_policies_estado_created', 'estado, created_at'),
    ensureIndex('policies', 'idx_policies_placa', 'placa'),
    ensureIndex('policies', 'idx_policies_cobertura', 'cobertura'),
    ensureIndex('audit_logs', 'idx_audit_created_at', 'created_at'),
    ensureIndex('audit_logs', 'idx_audit_entity', 'entity, entity_id')
  ]);

  await ensureUsersTableAndEmergencySuperadmin();
  await expireOverduePolicies({ force: true });

  return pool;
}

async function ensureUsersTableAndEmergencySuperadmin({ forceSyncPassword = false } = {}) {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'admin',
        password_hint VARCHAR(255) DEFAULT NULL,
        active TINYINT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    const cfg = getEmergencyConfig();
    const emgHash = await getEmergencyPasswordHash();

    if (emgHash) {
      const [existing] = await pool.query(
        'SELECT id, role, active FROM users WHERE username = ? LIMIT 1',
        [cfg.username]
      );
      if (existing.length === 0) {
        await pool.query(
          'INSERT INTO users (username, email, password_hash, role, active) VALUES (?, ?, ?, ?, 1)',
          [cfg.username, cfg.email, emgHash, 'superadmin']
        );
        console.log(`✅ Usuario superadmin de emergencia [${cfg.username}] creado/restaurado.`);
      } else if (forceSyncPassword || existing[0].role !== 'superadmin' || !existing[0].active) {
        if (forceSyncPassword) {
          await pool.query(
            'UPDATE users SET password_hash = ?, role = ?, active = 1 WHERE id = ?',
            [emgHash, 'superadmin', existing[0].id]
          );
        } else {
          await pool.query(
            'UPDATE users SET role = ?, active = 1 WHERE id = ?',
            ['superadmin', existing[0].id]
          );
        }
        console.log(`✅ Privilegios del superadmin de emergencia [${cfg.username}] verificados.`);
      }
    }

    const [rows] = await pool.query('SELECT COUNT(*) as count FROM users');
    if (rows[0].count === 0) {
      const password_hash = bcrypt.hashSync('admin123', 10);
      await pool.query(
        "INSERT INTO users (username, email, password_hash, role, active) VALUES ('admin', 'admin@rcv.com', ?, 'superadmin', 1)",
        [password_hash]
      );
      console.log('✅ Auto-Siembra: Base de datos vacía. Usuario [admin] / [admin123] creado.');
    }
  } catch (err) {
    console.log('⚠️ Omitiendo verificación de usuarios de emergencia:', err.message);
  }
}

async function expireOverduePolicies({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastExpireCheckAt < 60 * 1000) {
    return 0;
  }
  lastExpireCheckAt = now;
  try {
    const [result] = await pool.execute(
      "UPDATE policies SET estado = 'vencida' WHERE estado = 'activa' AND fecha_fin < CURDATE()"
    );
    return result.affectedRows || 0;
  } catch (err) {
    console.error('⚠️ Error expirando pólizas vencidas:', err.message);
    return 0;
  }
}

async function queryAll(sql, params = [], conn = pool) {
  const [rows] = await conn.query(sql, params);
  return rows;
}

async function queryGet(sql, params = [], conn = pool) {
  const [rows] = await conn.query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

async function queryRun(sql, params = [], conn = pool) {
  const [result] = await conn.execute(sql, params);
  return { lastInsertRowid: result.insertId, changes: result.affectedRows };
}

async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const tx = {
      queryAll: (sql, params = []) => queryAll(sql, params, conn),
      queryGet: (sql, params = []) => queryGet(sql, params, conn),
      queryRun: (sql, params = []) => queryRun(sql, params, conn)
    };
    const result = await fn(tx);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  initDatabase,
  queryAll,
  queryGet,
  queryRun,
  withTransaction,
  closeDatabase,
  ensureUsersTableAndEmergencySuperadmin,
  expireOverduePolicies
};