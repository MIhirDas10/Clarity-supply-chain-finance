const pool = require('../db');
const sheets = require('./erpGoogleSheets');
const notificationService = require('./notificationService');
const store = require('./erpLedgerStore');
const {
  ACTIVE_STATUSES,
  checkedAt,
  dateOnly,
  invoiceKey,
  issueCounts,
  normalize,
  normalizeName,
  sameMoney,
} = require('./erpUtils');

async function one(sql, params) {
  const { rows } = await pool.query(sql, params);
  return rows[0] || null;
}

async function rows(sql, params) {
  return (await pool.query(sql, params)).rows;
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
  const conn = await store.findBuyerConnection(buyerName);
  const stats = await one(
    `WITH summary AS (
       SELECT
         MAX(created_at) FILTER (WHERE target='local' AND status='success') AS last_local_success,
         MAX(created_at) FILTER (WHERE target='google' AND status='success') AS last_google_success,
         MAX(created_at) FILTER (WHERE target='google' AND status='failed') AS last_google_failure
       FROM erp_sync_log
       WHERE LOWER(buyer_name)=LOWER($1)
     )
     SELECT summary.*,
            COUNT(log.id) FILTER (
              WHERE log.target='google'
                AND log.status='failed'
                AND (summary.last_google_success IS NULL OR log.created_at > summary.last_google_success)
            )::int AS failed_google_syncs
     FROM summary
     LEFT JOIN erp_sync_log log ON LOWER(log.buyer_name)=LOWER($1)
     GROUP BY summary.last_local_success, summary.last_google_success, summary.last_google_failure`,
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

function mismatchFields(local, sheetRow) {
  return [
    !sameMoney(local.amount, sheetRow.amount) && 'amount',
    normalize(local.erp_status) !== normalize(sheetRow.erp_status) && 'status',
    normalizeName(local.supplier_name) !== normalizeName(sheetRow.supplier_name) && 'supplier',
    local.tax_amount != null && !sameMoney(local.tax_amount, sheetRow.tax_amount) && 'tax',
  ].filter(Boolean);
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
  if (!store.googleReady(conn)) return { ...empty, message: 'Google Sheets is not connected.' };

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
      await store.notifyBuyer(
        buyerName,
        `${issues.length} ERP reconciliation issue(s) were found between Clarity and Google Sheets.`,
        'erp_reconciliation',
        options.recipientEmail,
      );
    }
    return { source: 'google', issues, counts: issueCounts(issues), checked_at: checkedAt() };
  } catch (error) {
    await store.markGoogleError(conn, error);
    const issues = [{ type: 'sync_error', severity: 'high', detail: error.message }];
    return { source: 'error', issues, counts: issueCounts(issues), checked_at: checkedAt() };
  }
}

async function notifyOverduePayables(user) {
  const userId = typeof user === 'object' ? user.id : user;
  const loginEmail = typeof user === 'object' ? user.email : null;
  const conn = await store.connectionForUser(userId);
  if (!conn) return { ok: false, status: 409, reason: 'Enable the ledger first' };

  const recipient = loginEmail || conn.email;
  if (!recipient) {
    return {
      ok: false,
      status: 400,
      reason: 'Your buyer account does not have an email address.',
    };
  }

  const overdue = await one(
    `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount),0) AS amount, MIN(due_date) AS oldest_due
     FROM erp_ledger
     WHERE LOWER(buyer_name)=LOWER($1) AND erp_status=ANY($2::TEXT[]) AND due_date < CURRENT_DATE`,
    [conn.business_name, ACTIVE_STATUSES],
  );
  if (!overdue?.count) return { ok: true, sent: false, count: 0 };

  const delivery = await notificationService.sendNotification({
    recipient,
    message: `${overdue.count} payable(s) are overdue in ERP, totaling ${Number(overdue.amount).toLocaleString()}. Oldest due date: ${dateOnly(overdue.oldest_due)}.`,
    invoiceLink: '/buyer/erp',
    type: 'erp_overdue',
    emailSubject: 'Clarity B2B: Overdue Payables',
  });

  if (delivery?.error) {
    return {
      ok: false,
      status: 502,
      reason: `Overdue payables found, but email failed: ${delivery.error}`,
    };
  }

  return {
    ok: true,
    sent: Boolean(delivery?.emailSent || delivery?.simulated),
    email_sent: Boolean(delivery?.emailSent),
    simulated: Boolean(delivery?.simulated),
    notification_created: Boolean(delivery?.notificationCreated),
    count: overdue.count,
    amount: overdue.amount,
  };
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

module.exports = {
  adminSummary,
  getAgingSummary,
  getSyncHealth,
  notifyOverduePayables,
  reconcileSheetDifferences,
};
