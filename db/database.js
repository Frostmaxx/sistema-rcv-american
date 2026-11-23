const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { getEmergencyConfig, getEmergencyPasswordHash } = require('../utils/emergency-admin');

let pool = null;
let sqliteDb = null;
let isSqlite = false;
let inSqliteTx = false;
let lastExpireCheckAt = 0;

const SQLITE_DB_PATH = path.resolve(process.env.DB_PATH || path.join(__dirname, 'rcv.db'));

function ensureDirSync(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function saveSqliteDb() {
  if (sqliteDb && isSqlite) {
    try {
      ensureDirSync(SQLITE_DB_PATH);
      const data = sqliteDb.export();
      fs.writeFileSync(SQLITE_DB_PATH, Buffer.from(data));
    } catch (err) {
      console.error('⚠️ Error guardando base de datos SQLite:', err.message);
    }
  }
}

function buildPoolConfig() {
  const connectionLimit = Math.max(2, Number(process.env.DB_CONNECTION_LIMIT) || 10);
  const base = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'rcv_db',
    waitForConnections: true,
    connectionLimit,
    queueLimit: 0
  };

  const urlRaw = (process.env.DATABASE_URL || process.env.MYSQL_URL || '').trim();
  let cfg;
  let sslFromUrl = false;

  if (urlRaw) {
    const parsed = new URL(urlRaw);
    cfg = {
      ...base,
      host: parsed.hostname || 'localhost',
      port: Number(parsed.port) || 3306,
      user: decodeURIComponent(parsed.username || 'root'),
      password: decodeURIComponent(parsed.password || ''),
      database: parsed.pathname.replace(/^\//, '') || 'rcv_db'
    };
    const sslParam = (parsed.searchParams.get('ssl') || parsed.searchParams.get('ssl-mode') || '').toLowerCase();
    sslFromUrl = sslParam === 'true' || sslParam === 'required' || sslParam === 'verify_ca' || sslParam === 'verify_identity';
  } else {
    cfg = base;
  }

  if (sslFromUrl || String(process.env.DB_SSL || '').toLowerCase() === 'true') {
    cfg.ssl = {
      rejectUnauthorized: String(process.env.DB_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false'
    };
  }

  return cfg;
}

async function ensureIndex(table, indexName, columnsSql) {
  if (isSqlite) return;
  try {
    await pool.query(`CREATE INDEX ${indexName} ON ${table} (${columnsSql})`);
  } catch (err) {
    if (err.errno !== 1061) {
      console.log(`⚠️ Nota sobre índice ${indexName}:`, err.message);
    }
  }
}

async function initSqliteFallback() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  isSqlite = true;

  if (fs.existsSync(SQLITE_DB_PATH)) {
    try {
      const buffer = fs.readFileSync(SQLITE_DB_PATH);
      sqliteDb = new SQL.Database(buffer);
    } catch {
      sqliteDb = new SQL.Database();
    }
  } else {
    sqliteDb = new SQL.Database();
  }

  sqliteDb.create_function('CONCAT', (...args) => args.join(''));
  sqliteDb.create_function('CURDATE', () => new Date().toISOString().slice(0, 10));
  sqliteDb.create_function('NOW', () => new Date().toISOString().slice(0, 19).replace('T', ' '));
  sqliteDb.create_function('RIGHT', (str, n) => String(str || '').slice(-n));

  sqliteDb.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      password_hint TEXT DEFAULT NULL,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cedula TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      apellido TEXT NOT NULL,
      telefono TEXT,
      email TEXT,
      direccion TEXT,
      ciudad TEXT,
      estado_region TEXT,
      fecha_nacimiento DATE,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      policy_number TEXT UNIQUE NOT NULL,
      client_id INTEGER NOT NULL,
      tipo_vehiculo TEXT NOT NULL,
      placa TEXT NOT NULL,
      marca TEXT NOT NULL,
      modelo TEXT NOT NULL,
      anio INTEGER NOT NULL,
      color TEXT,
      serial_carroceria TEXT,
      serial_motor TEXT,
      clase TEXT,
      uso TEXT,
      cobertura TEXT NOT NULL,
      monto REAL NOT NULL,
      prima REAL NOT NULL,
      fecha_inicio DATE NOT NULL,
      fecha_fin DATE NOT NULL,
      estado TEXT DEFAULT 'activa',
      notas TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS coverages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT UNIQUE NOT NULL,
      descripcion TEXT,
      prima REAL DEFAULT 0,
      cob_1_nombre TEXT, cob_1_monto REAL DEFAULT 0,
      cob_2_nombre TEXT, cob_2_monto REAL DEFAULT 0,
      cob_3_nombre TEXT, cob_3_monto REAL DEFAULT 0,
      cob_4_nombre TEXT, cob_4_monto REAL DEFAULT 0,
      cob_5_nombre TEXT, cob_5_monto REAL DEFAULT 0,
      cob_6_nombre TEXT, cob_6_monto REAL DEFAULT 0,
      cob_7_nombre TEXT, cob_7_monto REAL DEFAULT 0,
      cob_8_nombre TEXT, cob_8_monto REAL DEFAULT 0,
      cob_9_nombre TEXT, cob_9_monto REAL DEFAULT 0,
      cob_10_nombre TEXT, cob_10_monto REAL DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sequences (
      name TEXT PRIMARY KEY,
      value INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NULL,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT NULL,
      details TEXT NULL,
      ip TEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try { sqliteDb.run("ALTER TABLE policies ADD COLUMN clase TEXT DEFAULT NULL"); } catch(e) {}
  try { sqliteDb.run("ALTER TABLE policies ADD COLUMN uso TEXT DEFAULT NULL"); } catch(e) {}

  // Default seed for demo coverages if empty
  const covCheck = sqliteDb.exec("SELECT COUNT(*) as count FROM coverages");
  if (covCheck.length === 0 || Number(covCheck[0].values[0][0]) === 0) {
    sqliteDb.run(`
      INSERT INTO coverages (nombre, descripcion, prima, cob_1_nombre, cob_1_monto, cob_2_nombre, cob_2_monto, cob_3_nombre, cob_3_monto, active)
      VALUES 
      ('Básica Automóvil', 'Cobertura mínima legal para vehículos particulares', 35.00, 'Daños a Cosas', 5000.00, 'Daños a Personas', 10000.00, 'Fianza de Excarcelación', 3000.00, 1),
      ('Amplia Todo Riesgo', 'Protección integral con asistencia vial y legal', 75.00, 'Daños a Terceros', 15000.00, 'Muerte Accidental', 20000.00, 'Asistencia Grúa', 500.00, 1),
      ('Moto / RCV Express', 'Cobertura especializada para motocicletas', 25.00, 'Responsabilidad Civil', 3000.00, 'Asistencia Legal', 1500.00, NULL, 0, 1);
    `);
  }

  // Seed default demo client and policy for test 448 if empty
  const polCheck = sqliteDb.exec("SELECT COUNT(*) as count FROM policies");
  if (polCheck.length === 0 || Number(polCheck[0].values[0][0]) === 0) {
    sqliteDb.run(`
      INSERT INTO clients (id, cedula, nombre, apellido, telefono, email, direccion, ciudad, estado_region, fecha_nacimiento, active)
      VALUES (1, 'V-12345678', 'Carlos', 'Rodríguez', '0414-1234567', 'carlos.rodriguez@example.com', 'Av. Principal, Edif. Los Andes, Apto 4B', 'Caracas', 'Distrito Capital', '1985-06-15', 1);

      INSERT INTO sequences (name, value) VALUES ('policy', 448);

      INSERT INTO policies (id, policy_number, client_id, tipo_vehiculo, placa, marca, modelo, anio, color, serial_carroceria, serial_motor, cobertura, monto, prima, fecha_inicio, fecha_fin, estado, notas, created_by)
      VALUES (448, '00000448', 1, 'automovil', 'AB123CD', 'Toyota', 'Corolla', 2022, 'Blanco', '8AJBX382947291048', '2ZR-FE1829374', 'Básica Automóvil', 18000.00, 35.00, date('now', '-30 day'), date('now', '+335 day'), 'activa', 'Póliza demo emitida automáticamente', 1);
    `);
  }

  saveSqliteDb();
  console.log('💡 Modo Demo autónomo activo: Base de datos SQLite inicializada en ' + SQLITE_DB_PATH);
}

function adaptSqlForSqlite(sql) {
  let s = sql;
  s = s.replace(/CURDATE\(\)/gi, "date('now')");
  s = s.replace(/DATE_ADD\(date\('now'\),\s*INTERVAL\s*15\s*DAY\)/gi, "date('now', '+15 day')");
  s = s.replace(/DATE_ADD\(CURDATE\(\),\s*INTERVAL\s*15\s*DAY\)/gi, "date('now', '+15 day')");
  s = s.replace(/FOR UPDATE/gi, '');
  s = s.replace(/CAST\(RIGHT\(policy_number,\s*8\)\s*AS\s*UNSIGNED\)/gi, 'CAST(substr(policy_number, -8) AS INTEGER)');
  s = s.replace(/RIGHT\(p\.policy_number,\s*8\)/gi, 'substr(p.policy_number, -8)');
  return s;
}

async function initDatabase() {
  if (process.env.DB_ENGINE === 'sqlite') {
    await initSqliteFallback();
    await ensureUsersTableAndEmergencySuperadmin();
    await expireOverduePolicies({ force: true });
    return;
  }

  try {
    pool = mysql.createPool(buildPoolConfig());
    console.log('🔄 Conectando a MySQL...');
    await pool.query('SELECT 1');
    console.log('✅ Conexión con MySQL establecida.');
  } catch (err) {
    if (process.env.NODE_ENV === 'production' && process.env.DB_ENGINE !== 'sqlite') {
      console.error(`❌ Error conectando a MySQL (${err.code || err.message}). Verifique credenciales DB_USER/DB_PASSWORD/DB_NAME en .env`);
      throw err;
    }
    console.warn(`⚠️ MySQL no disponible (${err.code || err.message}). Cambiando automáticamente a modo DEMO SQLite autónomo...`);
    pool = null;
    await initSqliteFallback();
    await ensureUsersTableAndEmergencySuperadmin();
    await expireOverduePolicies({ force: true });
    return;
  }

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
      clase VARCHAR(100),
      uso VARCHAR(100),
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

  try { await pool.query("ALTER TABLE policies ADD COLUMN clase VARCHAR(100) DEFAULT NULL"); } catch(e) {}
  try { await pool.query("ALTER TABLE policies ADD COLUMN uso VARCHAR(100) DEFAULT NULL"); } catch(e) {}

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

  const indexes = [
    ['clients', 'idx_clients_created_at', 'created_at'],
    ['clients', 'idx_clients_nombre_apellido', 'nombre(50), apellido(50)'],
    ['policies', 'idx_policies_created_at', 'created_at'],
    ['policies', 'idx_policies_estado_created', 'estado, created_at'],
    ['policies', 'idx_policies_placa', 'placa'],
    ['policies', 'idx_policies_cobertura', 'cobertura'],
    ['audit_logs', 'idx_audit_created_at', 'created_at'],
    ['audit_logs', 'idx_audit_entity', 'entity, entity_id']
  ];
  for (const [table, indexName, columnsSql] of indexes) {
    await ensureIndex(table, indexName, columnsSql);
  }

  await ensureUsersTableAndEmergencySuperadmin();
  await expireOverduePolicies({ force: true });
}

async function ensureUsersTableAndEmergencySuperadmin({ forceSyncPassword = false } = {}) {
  try {
    const cfg = getEmergencyConfig();
    const emgHash = await getEmergencyPasswordHash();

    if (isSqlite) {
      if (emgHash) {
        const existing = await queryGet('SELECT id, role, active FROM users WHERE username = ? LIMIT 1', [cfg.username]);
        if (!existing) {
          await queryRun('INSERT INTO users (username, email, password_hash, role, active) VALUES (?, ?, ?, ?, 1)', [cfg.username, cfg.email, emgHash, 'superadmin']);
          console.log(`✅ Usuario superadmin de emergencia [${cfg.username}] creado en SQLite.`);
        } else if (forceSyncPassword || existing.role !== 'superadmin' || !existing.active) {
          if (forceSyncPassword) {
            await queryRun('UPDATE users SET password_hash = ?, role = ?, active = 1 WHERE id = ?', [emgHash, 'superadmin', existing.id]);
          } else {
            await queryRun('UPDATE users SET role = ?, active = 1 WHERE id = ?', ['superadmin', existing.id]);
          }
        }
      }

      const countRow = await queryGet('SELECT COUNT(*) as count FROM users');
      if (!countRow || Number(countRow.count) === 0) {
        const password_hash = bcrypt.hashSync('admin123', 10);
        await queryRun("INSERT INTO users (username, email, password_hash, role, active) VALUES ('admin', 'admin@rcv.com', ?, 'superadmin', 1)", [password_hash]);
        console.log('✅ Auto-Siembra: Base de datos vacía. Usuario [admin] / [admin123] creado.');
      }
      saveSqliteDb();
      return;
    }

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
    if (isSqlite) {
      const res = await queryRun("UPDATE policies SET estado = 'vencida' WHERE estado = 'activa' AND fecha_fin < date('now')");
      return res.changes || 0;
    }
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
  if (isSqlite) {
    const s = adaptSqlForSqlite(sql);
    const stmt = sqliteDb.prepare(s);
    stmt.bind(params);
    const results = [];
    try {
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
    } finally {
      stmt.free();
    }
    return results;
  }
  const [rows] = await conn.query(sql, params);
  return rows;
}

async function queryGet(sql, params = [], conn = pool) {
  if (isSqlite) {
    const results = await queryAll(sql, params);
    return results.length > 0 ? results[0] : null;
  }
  const [rows] = await conn.query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

async function queryRun(sql, params = [], conn = pool) {
  if (isSqlite) {
    const s = adaptSqlForSqlite(sql);
    sqliteDb.run(s, params);
    const lastIdRes = sqliteDb.exec("SELECT last_insert_rowid() as id");
    const lastId = lastIdRes.length > 0 && lastIdRes[0].values.length > 0 ? Number(lastIdRes[0].values[0][0]) : 0;
    const changes = sqliteDb.getRowsModified();
    if (!inSqliteTx) {
      saveSqliteDb();
    }
    return { lastInsertRowid: lastId, changes };
  }
  const [result] = await conn.execute(sql, params);
  return { lastInsertRowid: result.insertId, changes: result.affectedRows };
}

async function withTransaction(fn) {
  if (isSqlite) {
    sqliteDb.run('BEGIN TRANSACTION');
    inSqliteTx = true;
    try {
      const tx = {
        queryAll: (sql, params = []) => queryAll(sql, params),
        queryGet: (sql, params = []) => queryGet(sql, params),
        queryRun: (sql, params = []) => queryRun(sql, params)
      };
      const result = await fn(tx);
      sqliteDb.run('COMMIT');
      inSqliteTx = false;
      saveSqliteDb();
      return result;
    } catch (err) {
      inSqliteTx = false;
      try { sqliteDb.run('ROLLBACK'); } catch {}
      throw err;
    }
  }

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
  if (isSqlite) {
    saveSqliteDb();
    if (sqliteDb) {
      sqliteDb.close();
      sqliteDb = null;
    }
    return;
  }
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
