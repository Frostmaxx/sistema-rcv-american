const fs = require('fs');
const path = require('path');
const { initDatabase, queryRun, queryGet, closeDatabase } = require('../db/database');

(async function main(){
  try {
    const DB_PATH = path.resolve(process.env.DB_PATH || './db/rcv.db');
    const bakPath = DB_PATH + '.bak.' + Date.now();
    fs.copyFileSync(DB_PATH, bakPath);
    console.log('Backup created at', bakPath);

    await initDatabase();

    // Delete all policies
    const del = queryRun('DELETE FROM policies');
    console.log('Deleted policies, changes:', del.changes);

    // Reset sequence 'policy' to 0 (insert if missing)
    const seq = queryGet('SELECT value FROM sequences WHERE name = ?', ['policy']);
    if (seq) {
      queryRun('UPDATE sequences SET value = ? WHERE name = ?', [0, 'policy']);
      console.log('Sequence `policy` reset to 0 (updated)');
    } else {
      queryRun('INSERT INTO sequences (name, value) VALUES (?, ?)', ['policy', 0]);
      console.log('Sequence `policy` created with value 0');
    }

    try { await closeDatabase(); } catch(e) {}
    console.log('Done.');
  } catch (err) {
    console.error('Failed:', err);
    try { await closeDatabase(); } catch(e) {}
    process.exit(1);
  }
})();
