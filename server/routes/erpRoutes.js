// Clarity - ERP / Accounting Integration (Google Sheets)  - Mihir Das (SL 2)
//
// Buyer-facing endpoints for the accounts-payable ledger that mirrors the
// invoice lifecycle. The ledger works purely in-app (mode 'local'); connecting
// Google Sheets (mode 'google') additionally pushes every change to the buyer's
// real spreadsheet. OAuth mirrors the calendar integration.
//
//   GET    /api/erp/status              connection + configured flag + summary
//   GET    /api/erp/ledger              live accounts-payable rows (the table)
//   GET    /api/erp/log                 recent sync activity
//   POST   /api/erp/enable              turn on the in-app ledger + backfill
//   POST   /api/erp/config              set spreadsheet id / tab names / options
//   GET    /api/erp/connect             start Google Sheets OAuth
//   GET    /api/erp/oauth/callback      OAuth redirect target (no auth)
//   DELETE /api/erp/disconnect          remove the connection
//   POST   /api/erp/sync/:invoiceId     manually sync one invoice
//   POST   /api/erp/reconcile           re-sync all of the buyer's invoices
//   GET    /api/erp/suppliers           cross-reference supplier list
//   POST   /api/erp/suppliers/sync      refresh the Google supplier master tab

const express = require('express');
const https = require('https');
const pool = require('../db');
const erp = require('../services/erpSheets');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireRole('buyer', 'admin'));
router.use(async (req, res, next) => {
  try {
    await erp.ensureSchema();
    next();
  } catch (error) {
    next(error);
  }
});

function buyerName(req) { return req.user?.business_name || ''; }

// The redirect URI must EXACTLY match one registered in Google Cloud Console.
// Derive it from the calendar's already-working GOOGLE_REDIRECT_URI (same
// host:port) so it points at the server, not the Vite dev host.
function erpRedirectUri(req) {
  if (process.env.GOOGLE_REDIRECT_URI_ERP) return process.env.GOOGLE_REDIRECT_URI_ERP;
  if (process.env.GOOGLE_REDIRECT_URI) {
    return process.env.GOOGLE_REDIRECT_URI.replace(/\/api\/calendar\/oauth\/callback\/?$/i, '/api/erp/oauth/callback');
  }
  return `${req.protocol}://${req.get('host')}/api/erp/oauth/callback`;
}

async function loadConnection(userId) {
  const { rows } = await pool.query(
    `SELECT ec.*, u.business_name, u.email
     FROM erp_connections ec JOIN users u ON u.id = ec.user_id
     WHERE ec.user_id = $1`,
    [userId],
  );
  return rows[0] || null;
}

router.get('/status', async (req, res) => {
  const conn = await loadConnection(req.user.id);
  const buyer = buyerName(req);
  const [summary, aging, syncHealth] = await Promise.all([
    pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE erp_status='Payable')::int AS payable,
            COUNT(*) FILTER (WHERE erp_status='Funded')::int AS funded,
            COUNT(*) FILTER (WHERE erp_status='Paid')::int AS paid,
            COUNT(*) FILTER (WHERE erp_status='Disputed')::int AS disputed,
            COUNT(*) FILTER (WHERE erp_status='Overdue')::int AS overdue,
            COALESCE(SUM(amount) FILTER (WHERE erp_status IN ('Payable','Funded','Pending','Overdue')),0) AS outstanding
     FROM erp_ledger WHERE LOWER(buyer_name)=LOWER($1)`, [buyer]),
    erp.getAgingSummary(buyer),
    erp.getSyncHealth(buyer),
  ]);
  res.json({
    configured: erp.configured(),
    connected: Boolean(conn),
    mode: conn?.mode || null,
    connection: conn ? {
      mode: conn.mode, spreadsheet_id: conn.spreadsheet_id, ap_sheet: conn.ap_sheet,
      supplier_sheet: conn.supplier_sheet, delete_on_dispute: conn.delete_on_dispute,
      google_linked: Boolean(conn.access_token), updated_at: conn.updated_at,
      last_google_sync_at: conn.last_google_sync_at, last_google_error: conn.last_google_error,
    } : null,
    summary: summary.rows[0],
    aging,
    sync_health: syncHealth,
  });
});

router.get('/ledger', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT invoice_id, invoice_number, supplier_name, amount, payout_amount,
            tax_amount, TO_CHAR(due_date,'YYYY-MM-DD') AS due_date, erp_status, source,
            note, po_number, gl_code, department, payment_terms,
            sheet_row, synced_to_google, updated_at
     FROM erp_ledger WHERE LOWER(buyer_name)=LOWER($1)
     ORDER BY updated_at DESC`, [buyerName(req)]);
  res.json(rows);
});

