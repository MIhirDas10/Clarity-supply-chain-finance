const pool = require('../db');
const sheets = require('./erpGoogleSheets');
const healthService = require('./supplierHealthService');
const store = require('./erpLedgerStore');
const { normalizeName } = require('./erpUtils');

async function rows(sql, params) {
  return (await pool.query(sql, params)).rows;
}

function nameScore(left, right) {
  const a = normalizeName(left).split(' ').filter(Boolean);
  const b = normalizeName(right).split(' ').filter(Boolean);
  if (!a.length || !b.length) return 0;
  return a.filter((token) => b.includes(token)).length / Math.max(a.length, b.length);
}

function bestSupplierMatch(name, supplierRows) {
  const exact = supplierRows.find((row) => normalizeName(row.name) === normalizeName(name));
  if (exact) return { status: 'exact', matchedTo: exact.name, score: 1 };

  const best = supplierRows
    .map((row) => ({ status: 'fuzzy', matchedTo: row.name, score: nameScore(name, row.name) }))
    .sort((a, b) => b.score - a.score)[0];

  return best?.score >= 0.6 ? best : { status: 'missing', matchedTo: null, score: 0 };
}

async function supplierMasterRows(conn) {
  if (!store.googleReady(conn)) return { source: 'none', rows: [] };

  try {
    return { source: 'google', rows: await sheets.readSuppliers(conn) };
  } catch (error) {
    await store.markGoogleError(conn, error);
    return { source: `error:${error.message}`, rows: [] };
  }
}

function duplicateNames(supplierRows) {
  const counts = supplierRows.reduce((map, row) => {
    const key = normalizeName(row.name);
    return map.set(key, (map.get(key) || 0) + 1);
  }, new Map());

  return [...new Set(supplierRows.filter((row) => counts.get(normalizeName(row.name)) > 1).map((row) => row.name))];
}

function supplierReason(match, source) {
  if (match.status === 'exact') return 'Exact supplier master match';
  if (match.status === 'fuzzy') return 'Possible naming mismatch';
  if (source === 'google') return 'Missing from supplier master';
  return 'Google supplier master not connected';
}

async function fetchSupplierCrossReference(conn, buyerName) {
  const platformRows = await rows(
    `SELECT DISTINCT i.supplier_id, COALESCE(s.name, 'Supplier #' || i.supplier_id) AS name
     FROM invoices i LEFT JOIN suppliers s ON s.id::TEXT=i.supplier_id
     WHERE LOWER(i.buyer_name)=LOWER($1)`,
    [buyerName],
  );
  const master = await supplierMasterRows(conn);

  let health = [];
  try { health = await healthService.computeHealth(buyerName); } catch (_) {}

  const healthById = new Map(health.map((row) => [String(row.id), row]));
  const healthByName = new Map(health.map((row) => [normalizeName(row.name), row]));
  const suppliers = platformRows.filter((row) => row.name).map((row) => {
    const match = master.source === 'google' ? bestSupplierMatch(row.name, master.rows) : { status: 'local', matchedTo: null, score: 0 };
    const healthRow = healthById.get(String(row.supplier_id)) || healthByName.get(normalizeName(row.name));

    return {
      supplier: row.name,
      supplierId: row.supplier_id,
      inBuyerBooks: match.status === 'exact' || match.status === 'fuzzy',
      matchStatus: match.status,
      matchedTo: match.matchedTo,
      matchScore: Math.round(match.score * 100),
      reason: supplierReason(match, master.source),
      healthScore: healthRow?.score ?? null,
      healthBand: healthRow?.band ?? null,
    };
  });

  return {
    source: master.source,
    sheetCount: master.rows.length,
    sheetDuplicates: duplicateNames(master.rows),
    suppliers,
  };
}

module.exports = { fetchSupplierCrossReference };
