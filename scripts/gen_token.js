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

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
    console.log(token);
  } catch(err){
    console.error('ERROR', err.message);
    process.exit(1);
  }
})();