// ---- Manual CRUD on payables (Create / Update / Delete) --------------------
router.post('/ledger', async (req, res) => {
  const conn = await loadConnection(req.user.id);
  if (!conn) return res.status(409).json({ message: 'Enable the ledger first' });
  if (!(req.body.supplier_name || '').trim() && (req.body.amount === undefined || req.body.amount === '')) {
    return res.status(400).json({ message: 'Supplier and amount are required' });
  }
  const result = await erp.createManualPayable(buyerName(req), req.body);
  if (!result.ok) return res.status(result.status).json({ message: result.reason });
  res.status(201).json(result.row);
});

router.patch('/ledger/:invoiceId', async (req, res) => {
  const r = await erp.updateLedgerRow(buyerName(req), req.params.invoiceId, req.body);
  if (!r.ok) return res.status(r.status).json({ message: r.reason });
  res.json({ updated: true });
});

router.delete('/ledger/:invoiceId', async (req, res) => {
  const r = await erp.deleteLedgerRow(buyerName(req), req.params.invoiceId);
  if (!r.ok) return res.status(r.status).json({ message: r.reason });
  res.json({ deleted: true });
});

router.get('/log', async (req, res) => {
  const limit = Math.min(200, Number(req.query.limit) || 40);
  const { rows } = await pool.query(
    `SELECT id, invoice_number, action, erp_status, target, status, detail, created_at
     FROM erp_sync_log WHERE LOWER(buyer_name)=LOWER($1)
     ORDER BY created_at DESC LIMIT $2`, [buyerName(req), limit]);
  res.json(rows);
});

// Turn on the in-app ledger (no Google needed) and backfill existing invoices.
router.post('/enable', async (req, res) => {
  await pool.query(
    `INSERT INTO erp_connections (user_id, mode, status)
     VALUES ($1, 'local', 'Active')
     ON CONFLICT (user_id, provider) DO UPDATE SET status='Active', updated_at=NOW()`,
    [req.user.id]);
  const result = await erp.reconcileBuyer(req.user.id);
  res.json({ enabled: true, ...result });
});

router.post('/config', async (req, res) => {
  const conn = await loadConnection(req.user.id);
  if (!conn) return res.status(409).json({ message: 'Enable the ledger first' });
  const spreadsheet_id = req.body.spreadsheet_id !== undefined ? String(req.body.spreadsheet_id).trim() : conn.spreadsheet_id;
  const ap_sheet = req.body.ap_sheet !== undefined ? String(req.body.ap_sheet).trim() || 'Accounts Payable' : conn.ap_sheet;
  const supplier_sheet = req.body.supplier_sheet !== undefined ? String(req.body.supplier_sheet).trim() || 'Suppliers' : conn.supplier_sheet;
  const delete_on_dispute = req.body.delete_on_dispute !== undefined ? Boolean(req.body.delete_on_dispute) : conn.delete_on_dispute;
  await pool.query(
    `UPDATE erp_connections SET spreadsheet_id=$1, ap_sheet=$2, supplier_sheet=$3, delete_on_dispute=$4, updated_at=NOW() WHERE user_id=$5`,
    [spreadsheet_id || null, ap_sheet, supplier_sheet, delete_on_dispute, req.user.id]);
  res.json({ saved: true });
});

