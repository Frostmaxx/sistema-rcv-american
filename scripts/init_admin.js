const bcrypt = require('bcryptjs');
const { initDatabase, queryRun } = require('../db/database');

async function createAdmin() {
  await initDatabase();
  const username = 'admin'; // Cambia esto si lo deseas
  const email = 'admin@rcv.com';
  const password = 'Password123!'; // Cambia esto por una clave segura
  const password_hash = bcrypt.hashSync(password, 10);

  try {
    queryRun(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email, password_hash, 'superadmin']
    );
    console.log('✅ Súper Administrador creado con éxito.');
  } catch (e) {
    console.log('⚠️ El administrador ya existe o hubo un error:', e.message);
  }
  process.exit();
}
createAdmin();