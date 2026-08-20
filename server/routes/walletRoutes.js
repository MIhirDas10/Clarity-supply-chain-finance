// Feature 3 - Funder Deposit & Invoice Funding via bKash (UddoktaPay)
// (Apurba Roy, SL 3)   Mounted at /api/wallet
//
// A funder tops up a wallet through UddoktaPay (which itself offers
// bKash/Nagad/Rocket), then funds invoices out of that balance. Depositing
// and funding are two separate, ordinary transactions - nobody's money
// leaves the platform's own ledger just to fund one invoice.

const express = require('express');
const pool = require('../db');
const uddoktapay = require('../services/uddoktapay');
const { getOrCreateWallet, creditWallet, fundInvoiceFromWallet } = require('../services/funderWallet');

const router = express.Router();

// 1. GET /api/wallet/:funderId - balance + recent ledger entries.
//    Creates the wallet on first visit, so a brand new funder id just works.
router.get('/:funderId', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const wallet = await getOrCreateWallet(client, req.params.funderId, req.query.funderName || req.params.funderId);
    await client.query('COMMIT');

    const history = await pool.query(
      `SELECT wt.id, wt.type, wt.amount, wt.balance_after, wt.invoice_id, wt.status, wt.created_at,
              i.invoice_number
       FROM wallet_transactions wt
       LEFT JOIN invoices i ON i.id::TEXT = wt.invoice_id
       WHERE wt.funder_id = $1
       ORDER BY wt.created_at DESC LIMIT 100`,
      [req.params.funderId]
    );
    res.json({ ...wallet, transactions: history.rows });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: 'Could not load the wallet' });
  } finally {
    client.release();
  }
});

// 2. POST /api/wallet/deposit/init - start a deposit through UddoktaPay.
//    Body: { funder_id, funder_name, amount }
router.post('/deposit/init', async (req, res) => {
  const { funder_id, funder_name, amount } = req.body;

  if (!funder_id || !funder_name) {
    return res.status(400).json({ message: 'funder_id and funder_name are required' });
  }
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ message: 'amount must be a number greater than zero' });
  }

  try {
    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const charge = await uddoktapay.createCharge({
      fullName: funder_name,
      email: `${funder_id}@clarity.demo`, // UddoktaPay requires an email; funders aren't logged in yet
      amount,
      metadata: { funder_id, funder_name },
      redirectUrl: `${origin}/funder/wallet?funder_id=${encodeURIComponent(funder_id)}`,
      cancelUrl: `${origin}/funder/wallet?funder_id=${encodeURIComponent(funder_id)}`,
      webhookUrl: `${origin}/api/wallet/deposit/webhook`,
    });

    await getOrCreateWallet(pool, funder_id, funder_name);
    await pool.query(
      `INSERT INTO wallet_transactions (funder_id, type, amount, status, uddoktapay_id)
       VALUES ($1, 'Deposit', $2, 'Pending', $3)`,
      [funder_id, amount, charge.uddoktapayId]
    );

    res.status(201).json({ payment_url: charge.paymentUrl });
  } catch (error) {
    console.error('UddoktaPay deposit init failed:', error.message);
    res.status(502).json({ message: 'Could not start the deposit: ' + error.message });
  }
});

// Shared by the two routes below: looks a deposit up by UddoktaPay's own
// charge id, asks UddoktaPay whether it was actually paid, and credits the
// wallet if so. Checking the row is still Pending before crediting is what
// makes this idempotent - the redirect and the webhook can both call this
// for the same payment and it will only ever be credited once.
async function verifyAndCredit(uddoktapayId) {
  const existing = await pool.query(
    'SELECT * FROM wallet_transactions WHERE uddoktapay_id = $1',
    [uddoktapayId]
  );
  if (existing.rowCount === 0) {
    return { httpStatus: 404, body: { message: 'No deposit was started with that id' } };
  }

  const deposit = existing.rows[0];
  if (deposit.status === 'Completed') {
    return { httpStatus: 200, body: { status: 'Completed', already_processed: true } };
  }

  const result = await uddoktapay.verifyPayment(uddoktapayId);
  if (result.status !== 'COMPLETED') {
    return { httpStatus: 200, body: { status: 'Pending', message: result.message || 'Payment not completed yet' } };
  }

  const newBalance = await creditWallet(deposit.funder_id, deposit.funder_id, deposit.amount, uddoktapayId);
  return { httpStatus: 200, body: { status: 'Completed', balance: newBalance } };
}

// 3. POST /api/wallet/deposit/verify - called by the client once UddoktaPay
//    redirects the funder back. Body: { uddoktapay_id }
router.post('/deposit/verify', async (req, res) => {
  if (!req.body.uddoktapay_id) {
    return res.status(400).json({ message: 'uddoktapay_id is required' });
  }
  try {
    const { httpStatus, body } = await verifyAndCredit(req.body.uddoktapay_id);
    res.status(httpStatus).json(body);
  } catch (error) {
    console.error('UddoktaPay verify failed:', error.message);
    res.status(502).json({ message: 'Could not verify the payment: ' + error.message });
  }
});

// UddoktaPay also POSTs here directly once a payment completes, so a
// deposit still gets credited even if the funder closes the tab before the
// redirect fires.
router.post('/deposit/webhook', async (req, res) => {
  const uddoktapayId = req.body.invoice_id || req.body.metadata?.invoice_id;
  if (!uddoktapayId) {
    return res.status(400).json({ message: 'invoice_id missing from webhook body' });
  }
  try {
    const { httpStatus, body } = await verifyAndCredit(uddoktapayId);
    res.status(httpStatus).json(body);
  } catch (error) {
    console.error('UddoktaPay webhook verify failed:', error.message);
    res.status(502).json({ message: 'Could not verify the payment' });
  }
});

// 4. POST /api/wallet/fund/:invoiceId - manually fund one invoice from a wallet.
//    Body: { funder_id, funder_name }
router.post('/fund/:invoiceId', async (req, res) => {
  const { funder_id, funder_name } = req.body;
  if (!funder_id || !funder_name) {
    return res.status(400).json({ message: 'funder_id and funder_name are required' });
  }

  try {
    const result = await fundInvoiceFromWallet(req.params.invoiceId, funder_id, funder_name, 'manual');
    if (!result.ok) {
      return res.status(result.status).json({ message: result.reason });
    }
    res.json(result);
  } catch (error) {
    console.error('Wallet funding failed:', error.message);
    res.status(500).json({ message: 'Could not fund the invoice' });
  }
});

module.exports = router;
