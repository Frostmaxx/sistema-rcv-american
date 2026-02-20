const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.resolve(process.env.DB_PATH || './db/rcv.db');
const dbDir = path.dirname(DB_PATH);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db = null;
let SQL_LIB = null;

async function initDatabase() {
  if (!SQL_LIB) {
    SQL_LIB = await initSqlJs();
  }

  // Load existing DB or create new
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL_LIB.Database(buffer);
  } else {
    db = new SQL_LIB.Database();
  }

  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'admin' CHECK(role IN ('admin', 'superadmin')),
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
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
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      policy_number TEXT UNIQUE NOT NULL,
      client_id INTEGER NOT NULL,
      tipo_vehiculo TEXT NOT NULL CHECK(tipo_vehiculo IN ('automovil', 'camioneta', 'moto', 'camion', 'bus')),
      placa TEXT NOT NULL,
      marca TEXT NOT NULL,
      modelo TEXT NOT NULL,
      anio INTEGER NOT NULL,
      color TEXT,
      serial_carroceria TEXT,
      serial_motor TEXT,
      cobertura TEXT NOT NULL,
      monto REAL NOT NULL,
      prima REAL NOT NULL,
      fecha_inicio DATE NOT NULL,
      fecha_fin DATE NOT NULL,
      estado TEXT DEFAULT 'activa' CHECK(estado IN ('activa', 'vencida', 'cancelada', 'pendiente')),
      notas TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // Coverages table for dynamic coverage management
  db.run(`
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
    )
  `);

  // Sequences table for policy number generation
  db.run(`
    CREATE TABLE IF NOT EXISTS sequences (
      name TEXT PRIMARY KEY,
      value INTEGER DEFAULT 0
    )
  `);

  try { db.run('CREATE INDEX IF NOT EXISTS idx_clients_cedula ON clients(cedula)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_policies_client ON policies(client_id)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_policies_estado ON policies(estado)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_policies_number ON policies(policy_number)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_coverages_nombre ON coverages(nombre)'); } catch(e) {}

  saveDb();
  return db;
}

function closeDatabase() {
  try {
    if (db) {
      try { saveDb(); } catch(e) {}
      try { if (typeof db.close === 'function') db.close(); } catch(e) {}
      db = null;
    }
  } catch (e) { /* ignore close errors */ }
}

function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

// Ensure DB is closed on process exit to avoid libuv handle assertion on Windows
process.on('beforeExit', () => { try { closeDatabase(); } catch(e) {} });
process.on('exit', () => { try { closeDatabase(); } catch(e) {} });

// Helper: run query and return results as array of objects
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
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

// Helper: get single row
function queryGet(sql, params = []) {
  const results = queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

// Helper: run INSERT/UPDATE/DELETE
function queryRun(sql, params = []) {
  db.run(sql, params);
  // Capture these IMMEDIATELY after db.run, before any other queries
  const lastIdResult = db.exec("SELECT last_insert_rowid() as id");
  const lastId = lastIdResult.length > 0 ? Number(lastIdResult[0].values[0][0]) : 0;
  const changes = db.getRowsModified();
  saveDb();
  return { lastInsertRowid: lastId, changes };
}

module.exports = { initDatabase, queryAll, queryGet, queryRun, getDb: () => db, closeDatabase };
