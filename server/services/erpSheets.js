const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });

const sheets = require('./erpGoogleSheets');
const store = require('./erpLedgerStore');
const reports = require('./erpReports');
const suppliers = require('./erpSuppliers');

// Public service facade for ERP / Accounting Sync.
// Routes keep importing this file, while the real work lives in focused modules.
const SUPPLIER_MASTER_SYNC_DELAY_MS = 1500;
const SUPPLIER_MASTER_SYNC_MIN_INTERVAL_MS = 60000;
const supplierMasterSyncState = new Map();

function supplierSyncKey(conn, buyerName) {
  return String(conn?.id || buyerName || 'buyer');
}

function rememberSupplierMasterSync(conn, buyerName) {
  const key = supplierSyncKey(conn, buyerName);
  const current = supplierMasterSyncState.get(key) || {};
  supplierMasterSyncState.set(key, { ...current, lastRun: Date.now() });
}

async function syncSupplierMaster(conn, buyerName) {
  const result = await suppliers.syncSupplierMaster(conn, buyerName);
  if (result.ok) rememberSupplierMasterSync(conn, buyerName);
  return result;
}

function scheduleSupplierMasterSync(conn, buyerName) {
  if (!store.googleReady(conn)) return;

  const key = supplierSyncKey(conn, buyerName);
  const current = supplierMasterSyncState.get(key) || {};
  if (current.timer) return;

  const elapsed = Date.now() - (current.lastRun || 0);
  const wait = elapsed >= SUPPLIER_MASTER_SYNC_MIN_INTERVAL_MS
    ? SUPPLIER_MASTER_SYNC_DELAY_MS
    : SUPPLIER_MASTER_SYNC_MIN_INTERVAL_MS - elapsed;

  const timer = setTimeout(async () => {
    const state = supplierMasterSyncState.get(key) || {};
    supplierMasterSyncState.set(key, { ...state, timer: null, lastRun: Date.now() });
    const result = await suppliers.syncSupplierMaster(conn, buyerName);
    if (!result.ok) console.error('ERP supplier master auto-sync failed:', result.reason);
  }, wait);

  supplierMasterSyncState.set(key, { ...current, timer });
}

async function syncInvoiceToSheet(invoiceId) {
  try {
    const invoice = await store.invoiceWithSupplier(invoiceId);
    if (!invoice) return { skipped: true, reason: 'invoice not found' };

    const conn = await store.findBuyerConnection(invoice.buyer_name);
    if (!conn) return { skipped: true, reason: 'buyer has no ERP connection' };

    const fields = store.invoiceFields(invoice);
    if (conn.delete_on_dispute && fields.erp_status === 'Disputed') {
      const sheetRow = await store.removeLocalLedger(invoice.buyer_name, invoice.id, fields);
      await store.removeGoogle(conn, invoice.buyer_name, invoice.id, fields, sheetRow);
      scheduleSupplierMasterSync(conn, invoice.buyer_name);
      return { ok: true, erp_status: fields.erp_status };
    }

    const saved = await store.savePlatformLedger(invoice.buyer_name, invoice.id, fields);
    await store.pushGoogle(conn, invoice.buyer_name, invoice.id, store.ledgerFields(saved));
    scheduleSupplierMasterSync(conn, invoice.buyer_name);
    return { ok: true, erp_status: fields.erp_status };
  } catch (error) {
    console.error('syncInvoiceToSheet failed:', error.message);
    return { ok: false, error: error.message };
  }
}

async function syncWithdrawnInvoice(snapshot) {
  try {
    const conn = await store.findBuyerConnection(snapshot?.buyer_name);
    if (!conn) return { skipped: true, reason: 'buyer has no ERP connection' };

    const fields = {
      ...store.invoiceFields({ ...snapshot, status: 'Voided', frozen_at: null, payment_date: null }),
      erp_status: 'Voided',
    };
    const saved = await store.savePlatformLedger(snapshot.buyer_name, snapshot.id, fields);
    await store.pushGoogle(conn, snapshot.buyer_name, snapshot.id, store.ledgerFields(saved), 'void');
    scheduleSupplierMasterSync(conn, snapshot.buyer_name);
    return { ok: true, erp_status: 'Voided' };
  } catch (error) {
    console.error('syncWithdrawnInvoice failed:', error.message);
    return { ok: false, error: error.message };
  }
}

async function reconcileBuyer(userId) {
  const conn = await store.connectionForUser(userId);
  if (!conn?.business_name) return { synced: 0, total: 0 };

  const invoiceRows = await store.invoicesWithSuppliersForBuyer(conn.business_name);
  let synced = 0;

  for (const invoice of invoiceRows) {
    const fields = store.invoiceFields(invoice);
    if (conn.delete_on_dispute && fields.erp_status === 'Disputed') {
      await store.removeLocalLedger(invoice.buyer_name, invoice.id, fields);
      synced += 1;
      continue;
    }

    await store.savePlatformLedger(invoice.buyer_name, invoice.id, fields);
    synced += 1;
  }

  let google = { synced: false, count: 0 };
  let supplierMaster = { synced: false, count: 0 };
  if (store.googleReady(conn)) {
    const ledgerResult = await store.pushGoogleLedgerSnapshot(conn, conn.business_name);
    google = {
      synced: ledgerResult.pushed,
      count: ledgerResult.count || 0,
      error: ledgerResult.pushed ? null : ledgerResult.error,
    };

    const result = await syncSupplierMaster(conn, conn.business_name);
    supplierMaster = {
      synced: result.ok,
      count: result.count || 0,
      error: result.ok ? null : result.reason,
    };
  }

  await store.logSync({
    buyerName: conn.business_name,
    action: 'backfill',
    target: 'local',
    status: 'success',
    detail: `${synced} invoice(s) synced`,
  });

  return { synced, total: invoiceRows.length, google, supplier_master: supplierMaster };
}

module.exports = {
  configured: sheets.configured,
  oauthState: sheets.oauthState,
  accessToken: sheets.accessToken,
  googleClientId: sheets.clientId,
  googleClientSecret: sheets.clientSecret,
  GOOGLE_SHEETS_SCOPE: sheets.GOOGLE_SHEETS_SCOPE,

  syncInvoiceToSheet,
  syncWithdrawnInvoice,
  reconcileBuyer,

  adminSummary: reports.adminSummary,
  getAgingSummary: reports.getAgingSummary,
  getSyncHealth: reports.getSyncHealth,
  notifyOverduePayables: reports.notifyOverduePayables,
  reconcileSheetDifferences: reports.reconcileSheetDifferences,

  fetchSupplierCrossReference: suppliers.fetchSupplierCrossReference,
  syncSupplierMaster,

  connectionForUser: store.connectionForUser,
  createAccountingSpreadsheet: store.createAccountingSpreadsheet,
  createManualPayable: store.createManualPayable,
  deleteLedgerRow: store.deleteLedgerRow,
  ensureSchema: store.ensureSchema,
  erpStatusFor: store.erpStatusFor,
  findBuyerConnection: store.findBuyerConnection,
  retryFailedGoogleSyncs: store.retryFailedGoogleSyncs,
  updateLedgerRow: store.updateLedgerRow,
};
