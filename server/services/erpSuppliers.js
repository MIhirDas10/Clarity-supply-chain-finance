const pool = require('../db');
const sheets = require('./erpGoogleSheets');
const healthService = require('./supplierHealthService');
const store = require('./erpLedgerStore');
const { clean, normalizeName } = require('./erpUtils');

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

function latestTimestamp(left, right) {
  const leftTime = left ? new Date(left).getTime() : 0;
  const rightTime = right ? new Date(right).getTime() : 0;
  if (!leftTime) return right || left;
  if (!rightTime) return left;
  return rightTime > leftTime ? right : left;
}

function mergeSupplierRows(groups) {
  const suppliers = new Map();

  for (const row of groups.flat()) {
    const name = clean(row.name);
    if (!name) continue;

    const supplierId = clean(row.supplier_id || row.supplierId);
    const key = normalizeName(name) || `id:${supplierId}`;
    const next = {
      supplier_id: supplierId,
      supplierId,
      name,
      contact: clean(row.contact),
      status: clean(row.status) || 'Active',
      last_updated: row.last_updated || row.lastUpdated || null,
      invoiceCount: Number(row.invoice_count || row.invoiceCount || 0),
    };

    const current = suppliers.get(key);
    if (!current) {
      suppliers.set(key, next);
      continue;
    }

    current.supplier_id = current.supplier_id || next.supplier_id;
    current.supplierId = current.supplier_id;
    current.contact = current.contact || next.contact;
    current.status = current.status && current.status !== 'Active' ? current.status : next.status;
    current.last_updated = latestTimestamp(current.last_updated, next.last_updated);
    current.invoiceCount += next.invoiceCount;
  }

  return [...suppliers.values()]
    .map((row) => ({ ...row, lastUpdated: row.last_updated }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function databaseSupplierMasterRows(buyerName) {
  const [accountRows, seededRows, aliasRows, invoiceRows] = await Promise.all([
    rows(
      `SELECT id::text AS supplier_id, business_name AS name, email AS contact,
              status, COALESCE(approved_at, created_at, NOW()) AS last_updated,
              0::int AS invoice_count
       FROM users
       WHERE role='supplier'
       ORDER BY business_name`,
    ),
    rows(
      `SELECT s.id::text AS supplier_id, s.name,
              COALESCE(u.email, '') AS contact,
              COALESCE(u.status, 'Active') AS status,
              NOW() AS last_updated,
              0::int AS invoice_count
       FROM suppliers s
       LEFT JOIN users u ON u.role='supplier' AND LOWER(u.business_name)=LOWER(s.name)
       ORDER BY s.name`,
    ),
    rows(
      `SELECT sn.supplier_id::text AS supplier_id, sn.name,
              COALESCE(u.email, '') AS contact,
              COALESCE(u.status, 'Active') AS status,
              NOW() AS last_updated,
              0::int AS invoice_count
       FROM supplier_names sn
       LEFT JOIN users u ON u.role='supplier' AND LOWER(u.business_name)=LOWER(sn.name)
       ORDER BY sn.name`,
    ),
    rows(
      `SELECT i.supplier_id::text AS supplier_id,
              COALESCE(account_user.business_name, named_user.business_name, supplier.name, alias.name, 'Supplier #' || i.supplier_id) AS name,
              COALESCE(account_user.email, named_user.email, '') AS contact,
              COALESCE(account_user.status, named_user.status, 'Active') AS status,
              MAX(COALESCE(i.created_at, i.submitted_date::timestamptz, NOW())) AS last_updated,
              COUNT(*)::int AS invoice_count
       FROM invoices i
       LEFT JOIN users account_user
         ON account_user.role='supplier' AND account_user.id::text=i.supplier_id
       LEFT JOIN suppliers supplier
         ON supplier.id::text=i.supplier_id
       LEFT JOIN supplier_names alias
         ON alias.supplier_id=i.supplier_id
       LEFT JOIN users named_user
         ON named_user.role='supplier'
        AND supplier.name IS NOT NULL
        AND LOWER(named_user.business_name)=LOWER(supplier.name)
       WHERE i.supplier_id IS NOT NULL
         AND ($1::text IS NULL OR LOWER(i.buyer_name)=LOWER($1))
       GROUP BY i.supplier_id, account_user.business_name, named_user.business_name,
                supplier.name, alias.name, account_user.email, named_user.email,
                account_user.status, named_user.status
       ORDER BY name`,
      [buyerName || null],
    ),
  ]);

  return mergeSupplierRows([invoiceRows, accountRows, seededRows, aliasRows]);
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
  const platformRows = await databaseSupplierMasterRows(buyerName);
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
      invoiceCount: row.invoiceCount || 0,
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

async function syncSupplierMaster(conn, buyerName) {
  if (!conn) return { ok: false, status: 409, reason: 'Enable the ledger first' };
  if (!store.googleReady(conn)) return { ok: false, status: 409, reason: 'Connect Google Sheets first' };

  const supplierRows = await databaseSupplierMasterRows(buyerName);
  try {
    const result = await sheets.replaceSuppliers(conn, supplierRows);
    await store.markGoogleOk(conn);
    await store.logSync({
      buyerName,
      action: 'supplier master',
      target: 'google',
      status: 'success',
      detail: `${result.count} supplier(s) synced`,
    });
    return { ok: true, ...result };
  } catch (error) {
    await store.logSync({
      buyerName,
      action: 'supplier master',
      target: 'google',
      status: 'failed',
      detail: error.message,
    });
    await store.markGoogleError(conn, error);
    return { ok: false, status: 502, reason: error.message };
  }
}

module.exports = {
  databaseSupplierMasterRows,
  fetchSupplierCrossReference,
  syncSupplierMaster,
};
