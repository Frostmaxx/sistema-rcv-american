function extractCoverageItems(coverage) {
  if (!coverage) return { items: [], totalMonto: 0, prima: 0 };
  const items = [];
  let totalMonto = 0;

  for (let i = 1; i <= 10; i++) {
    const nombre = coverage[`cob_${i}_nombre`];
    const monto = Number(coverage[`cob_${i}_monto`] || 0);
    if (nombre && String(nombre).trim()) {
      items.push({ nombre: String(nombre).trim(), monto });
      totalMonto += monto;
    }
  }

  return {
    items,
    totalMonto,
    prima: Number(coverage.prima || 0)
  };
}

async function getCoverageDetailsByName(coverageName, db, { activeOnly = true } = {}) {
  const name = String(coverageName || '').trim();
  if (!name) return { found: false, prima: 0, monto: 0, items: [] };

  const query = activeOnly
    ? 'SELECT * FROM coverages WHERE nombre = ? AND active = 1 LIMIT 1'
    : 'SELECT * FROM coverages WHERE nombre = ? LIMIT 1';
  const coverage = await db.queryGet(query, [name]);
  if (!coverage) return { found: false, prima: 0, monto: 0, items: [] };

  const { items, totalMonto, prima } = extractCoverageItems(coverage);
  return { found: true, prima, monto: totalMonto, items };
}

module.exports = { extractCoverageItems, getCoverageDetailsByName };
