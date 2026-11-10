const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const RETENTION_DAYS = 14;

function findDumpBinary() {
  const candidates = [
    'mariadb-dump',
    'mysqldump',
    'C:\\Program Files\\MariaDB 13.0\\bin\\mariadb-dump.exe',
    'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe'
  ];
  for (const bin of candidates) {
    if (bin.includes('\\') && fs.existsSync(bin)) return bin;
    if (!bin.includes('\\')) {
      try {
        execFileSync(bin, ['--version'], { stdio: 'ignore' });
        return bin;
      } catch {}
    }
  }
  return null;
}

function main() {
  const bin = findDumpBinary();
  if (!bin) {
    console.error('❌ No se encontró mariadb-dump ni mysqldump en el sistema.');
    process.exit(1);
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outFile = path.join(BACKUP_DIR, `rcv_backup_${stamp}.sql`);

  const args = [
    `-h${process.env.DB_HOST || 'localhost'}`,
    `-P${process.env.DB_PORT || '3306'}`,
    `-u${process.env.DB_USER || 'root'}`,
    '--single-transaction',
    '--quick',
    process.env.DB_NAME || 'rcv_db'
  ];
  const env = { ...process.env };
  if (process.env.DB_PASSWORD) {
    env.MYSQL_PWD = process.env.DB_PASSWORD;
  }

  const sql = execFileSync(bin, args, { env, maxBuffer: 50 * 1024 * 1024 });
  fs.writeFileSync(outFile, sql);
  console.log(`✅ Respaldo generado: ${outFile} (${sql.length} bytes)`);

  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const file of fs.readdirSync(BACKUP_DIR)) {
    const full = path.join(BACKUP_DIR, file);
    if (file.endsWith('.sql') && fs.statSync(full).mtimeMs < cutoff) {
      fs.unlinkSync(full);
    }
  }
}

main();
