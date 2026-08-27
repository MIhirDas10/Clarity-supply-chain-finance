const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const pool = require('../db');
const sheets = require('./erpGoogleSheets');
const notificationService = require('./notificationService');
const {
  ACCOUNTING_FIELDS,
  MANUAL_FIELDS,
  VALID_STATUSES,
  clean,
  dateOnly,
  money,
  optional,
} = require('./erpUtils');

let schemaPromise;

function ensureSchema() {
  if (!schemaPromise) {
    const sql = fs.readFileSync(path.join(__dirname, '../sql/erp_migration.sql'), 'utf8');
    schemaPromise = pool.query(sql).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
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

function applyEdits(row, data, allowedFields) {
  const next = ledgerFields(row);
  for (const key of allowedFields) {
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

async function invoiceIdsForBuyer(buyerName) {
  return rows(
    'SELECT id FROM invoices WHERE LOWER(buyer_name)=LOWER($1) AND buyer_name IS NOT NULL',
    [buyerName],
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

async function removeLocalLedger(buyerName, invoiceId, fields) {
  const old = await one('SELECT sheet_row FROM erp_ledger WHERE invoice_id=$1', [String(invoiceId)]);
  await pool.query('DELETE FROM erp_ledger WHERE invoice_id=$1', [String(invoiceId)]);
  await logSync({
    buyerName,
    invoiceId: String(invoiceId),
    invoiceNumber: fields.invoice_number,
    action: 'remove',
    erpStatus: fields.erp_status,
    target: 'local',
    status: 'success',
  });
  return old?.sheet_row || null;
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
  connectionForUser,
  createAccountingSpreadsheet,
  createManualPayable,
  deleteLedgerRow,
  ensureSchema,
  erpStatusFor,
  findBuyerConnection,
  googleReady,
  invoiceFields,
  invoiceIdsForBuyer,
  invoiceWithSupplier,
  ledgerFields,
  logSync,
  markGoogleError,
  markGoogleOk,
  notifyBuyer,
  pushGoogle,
  removeGoogle,
  removeLocalLedger,
  retryFailedGoogleSyncs,
  savePlatformLedger,
  updateLedgerRow,
};
