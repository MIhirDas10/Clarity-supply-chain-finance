const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });

const pool = require('../db');
const sheets = require('./erpGoogleSheets');
const notificationService = require('./notificationService');
const healthService = require('./supplierHealthService');

const ACTIVE_STATUSES = ['Payable', 'Funded', 'Pending', 'Overdue'];
const VALID_STATUSES = new Set([...ACTIVE_STATUSES, 'Paid', 'Disputed', 'Voided']);
const ACCOUNTING_FIELDS = ['note', 'po_number', 'gl_code', 'department', 'payment_terms', 'tax_amount'];
const MANUAL_FIELDS = ['invoice_number', 'supplier_name', 'amount', 'due_date', 'erp_status', ...ACCOUNTING_FIELDS];

const clean = (value) => (value == null ? '' : String(value).trim());
const optional = (value) => clean(value) || null;
const normalize = (value) => clean(value).toLowerCase();
const invoiceKey = (value) => normalize(value).replace(/\s+/g, '');
const checkedAt = () => new Date().toISOString();

function money(value) {
  if (value == null || value === '') return null;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function dateOnly(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function normalizeName(value) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(ltd|limited|co|company|bd)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function one(sql, params) {
  const { rows } = await pool.query(sql, params);
  return rows[0] || null;
}

async function rows(sql, params) {
  return (await pool.query(sql, params)).rows;
}

function googleReady(conn) {
  return Boolean(conn?.mode === 'google' && conn.spreadsheet_id && conn.access_token && sheets.configured());
}

function googleAuthorized(conn) {
  return Boolean(conn?.access_token && sheets.configured());
}

function erpStatusFor(invoice) {
  if (invoice.frozen_at && !['Completed', 'Voided', 'Void', 'Rejected'].includes(invoice.status)) return 'Disputed';
  if (invoice.payment_date) return 'Paid';
  if (['Funded', 'Payout Initiated', 'Matured'].includes(invoice.status)) return 'Funded';
  if (['Voided', 'Void', 'Rejected'].includes(invoice.status)) return 'Voided';

  return {
    Submitted: 'Pending',
    'Buyer Confirmed': 'Payable',
    Overdue: 'Overdue',
    Completed: 'Paid',
    Disputed: 'Disputed',
  }[invoice.status] || invoice.status || 'Pending';
}

function invoiceFields(invoice) {
  return {
    invoice_number: invoice.invoice_number || String(invoice.id),
    supplier_name: invoice.supplier_name || 'Unknown supplier',
    amount: money(invoice.invoice_amount),
    payout_amount: money(invoice.payout_amount),
    tax_amount: money(invoice.tax_amount),
    due_date: dateOnly(invoice.due_date),
    erp_status: erpStatusFor(invoice),
    note: optional(invoice.note),
    po_number: optional(invoice.po_number),
    gl_code: optional(invoice.gl_code),
    department: optional(invoice.department),
    payment_terms: optional(invoice.payment_terms),
  };
}

function ledgerFields(row) {
  return {
    invoice_number: row.invoice_number,
    supplier_name: row.supplier_name,
    amount: money(row.amount),
    payout_amount: money(row.payout_amount),
    tax_amount: money(row.tax_amount),
    due_date: dateOnly(row.due_date),
    erp_status: row.erp_status,
    note: optional(row.note),
    po_number: optional(row.po_number),
    gl_code: optional(row.gl_code),
    department: optional(row.department),
    payment_terms: optional(row.payment_terms),
  };
}

function manualFields(data, id) {
  return {
    invoice_number: optional(data.invoice_number) || `MANUAL-${id.slice(-4).toUpperCase()}`,
    supplier_name: clean(data.supplier_name),
    amount: money(data.amount),
    payout_amount: null,
    tax_amount: money(data.tax_amount),
    due_date: dateOnly(data.due_date),
    erp_status: clean(data.erp_status) || 'Payable',
    note: optional(data.note),
    po_number: optional(data.po_number),
    gl_code: optional(data.gl_code),
    department: optional(data.department),
    payment_terms: optional(data.payment_terms),
  };
}

function setField(row, key, value) {
  if (key === 'amount' || key === 'tax_amount') return money(value);
  if (key === 'due_date') return dateOnly(value);
  if (key === 'erp_status') return clean(value) || row.erp_status;
  if (key === 'invoice_number' || key === 'supplier_name') return clean(value);
  return optional(value);
}

function applyEdits(row, data, fields) {
  const next = ledgerFields(row);
  for (const key of fields) {
    if (Object.prototype.hasOwnProperty.call(data, key)) next[key] = setField(row, key, data[key]);
  }
  return next;
}

function validatePayable(data, requireCore) {
  const amount = money(data.amount);
  const tax = money(data.tax_amount);
  const status = clean(data.erp_status || 'Payable');

  if (requireCore && !clean(data.supplier_name)) return 'Supplier is required';
  if (requireCore && amount == null) return 'Amount is required';
  if (amount != null && amount <= 0) return 'Amount must be greater than zero';
  if (tax != null && tax < 0) return 'Tax/VAT cannot be negative';
  if (status && !VALID_STATUSES.has(status)) return 'Unsupported payable status';
  if (data.due_date && !dateOnly(data.due_date)) return 'Due date is invalid';
  return null;
}

async function invoiceWithSupplier(invoiceId) {
  return one(
    `SELECT i.*, COALESCE(s.name, 'Supplier #' || i.supplier_id) AS supplier_name
     FROM invoices i LEFT JOIN suppliers s ON s.id::TEXT = i.supplier_id
     WHERE i.id::TEXT = $1`,
    [String(invoiceId)],
  );
}

async function findBuyerConnection(buyerName) {
  if (!buyerName) return null;
  return one(
    `SELECT ec.*, u.business_name, u.email
     FROM erp_connections ec JOIN users u ON u.id = ec.user_id
     WHERE u.role='buyer' AND ec.status='Active' AND LOWER(u.business_name)=LOWER($1)
     ORDER BY ec.id LIMIT 1`,
    [buyerName],
  );
}

async function connectionForUser(userId) {
  return one(
    `SELECT ec.*, u.business_name, u.email
     FROM erp_connections ec JOIN users u ON u.id = ec.user_id
     WHERE ec.user_id = $1`,
    [userId],
  );
}

async function notifyBuyer(buyerName, message, type = 'erp_alert') {
  try {
    const buyer = await one("SELECT email FROM users WHERE role='buyer' AND LOWER(business_name)=LOWER($1) LIMIT 1", [buyerName]);
    await notificationService.sendNotification({
      recipient: buyer?.email || process.env.BUYER_EMAIL || 'buyer@clarity.io',
      message,
      invoiceLink: '/buyer/erp',
      type,
      emailSubject: 'Clarity B2B: ERP / Accounting Sync',
    });
  } catch (error) {
    console.error('ERP notification failed:', error.message);
  }
}

async function markGoogleOk(conn) {
  if (!conn?.id) return;
  await pool.query(
    "UPDATE erp_connections SET last_google_sync_at=NOW(), last_google_error=NULL, updated_at=NOW() WHERE id=$1",
    [conn.id],
  );
}

async function markGoogleError(conn, error) {
  if (!conn?.id) return;
  const message = clean(error?.message || error).slice(0, 500);
  await pool.query('UPDATE erp_connections SET last_google_error=$1, updated_at=NOW() WHERE id=$2', [message, conn.id]);
  if (message && message !== conn.last_google_error) {
    await notifyBuyer(conn.business_name, `Google Sheets sync failed: ${message}`, 'erp_sync_failed');
  }
}

async function logSync(entry) {
  try {
    await pool.query(
      `INSERT INTO erp_sync_log (buyer_name, invoice_id, invoice_number, action, erp_status, target, status, detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [entry.buyerName, entry.invoiceId || null, entry.invoiceNumber || null, entry.action, entry.erpStatus || null, entry.target, entry.status, entry.detail || null],
    );
  } catch (error) {
    console.error('erp_sync_log write failed:', error.message);
  }
}

async function savePlatformLedger(buyerName, invoiceId, fields) {
  const existed = await one('SELECT id FROM erp_ledger WHERE invoice_id=$1', [String(invoiceId)]);
  const row = await one(
    `INSERT INTO erp_ledger
       (buyer_name, invoice_id, invoice_number, supplier_name, amount, payout_amount, tax_amount,
        due_date, erp_status, source, note, po_number, gl_code, department, payment_terms,
        synced_to_google, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'platform',$10,$11,$12,$13,$14,FALSE,NOW())
     ON CONFLICT (invoice_id) DO UPDATE SET
       buyer_name=EXCLUDED.buyer_name,
       invoice_number=EXCLUDED.invoice_number,
       supplier_name=EXCLUDED.supplier_name,
       amount=EXCLUDED.amount,
       payout_amount=EXCLUDED.payout_amount,
       due_date=EXCLUDED.due_date,
       erp_status=EXCLUDED.erp_status,
       source='platform',
       synced_to_google=FALSE,
       updated_at=NOW()
     RETURNING *`,
    [
      buyerName, String(invoiceId), fields.invoice_number, fields.supplier_name,
      fields.amount, fields.payout_amount, fields.tax_amount, fields.due_date,
      fields.erp_status, fields.note, fields.po_number, fields.gl_code,
      fields.department, fields.payment_terms,
    ],
  );

  await logSync({
    buyerName,
    invoiceId: String(invoiceId),
    invoiceNumber: fields.invoice_number,
    action: existed ? 'update' : 'append',
    erpStatus: fields.erp_status,
    target: 'local',
    status: 'success',
  });
  return row;
}

async function pushGoogle(conn, buyerName, invoiceId, fields, action = 'update') {
  if (!googleReady(conn)) return { pushed: false };

  try {
    const rowNumber = await sheets.pushPayable(conn, fields);
    await markGoogleOk(conn);
    await pool.query(
      'UPDATE erp_ledger SET sheet_row=$1, synced_to_google=TRUE, updated_at=NOW() WHERE invoice_id=$2',
      [rowNumber, String(invoiceId)],
    );
    await logSync({ buyerName, invoiceId: String(invoiceId), invoiceNumber: fields.invoice_number, action, erpStatus: fields.erp_status, target: 'google', status: 'success', detail: rowNumber ? `row ${rowNumber}` : null });
    return { pushed: true, row: rowNumber };
  } catch (error) {
    await pool.query('UPDATE erp_ledger SET synced_to_google=FALSE WHERE invoice_id=$1', [String(invoiceId)]).catch(() => {});
    await logSync({ buyerName, invoiceId: String(invoiceId), invoiceNumber: fields.invoice_number, action, erpStatus: fields.erp_status, target: 'google', status: 'failed', detail: error.message });
    await markGoogleError(conn, error);
    return { pushed: false, error: error.message };
  }
}

async function removeGoogle(conn, buyerName, invoiceId, fields, rowNumber) {
  if (!googleReady(conn) || !rowNumber) return;

  try {
    await sheets.deletePayable(conn, rowNumber);
    await markGoogleOk(conn);
    await logSync({ buyerName, invoiceId: String(invoiceId), invoiceNumber: fields.invoice_number, action: 'remove', erpStatus: fields.erp_status, target: 'google', status: 'success', detail: 'row deleted' });
  } catch (error) {
    await logSync({ buyerName, invoiceId: String(invoiceId), invoiceNumber: fields.invoice_number, action: 'remove', erpStatus: fields.erp_status, target: 'google', status: 'failed', detail: error.message });
    await markGoogleError(conn, error);
  }
}

// Called after invoice events commit. Local ledger always updates; Google errors are logged only.
async function syncInvoiceToSheet(invoiceId) {
  try {
    const invoice = await invoiceWithSupplier(invoiceId);
    if (!invoice) return { skipped: true, reason: 'invoice not found' };

    const conn = await findBuyerConnection(invoice.buyer_name);
    if (!conn) return { skipped: true, reason: 'buyer has no ERP connection' };

    const fields = invoiceFields(invoice);
    if (conn.delete_on_dispute && fields.erp_status === 'Disputed') {
      const old = await one('SELECT sheet_row FROM erp_ledger WHERE invoice_id=$1', [String(invoice.id)]);
      await pool.query('DELETE FROM erp_ledger WHERE invoice_id=$1', [String(invoice.id)]);
      await logSync({ buyerName: invoice.buyer_name, invoiceId: String(invoice.id), invoiceNumber: fields.invoice_number, action: 'remove', erpStatus: fields.erp_status, target: 'local', status: 'success' });
      await removeGoogle(conn, invoice.buyer_name, invoice.id, fields, old?.sheet_row);
      return { ok: true, erp_status: fields.erp_status };
    }

    const saved = await savePlatformLedger(invoice.buyer_name, invoice.id, fields);
    await pushGoogle(conn, invoice.buyer_name, invoice.id, ledgerFields(saved));
    return { ok: true, erp_status: fields.erp_status };
  } catch (error) {
    console.error('syncInvoiceToSheet failed:', error.message);
    return { ok: false, error: error.message };
  }
}

async function syncWithdrawnInvoice(snapshot) {
  try {
    const conn = await findBuyerConnection(snapshot?.buyer_name);
    if (!conn) return { skipped: true, reason: 'buyer has no ERP connection' };

    const fields = { ...invoiceFields({ ...snapshot, status: 'Voided', frozen_at: null, payment_date: null }), erp_status: 'Voided' };
    const saved = await savePlatformLedger(snapshot.buyer_name, snapshot.id, fields);
    await pushGoogle(conn, snapshot.buyer_name, snapshot.id, ledgerFields(saved), 'void');
    return { ok: true, erp_status: 'Voided' };
  } catch (error) {
    console.error('syncWithdrawnInvoice failed:', error.message);
    return { ok: false, error: error.message };
  }
}

async function reconcileBuyer(userId) {
  const conn = await connectionForUser(userId);
  if (!conn?.business_name) return { synced: 0, total: 0 };

  const invoiceRows = await rows(
    'SELECT id FROM invoices WHERE LOWER(buyer_name)=LOWER($1) AND buyer_name IS NOT NULL',
    [conn.business_name],
  );

  let synced = 0;
  for (const invoice of invoiceRows) {
    const result = await syncInvoiceToSheet(invoice.id);
    if (result.ok) synced += 1;
  }

  await logSync({ buyerName: conn.business_name, action: 'backfill', target: 'local', status: 'success', detail: `${synced} invoice(s) synced` });
  return { synced, total: invoiceRows.length };
}

async function getAgingSummary(buyerName) {
  return one(
    `SELECT
       COUNT(*) FILTER (WHERE erp_status=ANY($2::TEXT[]) AND due_date > CURRENT_DATE + INTERVAL '7 days')::int AS future,
       COUNT(*) FILTER (WHERE erp_status=ANY($2::TEXT[]) AND due_date > CURRENT_DATE AND due_date <= CURRENT_DATE + INTERVAL '7 days')::int AS due_soon,
       COUNT(*) FILTER (WHERE erp_status=ANY($2::TEXT[]) AND due_date = CURRENT_DATE)::int AS due_today,
       COUNT(*) FILTER (WHERE erp_status=ANY($2::TEXT[]) AND due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - INTERVAL '30 days')::int AS overdue_1_30,
       COUNT(*) FILTER (WHERE erp_status=ANY($2::TEXT[]) AND due_date < CURRENT_DATE - INTERVAL '30 days' AND due_date >= CURRENT_DATE - INTERVAL '60 days')::int AS overdue_31_60,
       COUNT(*) FILTER (WHERE erp_status=ANY($2::TEXT[]) AND due_date < CURRENT_DATE - INTERVAL '60 days')::int AS overdue_60_plus,
       COALESCE(SUM(amount) FILTER (WHERE erp_status=ANY($2::TEXT[]) AND due_date < CURRENT_DATE),0) AS overdue_amount
     FROM erp_ledger WHERE LOWER(buyer_name)=LOWER($1)`,
    [buyerName, ACTIVE_STATUSES],
  );
}

async function getSyncHealth(buyerName) {
  const conn = await findBuyerConnection(buyerName);
  const stats = await one(
    `SELECT
       MAX(created_at) FILTER (WHERE target='local' AND status='success') AS last_local_success,
       MAX(created_at) FILTER (WHERE target='google' AND status='success') AS last_google_success,
       MAX(created_at) FILTER (WHERE target='google' AND status='failed') AS last_google_failure,
       COUNT(*) FILTER (WHERE target='google' AND status='failed')::int AS failed_google_syncs
     FROM erp_sync_log WHERE LOWER(buyer_name)=LOWER($1)`,
    [buyerName],
  );
  const pending = await one(
    'SELECT COUNT(*)::int AS count FROM erp_ledger WHERE LOWER(buyer_name)=LOWER($1) AND synced_to_google=FALSE',
    [buyerName],
  );

  return {
    ...stats,
    unsynced_rows: pending?.count || 0,
    last_google_error: conn?.last_google_error || null,
    spreadsheet_url: sheets.spreadsheetUrl(conn?.spreadsheet_id),
  };
}

function sameMoney(left, right) {
  if (left == null && right == null) return true;
  return Math.abs((Number(left) || 0) - (Number(right) || 0)) < 0.01;
}

function mismatchFields(local, sheetRow) {
  return [
    !sameMoney(local.amount, sheetRow.amount) && 'amount',
    normalize(local.erp_status) !== normalize(sheetRow.erp_status) && 'status',
    normalizeName(local.supplier_name) !== normalizeName(sheetRow.supplier_name) && 'supplier',
    local.tax_amount != null && !sameMoney(local.tax_amount, sheetRow.tax_amount) && 'tax',
  ].filter(Boolean);
}

function issueCounts(issues) {
  return {
    missing: issues.filter((issue) => issue.type === 'missing_in_sheet').length,
    mismatched: issues.filter((issue) => issue.type === 'mismatch').length,
    extra: issues.filter((issue) => issue.type === 'extra_in_sheet').length,
  };
}

async function localLedgerRows(buyerName) {
  return rows(
    `SELECT invoice_id, invoice_number, supplier_name, amount, payout_amount, tax_amount,
            TO_CHAR(due_date,'YYYY-MM-DD') AS due_date, erp_status
     FROM erp_ledger WHERE LOWER(buyer_name)=LOWER($1)
     ORDER BY updated_at DESC`,
    [buyerName],
  );
}

async function reconcileSheetDifferences(conn, buyerName, options = {}) {
  const localRows = await localLedgerRows(buyerName);
  const empty = { source: 'local', issues: [], counts: issueCounts([]), checked_at: checkedAt() };
  if (!googleReady(conn)) return { ...empty, message: 'Google Sheets is not connected.' };

  try {
    const sheetRows = await sheets.readPayables(conn);
    const localByInvoice = new Map(localRows.map((row) => [invoiceKey(row.invoice_number), row]));
    const sheetByInvoice = new Map(sheetRows.map((row) => [invoiceKey(row.invoice_number), row]));
    const issues = [];

    for (const local of localRows) {
      const sheetRow = sheetByInvoice.get(invoiceKey(local.invoice_number));
      if (!sheetRow) {
        issues.push({ type: 'missing_in_sheet', severity: 'high', invoice_id: local.invoice_id, invoice_number: local.invoice_number, detail: 'Exists in Clarity but not in Google Sheets.' });
        continue;
      }
      const fields = mismatchFields(local, sheetRow);
      if (fields.length) {
        issues.push({ type: 'mismatch', severity: 'medium', invoice_id: local.invoice_id, invoice_number: local.invoice_number, fields, detail: `${fields.join(', ')} differ from Google Sheets row ${sheetRow.rowNumber}.` });
      }
    }

    for (const sheetRow of sheetRows) {
      if (!localByInvoice.has(invoiceKey(sheetRow.invoice_number))) {
        issues.push({ type: 'extra_in_sheet', severity: 'medium', rowNumber: sheetRow.rowNumber, invoice_number: sheetRow.invoice_number, detail: 'Exists in Google Sheets but not in Clarity.' });
      }
    }

    if (options.notify && issues.length) {
      await notifyBuyer(buyerName, `${issues.length} ERP reconciliation issue(s) were found between Clarity and Google Sheets.`, 'erp_reconciliation');
    }
    return { source: 'google', issues, counts: issueCounts(issues), checked_at: checkedAt() };
  } catch (error) {
    await markGoogleError(conn, error);
    const issues = [{ type: 'sync_error', severity: 'high', detail: error.message }];
    return { source: 'error', issues, counts: issueCounts(issues), checked_at: checkedAt() };
  }
}

async function retryFailedGoogleSyncs(userId) {
  const conn = await connectionForUser(userId);
  if (!conn) return { ok: false, status: 409, reason: 'Enable the ledger first' };
  if (!googleReady(conn)) return { ok: false, status: 409, reason: 'Connect Google Sheets first' };

  const retryRows = await rows(
    `SELECT * FROM erp_ledger
     WHERE LOWER(buyer_name)=LOWER($1)
       AND (synced_to_google=FALSE OR invoice_id IN (
         SELECT invoice_id FROM erp_sync_log
         WHERE LOWER(buyer_name)=LOWER($1) AND target='google' AND status='failed' AND invoice_id IS NOT NULL
       ))
     ORDER BY updated_at DESC LIMIT 100`,
    [conn.business_name],
  );

  let synced = 0;
  for (const row of retryRows) {
    const result = await pushGoogle(conn, conn.business_name, row.invoice_id, ledgerFields(row), 'retry');
    if (result.pushed) synced += 1;
  }
  return { ok: true, attempted: retryRows.length, synced, failed: retryRows.length - synced };
}

async function notifyOverduePayables(userId) {
  const conn = await connectionForUser(userId);
  if (!conn) return { ok: false, status: 409, reason: 'Enable the ledger first' };

  const overdue = await one(
    `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount),0) AS amount, MIN(due_date) AS oldest_due
     FROM erp_ledger
     WHERE LOWER(buyer_name)=LOWER($1) AND erp_status=ANY($2::TEXT[]) AND due_date < CURRENT_DATE`,
    [conn.business_name, ACTIVE_STATUSES],
  );
  if (!overdue?.count) return { ok: true, sent: false, count: 0 };

  await notificationService.sendNotification({
    recipient: conn.email || process.env.BUYER_EMAIL || 'buyer@clarity.io',
    message: `${overdue.count} payable(s) are overdue in ERP, totaling ${Number(overdue.amount).toLocaleString()}. Oldest due date: ${dateOnly(overdue.oldest_due)}.`,
    invoiceLink: '/buyer/erp',
    type: 'erp_overdue',
    emailSubject: 'Clarity B2B: Overdue Payables',
  });
  return { ok: true, sent: true, count: overdue.count, amount: overdue.amount };
}

async function adminSummary() {
  return rows(
    `WITH ledger AS (
       SELECT LOWER(buyer_name) AS buyer_key,
              COUNT(*)::int AS total_rows,
              COALESCE(SUM(amount) FILTER (WHERE erp_status=ANY($1::TEXT[])),0) AS outstanding,
              COUNT(*) FILTER (WHERE erp_status='Disputed')::int AS disputed,
              COUNT(*) FILTER (WHERE erp_status=ANY($1::TEXT[]) AND due_date < CURRENT_DATE)::int AS overdue
       FROM erp_ledger GROUP BY LOWER(buyer_name)
     ), syncs AS (
       SELECT LOWER(buyer_name) AS buyer_key,
              COUNT(*) FILTER (WHERE target='google' AND status='failed')::int AS failed_syncs
       FROM erp_sync_log GROUP BY LOWER(buyer_name)
     )
     SELECT u.id, u.business_name, u.email, ec.mode, ec.spreadsheet_id,
            ec.last_google_sync_at, ec.last_google_error, ec.updated_at,
            COALESCE(l.total_rows,0) AS total_rows,
            COALESCE(l.outstanding,0) AS outstanding,
            COALESCE(l.disputed,0) AS disputed,
            COALESCE(l.overdue,0) AS overdue,
            COALESCE(s.failed_syncs,0) AS failed_syncs
     FROM erp_connections ec
     JOIN users u ON u.id = ec.user_id
     LEFT JOIN ledger l ON l.buyer_key=LOWER(u.business_name)
     LEFT JOIN syncs s ON s.buyer_key=LOWER(u.business_name)
     WHERE u.role='buyer'
     ORDER BY ec.updated_at DESC`,
    [ACTIVE_STATUSES],
  );
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
  if (!googleReady(conn)) return { source: 'none', rows: [] };
  try {
    return { source: 'google', rows: await sheets.readSuppliers(conn) };
  } catch (error) {
    await markGoogleError(conn, error);
    return { source: `error:${error.message}`, rows: [] };
  }
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
  const masterCounts = master.rows.reduce((map, row) => map.set(normalizeName(row.name), (map.get(normalizeName(row.name)) || 0) + 1), new Map());
  const sheetDuplicates = [...new Set(master.rows.filter((row) => masterCounts.get(normalizeName(row.name)) > 1).map((row) => row.name))];

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
      reason: match.status === 'exact' ? 'Exact supplier master match'
        : match.status === 'fuzzy' ? 'Possible naming mismatch'
        : master.source === 'google' ? 'Missing from supplier master'
        : 'Google supplier master not connected',
      healthScore: healthRow?.score ?? null,
      healthBand: healthRow?.band ?? null,
    };
  });

  return { source: master.source, sheetCount: master.rows.length, sheetDuplicates, suppliers };
}

async function duplicateInvoice(buyerName, invoiceNumber, exceptInvoiceId) {
  return Boolean(await one(
    `SELECT id FROM erp_ledger
     WHERE LOWER(buyer_name)=LOWER($1) AND LOWER(invoice_number)=LOWER($2)
       AND ($3::TEXT IS NULL OR invoice_id<>$3)
     LIMIT 1`,
    [buyerName, invoiceNumber, exceptInvoiceId || null],
  ));
}

async function createManualPayable(buyerName, data) {
  const validation = validatePayable(data, true);
  if (validation) return { ok: false, status: 400, reason: validation };

  const id = `manual-${crypto.randomBytes(8).toString('hex')}`;
  const fields = manualFields(data, id);
  if (await duplicateInvoice(buyerName, fields.invoice_number)) {
    return { ok: false, status: 409, reason: 'A payable with that invoice/reference already exists' };
  }

  const row = await one(
    `INSERT INTO erp_ledger
       (buyer_name, invoice_id, invoice_number, supplier_name, amount, payout_amount, tax_amount,
        due_date, erp_status, source, note, po_number, gl_code, department, payment_terms,
        synced_to_google, updated_at)
     VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,$8,'manual',$9,$10,$11,$12,$13,FALSE,NOW())
     RETURNING *`,
    [
      buyerName, id, fields.invoice_number, fields.supplier_name, fields.amount,
      fields.tax_amount, fields.due_date, fields.erp_status, fields.note,
      fields.po_number, fields.gl_code, fields.department, fields.payment_terms,
    ],
  );

  await logSync({ buyerName, invoiceId: id, invoiceNumber: fields.invoice_number, action: 'create', erpStatus: fields.erp_status, target: 'local', status: 'success', detail: 'manual payable' });
  await pushGoogle(await findBuyerConnection(buyerName), buyerName, id, ledgerFields(row), 'create');
  return { ok: true, row: { invoice_id: id, source: 'manual', ...fields } };
}

async function updateLedgerRow(buyerName, invoiceId, data) {
  const current = await one('SELECT * FROM erp_ledger WHERE invoice_id=$1 AND LOWER(buyer_name)=LOWER($2)', [invoiceId, buyerName]);
  if (!current) return { ok: false, status: 404, reason: 'Row not found' };

  const manual = current.source === 'manual';
  const next = applyEdits(current, data, manual ? MANUAL_FIELDS : ACCOUNTING_FIELDS);
  const validation = validatePayable(next, manual);
  if (validation) return { ok: false, status: 400, reason: validation };
  if (manual && await duplicateInvoice(buyerName, next.invoice_number, invoiceId)) {
    return { ok: false, status: 409, reason: 'A payable with that invoice/reference already exists' };
  }

  const row = await one(
    `UPDATE erp_ledger
     SET invoice_number=$1, supplier_name=$2, amount=$3, due_date=$4, erp_status=$5,
         note=$6, po_number=$7, gl_code=$8, department=$9, payment_terms=$10,
         tax_amount=$11, synced_to_google=FALSE, updated_at=NOW()
     WHERE invoice_id=$12
     RETURNING *`,
    [
      next.invoice_number, next.supplier_name, next.amount, next.due_date,
      next.erp_status, next.note, next.po_number, next.gl_code,
      next.department, next.payment_terms, next.tax_amount, invoiceId,
    ],
  );

  await logSync({ buyerName, invoiceId, invoiceNumber: next.invoice_number, action: 'update', erpStatus: next.erp_status, target: 'local', status: 'success', detail: manual ? 'manual edit' : 'accounting metadata edit' });
  await pushGoogle(await findBuyerConnection(buyerName), buyerName, invoiceId, ledgerFields(row));
  return { ok: true };
}

async function deleteLedgerRow(buyerName, invoiceId) {
  const row = await one('SELECT * FROM erp_ledger WHERE invoice_id=$1 AND LOWER(buyer_name)=LOWER($2)', [invoiceId, buyerName]);
  if (!row) return { ok: false, status: 404, reason: 'Row not found' };
  if (row.source !== 'manual') return { ok: false, status: 409, reason: 'Platform-synced rows are managed automatically and cannot be deleted here.' };

  await pool.query('DELETE FROM erp_ledger WHERE invoice_id=$1', [invoiceId]);
  await logSync({ buyerName, invoiceId, invoiceNumber: row.invoice_number, action: 'delete', erpStatus: 'Removed', target: 'local', status: 'success', detail: 'manual payable removed' });
  await removeGoogle(await findBuyerConnection(buyerName), buyerName, invoiceId, ledgerFields(row), row.sheet_row);
  return { ok: true };
}

async function createAccountingSpreadsheet(userId) {
  const conn = await connectionForUser(userId);
  if (!conn) return { ok: false, status: 409, reason: 'Enable the ledger first' };
  if (!googleAuthorized(conn)) return { ok: false, status: 409, reason: 'Connect Google Sheets first' };

  try {
    const created = await sheets.createTemplate(conn);
    await pool.query(
      `UPDATE erp_connections
       SET mode='google', spreadsheet_id=$1, ap_sheet='Accounts Payable',
           supplier_sheet='Suppliers', updated_at=NOW()
       WHERE id=$2`,
      [created.spreadsheet_id, conn.id],
    );
    await markGoogleOk({ ...conn, spreadsheet_id: created.spreadsheet_id });
    return { ok: true, ...created };
  } catch (error) {
    await markGoogleError(conn, error);
    return { ok: false, status: 502, reason: error.message };
  }
}

module.exports = {
  configured: sheets.configured,
  oauthState: sheets.oauthState,
  accessToken: sheets.accessToken,
  GOOGLE_SHEETS_SCOPE: sheets.GOOGLE_SHEETS_SCOPE,
  syncInvoiceToSheet,
  syncWithdrawnInvoice,
  reconcileBuyer,
  retryFailedGoogleSyncs,
  reconcileSheetDifferences,
  notifyOverduePayables,
  getAgingSummary,
  getSyncHealth,
  fetchSupplierCrossReference,
  findBuyerConnection,
  connectionForUser,
  adminSummary,
  erpStatusFor,
  createManualPayable,
  updateLedgerRow,
  deleteLedgerRow,
  createAccountingSpreadsheet,
};
