const { initDatabase, queryAll, queryGet, queryRun, closeDatabase } = require('../db/database');

(async function migrate() {
  try {
    await initDatabase();

    // Ensure global 'policy' sequence exists and initialize from current max
    let seq = queryGet('SELECT value FROM sequences WHERE name = ?', ['policy']);
    if (!seq) {
      const maxRow = queryGet(`SELECT MAX(CAST(CASE WHEN INSTR(policy_number, '-')>0 THEN SUBSTR(policy_number, -8) ELSE policy_number END AS INTEGER)) as maxNum FROM policies`);
      const startVal = maxRow && maxRow.maxNum ? Number(maxRow.maxNum) : 0;
      queryRun('INSERT INTO sequences (name, value) VALUES (?, ?)', ['policy', startVal]);
      seq = { value: startVal };
      console.log('Initialized sequence `policy` with', startVal);
    } else {
      console.log('Existing sequence `policy` value:', seq.value);
    }

    const policies = queryAll('SELECT id, policy_number FROM policies ORDER BY id');
    let updated = 0;
    for (const p of policies) {
      const current = String(p.policy_number || '').trim();
      if (/^\d{8}$/.test(current)) {
        // already numeric 8-digit
        continue;
      }

      // assign next sequence number
      const nextNum = Number(queryGet('SELECT value FROM sequences WHERE name = ?', ['policy']).value) + 1;
      const newPolicyNum = String(nextNum).padStart(8, '0');

      // update policy number
      queryRun('UPDATE policies SET policy_number = ? WHERE id = ?', [newPolicyNum, p.id]);
      // bump sequence
      queryRun('UPDATE sequences SET value = ? WHERE name = ?', [nextNum, 'policy']);

      updated++;
      console.log(`Updated policy id=${p.id} ${current} -> ${newPolicyNum}`);
    }

    console.log(`Migration complete. Policies updated: ${updated}`);
    try { await closeDatabase(); } catch(e) {}
    return;
  } catch (err) {
    console.error('Migration failed:', err);
    try { await closeDatabase(); } catch(e) {}
    return;
  }
})();