router.get('/connect', async (req, res) => {
  if (!erp.configured()) return res.status(503).json({ message: 'Google credentials are not configured on the server' });
  const state = erp.oauthState();
  const redirectUri = erpRedirectUri(req);
  await pool.query(
    `INSERT INTO erp_connections (user_id, mode, oauth_state) VALUES ($1, 'local', $2)
     ON CONFLICT (user_id, provider) DO UPDATE SET oauth_state=EXCLUDED.oauth_state, updated_at=NOW()`,
    [req.user.id, state]);
  const params = new URLSearchParams({
    client_id: erp.googleClientId(), redirect_uri: redirectUri, response_type: 'code',
    access_type: 'offline', prompt: 'consent', scope: erp.GOOGLE_SHEETS_SCOPE, state,
  });
  res.json({ authorization_url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
});

async function oauthCallback(req, res) {
  const { code, state, error } = req.query;
  if (error) return res.status(400).send(`Google authorization was cancelled: ${error}`);
  if (!code || !state) return res.status(400).send('Missing Google OAuth code or state');
  const conn = await pool.query('SELECT * FROM erp_connections WHERE oauth_state = $1', [state]);
  if (!conn.rowCount) return res.status(400).send('Invalid or expired OAuth state');
  const redirectUri = erpRedirectUri(req);
  const tokenBody = new URLSearchParams({ code, client_id: erp.googleClientId(), client_secret: erp.googleClientSecret(), redirect_uri: redirectUri, grant_type: 'authorization_code' });
  try {
    const token = await new Promise((resolve, reject) => {
      const request = https.request({ hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(tokenBody.toString()) } }, (response) => {
        let data = ''; response.on('data', (c) => { data += c; });
        response.on('end', () => response.statusCode >= 400 ? reject(new Error(data)) : resolve(JSON.parse(data)));
      });
      request.on('error', reject); request.write(tokenBody.toString()); request.end();
    });
    await pool.query(
      `UPDATE erp_connections SET mode='google', access_token=$1, refresh_token=COALESCE($2, refresh_token),
       token_type=$3, scope=$4, expires_at=NOW() + ($5 || ' seconds')::INTERVAL, oauth_state=NULL, updated_at=NOW()
       WHERE id=$6`,
      [token.access_token, token.refresh_token || null, token.token_type || 'Bearer', token.scope || erp.GOOGLE_SHEETS_SCOPE, token.expires_in || 3600, conn.rows[0].id]);
    erp.reconcileBuyer(conn.rows[0].user_id).catch((e) => console.error('ERP backfill after connect failed:', e.message));
    res.redirect(`${process.env.APP_URL || 'http://localhost:5173'}/buyer/erp?connected=1`);
  } catch (oauthError) {
    res.status(502).send(`Google token exchange failed: ${oauthError.message}`);
  }
}
router.get('/oauth/callback', oauthCallback);

router.delete('/disconnect', async (req, res) => {
  await pool.query('DELETE FROM erp_connections WHERE user_id = $1', [req.user.id]);
  res.json({ disconnected: true });
});

router.post('/sync/:invoiceId', async (req, res) => {
  const conn = await loadConnection(req.user.id);
  if (!conn) return res.status(409).json({ message: 'Enable the ledger first' });
  const result = await erp.syncInvoiceToSheet(req.params.invoiceId);
  res.json(result);
});

router.post('/reconcile', async (req, res) => {
  const conn = await loadConnection(req.user.id);
  if (!conn) return res.status(409).json({ message: 'Enable the ledger first' });
  const result = await erp.reconcileBuyer(req.user.id);
  res.json({ reconciled: true, ...result });
});

router.post('/retry-failed', async (req, res) => {
  const result = await erp.retryFailedGoogleSyncs(req.user.id);
  if (!result.ok) return res.status(result.status).json({ message: result.reason });
  res.json(result);
});

router.post('/suppliers/sync', async (req, res) => {
  const conn = await loadConnection(req.user.id);
  const result = await erp.syncSupplierMaster(conn, buyerName(req));
  if (!result.ok) return res.status(result.status).json({ message: result.reason });
  res.json(result);
});

router.post('/sheet-template', async (req, res) => {
  const result = await erp.createAccountingSpreadsheet(req.user.id);
  if (!result.ok) return res.status(result.status).json({ message: result.reason });
  const backfill = await erp.reconcileBuyer(req.user.id);
  res.status(201).json({ ...result, backfill });
});

router.get('/reconciliation', async (req, res) => {
  const conn = await loadConnection(req.user.id);
  const result = await erp.reconcileSheetDifferences(conn, buyerName(req));
  res.json(result);
});

router.post('/reconciliation/notify', async (req, res) => {
  const conn = await loadConnection(req.user.id);
  const result = await erp.reconcileSheetDifferences(conn, buyerName(req), {
    notify: true,
    recipientEmail: req.user.email,
  });
  res.json({ notified: result.issues.length > 0, ...result });
});

router.post('/notify-overdue', async (req, res) => {
  const result = await erp.notifyOverduePayables(req.user);
  if (!result.ok) return res.status(result.status).json({ message: result.reason });
  res.json(result);
});

router.get('/admin/summary', requireRole('admin'), async (req, res) => {
  res.json(await erp.adminSummary());
});

router.get('/suppliers', async (req, res) => {
  const conn = await loadConnection(req.user.id);
  const result = await erp.fetchSupplierCrossReference(conn, buyerName(req));
  res.json(result);
});

router.use((error, req, res, next) => {
  console.error('ERP route failed:', error.message);
  res.status(500).json({ message: 'ERP request failed', detail: error.message });
});

module.exports = router;
module.exports.oauthCallback = oauthCallback;
