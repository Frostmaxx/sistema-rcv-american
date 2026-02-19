(async function(){
  try{
    const { initDatabase, queryAll } = require('../db/database');
    await initDatabase();
    const rows = queryAll('SELECT p.id, p.policy_number, p.placa, p.monto, p.prima, p.fecha_inicio, p.fecha_fin, p.estado, c.nombre || " " || c.apellido as client_name FROM policies p JOIN clients c ON p.client_id = c.id ORDER BY p.created_at DESC LIMIT 50');
    console.log(JSON.stringify(rows, null, 2));
  }catch(err){
    console.error(err);
    process.exit(1);
  }
})();
