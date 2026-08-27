const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });

const sheets = require('./erpGoogleSheets');
const store = require('./erpLedgerStore');
const reports = require('./erpReports');
const suppliers = require('./erpSuppliers');

// Public service facade for ERP / Accounting Sync.
// Routes keep importing this file, while the real work lives in focused modules.

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
      return { ok: true, erp_status: fields.erp_status };
    }

    const saved = await store.savePlatformLedger(invoice.buyer_name, invoice.id, fields);
    await store.pushGoogle(conn, invoice.buyer_name, invoice.id, store.ledgerFields(saved));
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
    return { ok: true, erp_status: 'Voided' };
  } catch (error) {
    console.error('syncWithdrawnInvoice failed:', error.message);
    return { ok: false, error: error.message };
  }
}

async function reconcileBuyer(userId) {
  const conn = await store.connectionForUser(userId);
  if (!conn?.business_name) return { synced: 0, total: 0 };

  const invoiceRows = await store.invoiceIdsForBuyer(conn.business_name);
  let synced = 0;

  for (const invoice of invoiceRows) {
    const result = await syncInvoiceToSheet(invoice.id);
    if (result.ok) synced += 1;
  }

  await store.logSync({
    buyerName: conn.business_name,
    action: 'backfill',
    target: 'local',
    status: 'success',
    detail: `${synced} invoice(s) synced`,
  });

  return { synced, total: invoiceRows.length };
}

module.exports = {
  configured: sheets.configured,
  oauthState: sheets.oauthState,
  accessToken: sheets.accessToken,
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
