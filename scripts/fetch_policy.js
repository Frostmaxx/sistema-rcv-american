(async function(){
  try{
    require('dotenv').config();
    const jwt = require('jsonwebtoken');
    const { initDatabase, queryGet } = require('../db/database');

    await initDatabase();

    const user = queryGet('SELECT id, username FROM users WHERE active = 1 LIMIT 1');
    if(!user){
      console.error('No hay usuario activo en la base de datos. Crea uno o registra usuario primero.');
      process.exit(2);
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret', { expiresIn: '1h' });

    const policyId = process.argv[2] || '1';
    const url = `http://localhost:${process.env.PORT||4000}/api/policies/${policyId}`;

    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    const text = await res.text();
    console.log('HTTP', res.status);
    console.log(text);
  } catch(err){
    console.error('ERROR', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
