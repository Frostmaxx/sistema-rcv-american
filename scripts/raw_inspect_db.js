const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

(async function(){
  try{
    const DB_PATH = path.resolve(process.env.DB_PATH || './db/rcv.db');
    if (!fs.existsSync(DB_PATH)) { console.error('DB file not found at', DB_PATH); return; }
    const buffer = fs.readFileSync(DB_PATH);
    const SQL = await initSqlJs();
    const db = new SQL.Database(new Uint8Array(buffer));

    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    console.log('TABLES:', tables);

    const policies = db.exec('SELECT id, policy_number, client_id, placa, monto, prima, estado, created_at FROM policies');
    console.log('POLICIES RAW:', JSON.stringify(policies, null, 2));

    const seq = db.exec("SELECT name, value FROM sequences WHERE name='policy'");
    console.log('SEQUENCE RAW:', JSON.stringify(seq, null, 2));

    try { if (typeof db.close === 'function') db.close(); } catch(e) {}
    return;
  }catch(e){ console.error('ERR', e); return; }
})();
