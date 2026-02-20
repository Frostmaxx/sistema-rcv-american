const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

let pool;

async function initDatabase() {
  // 1. Crear el pool de conexiones a MySQL
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'rcv_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  console.log('🔄 Conectando a MySQL...');

  // 2. Crear Tablas (Sintaxis MySQL)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'admin',
      active TINYINT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

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

  // 3. Auto-Siembra
  try {
    const [rows] = await pool.query("SELECT COUNT(*) as count FROM users");
    if (rows[0].count === 0) {
      const password_hash = bcrypt.hashSync('admin123', 10);
      await pool.query(
        "INSERT INTO users (username, email, password_hash, role, active) VALUES ('admin', 'admin@rcv.com', ?, 'superadmin', 1)",
        [password_hash]
      );
      console.log('✅ Auto-Siembra: Base de datos vacía. Usuario [admin] / [admin123] creado.');
    }
  } catch (err) {
    console.log('⚠️ Omitiendo auto-siembra:', err.message);
  }

  return pool;
}

// 4. Funciones Helper Asíncronas
async function queryAll(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function queryGet(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

async function queryRun(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return { lastInsertRowid: result.insertId, changes: result.affectedRows };
}

function closeDatabase() {
  if (pool) pool.end();
}

module.exports = { initDatabase, queryAll, queryGet, queryRun, closeDatabase };