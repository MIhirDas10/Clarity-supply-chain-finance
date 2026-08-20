// The funder's wallet and the ledger of every deposit and invoice-funding
// that has ever touched it. This file has one job that everything else
// funnels through: fundInvoiceFromWallet(). Both the "Fund" button on the
// wallet page and the Auto-Invest engine call it, so there is exactly one
// place capital ever leaves a funder's wallet and lands on an invoice.
//
// Digonta's marketplace also has its own POST /:invoiceId/fund, which funds
// an invoice without touching a wallet. Both routes lock the SAME invoices
// row with SELECT ... FOR UPDATE before writing to it, so Postgres itself
// serialises the two - whichever request gets there first wins, and the
// other sees the invoice already taken. That row lock is the "marketplace
// claim-lock" the FR document describes; no invoice is funded outside it.

const pool = require('../db');
const { reconcileInvoice } = require('./calendarSync');

// A funder is not required to sign up before depositing - the wallet row is
// created the first time we see their id, the same way an invoice's
// supplier_id or a buyer's name is used without a separate signup step
// elsewhere in this codebase.
async function getOrCreateWallet(client, funderId, funderName) {
  await client.query(
    `INSERT INTO funder_wallets (funder_id, funder_name, balance)
     VALUES ($1, $2, 0)
     ON CONFLICT (funder_id) DO NOTHING`,
    [funderId, funderName]
  );
  const result = await client.query(
    'SELECT * FROM funder_wallets WHERE funder_id = $1 FOR UPDATE',
    [funderId]
  );
  return result.rows[0];
}

// Credits a wallet - only ever called once a real UddoktaPay payment has
// been verified as COMPLETED. Runs in its own transaction.
async function creditWallet(funderId, funderName, amount, uddoktapayId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const wallet = await getOrCreateWallet(client, funderId, funderName);
    const newBalance = Number(wallet.balance) + Number(amount);

    await client.query(
      'UPDATE funder_wallets SET balance = $2, updated_at = NOW() WHERE funder_id = $1',
      [funderId, newBalance]
    );
    await client.query(
      `UPDATE wallet_transactions
       SET status = 'Completed', balance_after = $2, completed_at = NOW()
       WHERE uddoktapay_id = $1`,
      [uddoktapayId, newBalance]
    );

    await client.query('COMMIT');
    return newBalance;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// The shared fund-an-invoice-from-a-wallet transaction. Locks the invoice,
// checks it is still fundable, checks the wallet can afford it, then debits
// the wallet and advances the invoice in the same all-or-nothing transaction
// Digonta's manual funding uses (same status/current_stage/funder_id/
// funded_at writes, same invoice_history row), so both paths leave the
// pipeline in a state Mihir's dashboard already knows how to read.
async function fundInvoiceFromWallet(invoiceId, funderId, funderName, source) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const invoiceRes = await client.query(
      'SELECT * FROM invoices WHERE id = $1 FOR UPDATE',
      [invoiceId]
    );
    if (invoiceRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return { ok: false, status: 404, reason: 'Invoice not found' };
    }

    const invoice = invoiceRes.rows[0];
    if (invoice.status !== 'Buyer Confirmed' || invoice.funder_id !== null) {
      await client.query('ROLLBACK');
      return { ok: false, status: 409, reason: 'Invoice is no longer available to fund' };
    }
    // frozen_at is set the moment a dispute is filed (Feature 2) - the whole
    // point of the freeze is that no money moves on this invoice until the
    // dispute is resolved, so wallet funding has to honour it too.
    if (invoice.frozen_at !== null) {
      await client.query('ROLLBACK');
      return { ok: false, status: 409, reason: 'Invoice is frozen due to an open dispute' };
    }

    const wallet = await getOrCreateWallet(client, funderId, funderName);
    const amount = Number(invoice.invoice_amount);
    if (Number(wallet.balance) < amount) {
      await client.query('ROLLBACK');
      return { ok: false, status: 409, reason: 'Wallet balance is too low for this invoice' };
    }

    const newBalance = Number(wallet.balance) - amount;
    await client.query(
      'UPDATE funder_wallets SET balance = $2, updated_at = NOW() WHERE funder_id = $1',
      [funderId, newBalance]
    );
    await client.query(
      `INSERT INTO wallet_transactions (funder_id, type, amount, balance_after, invoice_id, status, completed_at)
       VALUES ($1, 'Invoice Funding', $2, $3, $4, 'Completed', NOW())`,
      [funderId, -amount, newBalance, invoiceId]
    );

    await client.query(
      `UPDATE invoices
       SET status = 'Funded', current_stage = 'Funded', funder_id = $2, funded_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [invoiceId, funderId]
    );
    await client.query(
      `INSERT INTO invoice_history (invoice_id, stage, actor) VALUES ($1, 'Funded', $2)`,
      [invoiceId, source === 'auto-invest' ? `${funderName} (Auto-Invest)` : funderName]
    );

    await client.query('COMMIT');
    reconcileInvoice(invoiceId).catch((error) => console.error('Calendar funding sync failed:', error.message));
    return { ok: true, invoiceId, amount, funderId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { getOrCreateWallet, creditWallet, fundInvoiceFromWallet };
