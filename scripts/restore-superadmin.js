const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { initDatabase, queryGet, closeDatabase, ensureUsersTableAndEmergencySuperadmin } = require('../db/database');
const { getEmergencyConfig } = require('../utils/emergency-admin');

async function main() {
  const cfg = getEmergencyConfig();
  if (!cfg.password && !cfg.passwordHash) {
    console.error('❌ Define EMERGENCY_SUPERADMIN_PASSWORD o EMERGENCY_SUPERADMIN_PASSWORD_HASH en .env');
    process.exit(1);
  }

  await initDatabase();
  await ensureUsersTableAndEmergencySuperadmin({ forceSyncPassword: true });
  const row = await queryGet(
    'SELECT id, username, email, role, active FROM users WHERE username = ?',
    [cfg.username]
  );
  console.log('✅ Superadmin de emergencia verificado:', row);
  await closeDatabase();
}

main().catch(async (err) => {
  console.error('❌ Error restaurando superadmin:', err);
  await closeDatabase().catch(() => {});
  process.exit(1);
});
