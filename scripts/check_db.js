const { initDatabase, queryAll, queryGet, closeDatabase } = require('../db/database');

(async function(){
  try{
    await initDatabase();
    const policies = queryAll('SELECT id, policy_number, client_id, placa, monto, prima, estado, created_at FROM policies ORDER BY id');
    console.log('POLICIES:');
    console.log(JSON.stringify(policies, null, 2));

    const seq = queryGet('SELECT name, value FROM sequences WHERE name = ?', ['policy']);
    console.log('SEQUENCE policy:', seq);
    try { await closeDatabase(); } catch(e) {}
    return;
  }catch(err){
    console.error('ERROR', err);
    try { await closeDatabase(); } catch(e) {}
    return;
  }
})();
