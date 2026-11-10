const { queryRun } = require('../db/database');

async function logAudit({ req = null, userId = null, username = null, action, entity, entityId = null, details = null }) {
  try {
    const actorId = userId !== null ? userId : (req?.user?.id > 0 ? req.user.id : null);
    const actorName = username || req?.user?.username || 'system';
    const ip = req ? (req.ip || req.socket?.remoteAddress || null) : null;
    const serialized = details && typeof details !== 'string' ? JSON.stringify(details) : details;

    await queryRun(
      `INSERT INTO audit_logs (user_id, username, action, entity, entity_id, details, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [actorId, String(actorName).slice(0, 100), action, entity, entityId !== null ? String(entityId) : null, serialized, ip]
    );
  } catch (err) {
    console.error('Error registrando auditoría:', err.message);
  }
}

module.exports = { logAudit };
