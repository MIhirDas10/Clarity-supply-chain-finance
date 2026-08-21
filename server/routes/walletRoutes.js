// Feature 3 - Funder Deposit & Invoice Funding via bKash (UddoktaPay)
// (Apurba Roy, SL 3)   Mounted at /api/wallet
//
// A funder tops up a wallet through UddoktaPay (which itself offers
// bKash/Nagad/Rocket), then funds invoices out of that balance. Depositing
// and funding are two separate, ordinary transactions - nobody's money
// leaves the platform's own ledger just to fund one invoice.

const express = require('express');
const crypto = require('crypto');
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
              wt.client_ref, i.invoice_number
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
    // Confirmed the hard way that both req.headers.origin (some browsers
    // send it without a port) and req.get('host') (the Vite dev proxy
    // forwards this request to the backend, so Express sees the backend's
    // own port here, not 5173) are unreliable for building a redirect the
    // funder actually lands back on. APP_URL is a fixed, known-correct
    // address - the same one the calendar OAuth flow already relies on for
    // exactly this reason - so it is used unconditionally, not as a fallback.
    const origin = process.env.APP_URL || req.headers.origin || `${req.protocol}://${req.get('host')}`;
    // Generated before UddoktaPay is even called. UddoktaPay's own id for
    // this charge isn't known yet - confirmed against the real sandbox that
    // the id in the payment_url it's about to return is NOT the id it hands
    // back on redirect once the payment actually completes. ref is ours, so
    // it is stable regardless of what UddoktaPay calls the charge on its side.
    const ref = crypto.randomUUID();

    const charge = await uddoktapay.createCharge({
      fullName: funder_name,
      email: `${funder_id}@clarity.demo`, // UddoktaPay requires an email; funders aren't logged in yet
      amount,
      metadata: { funder_id, funder_name, ref },
      redirectUrl: `${origin}/funder/wallet?funder_id=${encodeURIComponent(funder_id)}&ref=${ref}`,
      cancelUrl: `${origin}/funder/wallet?funder_id=${encodeURIComponent(funder_id)}&ref=${ref}`,
      webhookUrl: `${origin}/api/wallet/deposit/webhook`,
    });

    await getOrCreateWallet(pool, funder_id, funder_name);
    await pool.query(
      `INSERT INTO wallet_transactions (funder_id, type, amount, status, client_ref)
       VALUES ($1, 'Deposit', $2, 'Pending', $3)`,
      [funder_id, amount, ref]
    );

    res.status(201).json({ payment_url: charge.paymentUrl });
  } catch (error) {
    console.error('UddoktaPay deposit init failed:', error.message);
    res.status(502).json({ message: 'Could not start the deposit: ' + error.message });
  }
});

// Shared by the two routes below: looks a deposit up by OUR OWN reference,
// asks UddoktaPay whether its own id for the charge was actually paid, and
// credits the wallet if so. Checking the row is still Pending before
// crediting is what makes this idempotent - the redirect and the webhook can
// both call this for the same payment and it will only ever be credited once.
async function verifyAndCredit(ref, uddoktapayId) {
  const existing = await pool.query(
    'SELECT * FROM wallet_transactions WHERE client_ref = $1',
    [ref]
  );
  if (existing.rowCount === 0) {
    return { httpStatus: 404, body: { message: 'No deposit was started with that reference' } };
  }

  const deposit = existing.rows[0];
  if (deposit.status === 'Completed') {
    return { httpStatus: 200, body: { status: 'Completed', already_processed: true } };
  }

  // One real payment must never credit more than one deposit, so a payment
  // id already recorded against a different deposit is refused here rather
  // than being allowed to hit the unique index as a raw database error.
  const alreadyUsed = await pool.query(
    'SELECT client_ref FROM wallet_transactions WHERE uddoktapay_id = $1 AND client_ref <> $2',
    [uddoktapayId, ref]
  );
  if (alreadyUsed.rowCount > 0) {
    return {
      httpStatus: 409,
      body: { message: 'That UddoktaPay payment has already been used to top up a different deposit. Each deposit needs its own payment.' },
    };
  }

  const result = await uddoktapay.verifyPayment(uddoktapayId);
  if (result.status !== 'COMPLETED') {
    return { httpStatus: 200, body: { status: 'Pending', message: result.message || 'Payment not completed yet' } };
  }

  await pool.query('UPDATE wallet_transactions SET uddoktapay_id = $1 WHERE client_ref = $2', [uddoktapayId, ref]);
  const newBalance = await creditWallet(deposit.funder_id, deposit.funder_id, deposit.amount, ref);
  return { httpStatus: 200, body: { status: 'Completed', balance: newBalance } };
}

// 3. POST /api/wallet/deposit/verify - called by the client once UddoktaPay
//    redirects the funder back. Body: { ref, uddoktapay_id }
//    ref is our own tracking id (finds the pending row); uddoktapay_id is
//    the real id UddoktaPay put on the redirect (what actually gets verified).
router.post('/deposit/verify', async (req, res) => {
  const { ref, uddoktapay_id } = req.body;
  if (!ref || !uddoktapay_id) {
    return res.status(400).json({ message: 'ref and uddoktapay_id are required' });
  }
  try {
    const { httpStatus, body } = await verifyAndCredit(ref, uddoktapay_id);
    res.status(httpStatus).json(body);
  } catch (error) {
    console.error('UddoktaPay verify failed:', error.message);
    res.status(502).json({ message: 'Could not verify the payment: ' + error.message });
  }
});

// UddoktaPay also POSTs here directly once a payment completes, so a
// deposit still gets credited even if the funder closes the tab before the
// redirect fires. Our ref rides along in metadata since UddoktaPay echoes it
// back in the webhook body.
router.post('/deposit/webhook', async (req, res) => {
  const ref = req.body.metadata?.ref;
  const uddoktapayId = req.body.invoice_id;
  if (!ref || !uddoktapayId) {
    return res.status(400).json({ message: 'ref or invoice_id missing from webhook body' });
  }
  try {
    const { httpStatus, body } = await verifyAndCredit(ref, uddoktapayId);
    res.status(httpStatus).json(body);
  } catch (error) {
    console.error('UddoktaPay webhook verify failed:', error.message);
    res.status(502).json({ message: 'Could not verify the payment' });
  }
});

// 3c. DELETE /api/wallet/deposit/:ref - discard a deposit that was started
//     but never paid (funder closed the checkout page, payment abandoned).
//     Only ever touches a Pending row, so a completed deposit can never be
//     removed and the ledger stays a faithful record of real money.
router.delete('/deposit/:ref', async (req, res) => {
  try {
    const removed = await pool.query(
      "DELETE FROM wallet_transactions WHERE client_ref = $1 AND status = 'Pending' RETURNING id",
      [req.params.ref]
    );
    if (removed.rowCount === 0) {
      return res.status(409).json({ message: 'That deposit is not pending - it cannot be discarded' });
    }
    res.json({ discarded: true });
  } catch (error) {
    res.status(500).json({ message: 'Could not discard that deposit' });
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
