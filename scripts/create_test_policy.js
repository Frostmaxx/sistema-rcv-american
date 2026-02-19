const { initDatabase, queryGet, queryRun, queryAll, closeDatabase } = require('../db/database');

(async function(){
  try{
    await initDatabase();

    // Ensure a test client exists (by cedula)
    const cedula = 'V-00000000';
    let client = queryGet('SELECT id FROM clients WHERE cedula = ?', [cedula]);
    if (!client) {
      const res = queryRun('INSERT INTO clients (cedula, nombre, apellido, telefono, email, direccion) VALUES (?, ?, ?, ?, ?, ?)', [cedula, 'Test', 'Client', '0000000000', 'test@example.com', 'Direccion test']);
      client = { id: res.lastInsertRowid };
      console.log('Created test client id=', client.id);
    } else {
      console.log('Using existing client id=', client.id);
    }

    // Ensure sequence exists
    let seq = queryGet('SELECT value FROM sequences WHERE name = ?', ['policy']);
    if (!seq) {
      queryRun('INSERT INTO sequences (name, value) VALUES (?, ?)', ['policy', 0]);
      seq = { value: 0 };
      console.log('Initialized sequence policy to 0');
    }

    const nextNum = Number(queryGet('SELECT value FROM sequences WHERE name = ?', ['policy']).value) + 1;
    const policyNumber = String(nextNum).padStart(8, '0');

    // Insert a minimal valid policy
    const today = new Date();
    const fecha_inicio = today.toISOString().split('T')[0];
    const nextYear = new Date(today); nextYear.setFullYear(nextYear.getFullYear()+1);
    const fecha_fin = nextYear.toISOString().split('T')[0];

    const insert = queryRun(
      `INSERT INTO policies (policy_number, client_id, tipo_vehiculo, placa, marca, modelo, anio, cobertura, monto, prima, fecha_inicio, fecha_fin, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activa')`,
      [policyNumber, client.id, 'automovil', 'TEST-000', 'Marca', 'Modelo', 2020, 'basica', 1000, 100, fecha_inicio, fecha_fin]
    );

    // update sequence
    queryRun('UPDATE sequences SET value = ? WHERE name = ?', [nextNum, 'policy']);

    const policy = queryGet('SELECT id, policy_number, prima, monto FROM policies WHERE id = ?', [insert.lastInsertRowid]);
    console.log('Inserted policy:', policy);

    try { await closeDatabase(); } catch(e) {}
  } catch (e) {
    console.error('Failed:', e);
    try { await closeDatabase(); } catch(e) {}
  }
})();
