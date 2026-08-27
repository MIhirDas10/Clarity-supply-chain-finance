// Feature 4 - Funder Deposit & Invoice Funding via bKash
// (Apurba Roy, SL 3)   Mounted at /api/wallet
//
// A funder tops up a wallet through bKash's real Tokenized Checkout sandbox,
// then funds invoices out of that balance. Depositing and funding are two
// separate, ordinary transactions - nobody's money leaves the platform's
// own ledger just to fund one invoice.

const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const bkash = require('../services/bkash');
const { getOrCreateWallet, creditWallet, fundInvoiceFromWallet } = require('../services/funderWallet');

const router = express.Router();

// Being logged in is not enough to touch a wallet - index.js already applies
// requireAuth across /api, but that only proves WHO you are, not that the
// wallet is yours. Without the check below, any signed-in account could read
// or spend any other funder's balance just by changing the id in the URL.
//
// Wallet rows exist under both "14" and "F-14" for the same account (two code
// paths created them differently - see accountScope.js, which works around
// the same split), so both spellings count as owned.
function ownsWallet(user, funderId) {
  if (!user || funderId === undefined || funderId === null) return false;
  if (user.role === 'admin') return true;          // admin views may inspect any wallet
  if (user.role !== 'funder') return false;        // suppliers and buyers have no wallet
  return String(funderId) === String(user.id) || String(funderId) === `F-${user.id}`;
}

function denyWallet(res) {
  return res.status(403).json({ message: 'That wallet does not belong to your account.' });
}

// 1. GET /api/wallet/:funderId - balance + recent ledger entries.
//    Creates the wallet on first visit, so a brand new funder id just works.
router.get('/:funderId', async (req, res) => {
  if (!ownsWallet(req.user, req.params.funderId)) return denyWallet(res);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const wallet = await getOrCreateWallet(client, req.params.funderId, req.query.funderName || req.params.funderId);
    await client.query('COMMIT');

    const history = await pool.query(
      `SELECT wt.id, wt.type, wt.amount, wt.balance_after, wt.invoice_id, wt.status, wt.created_at,
              wt.client_ref, wt.bkash_payment_id, i.invoice_number
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

// 2. POST /api/wallet/deposit/init - start a deposit through bKash.
//    Body: { funder_id, funder_name, amount }
router.post('/deposit/init', async (req, res) => {
  const { funder_id, funder_name, amount } = req.body;

  if (!funder_id || !funder_name) {
    return res.status(400).json({ message: 'funder_id and funder_name are required' });
  }
  if (!ownsWallet(req.user, funder_id)) return denyWallet(res);
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ message: 'amount must be a number greater than zero' });
  }

  try {
    // APP_URL is a fixed, known-correct address rather than anything derived
    // from the request - confirmed the hard way (with UddoktaPay, the
    // gateway this feature used before) that both req.headers.origin and
    // req.get('host') are unreliable behind the Vite dev proxy. bKash
    // appends ?paymentID=...&status=...&signature=... to whatever
    // callbackURL is given, so this must be a plain address with no query
    // string already on it.
    const origin = process.env.APP_URL || req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const ref = crypto.randomUUID();

    const charge = await bkash.createPayment({
      amount,
      merchantInvoiceNumber: ref,
      payerReference: funder_id,
      callbackURL: `${origin}/funder/wallet`,
    });

    // Unlike the previous gateway, bKash's paymentID is known immediately
    // and stays the same through create -> execute -> query, so it is
    // stored right away instead of needing a separate reconciliation step.
    await getOrCreateWallet(pool, funder_id, funder_name);
    await pool.query(
      `INSERT INTO wallet_transactions (funder_id, type, amount, status, client_ref, bkash_payment_id)
       VALUES ($1, 'Deposit', $2, 'Pending', $3, $4)`,
      [funder_id, amount, ref, charge.paymentID]
    );

    res.status(201).json({ payment_url: charge.bkashURL });
  } catch (error) {
    console.error('bKash deposit init failed:', error.message);
    res.status(502).json({ message: 'Could not start the deposit: ' + error.message });
  }
});

// Looks a deposit up by bKash's own paymentID (stable end-to-end, unlike the
// previous gateway), asks bKash to finalise the payment, and credits the
// wallet if it went through. Checking the row is still Pending before
// crediting is what makes this idempotent - clicking Confirm twice, or the
// funder landing back on this page more than once, can never double-credit.
async function verifyAndCredit(paymentID, user) {
  const existing = await pool.query(
    'SELECT * FROM wallet_transactions WHERE bkash_payment_id = $1',
    [paymentID]
  );
  if (existing.rowCount === 0) {
    return { httpStatus: 404, body: { message: 'No deposit was started with that payment id' } };
  }

  const deposit = existing.rows[0];
  // A Payment ID is typed in by hand on the client, so it has to be checked
  // against the caller here - otherwise pasting someone else's id would
  // credit their wallet on their behalf.
  if (!ownsWallet(user, deposit.funder_id)) {
    return { httpStatus: 403, body: { message: 'That deposit does not belong to your account.' } };
  }

  if (deposit.status === 'Completed') {
    return { httpStatus: 200, body: { status: 'Completed', already_processed: true } };
  }

  const result = await bkash.executePayment(paymentID);
  if (result.transactionStatus !== 'Completed') {
    return {
      httpStatus: 200,
      body: { status: 'Pending', message: result.statusMessage || 'Payment not completed yet' },
    };
  }

  const newBalance = await creditWallet(deposit.funder_id, deposit.funder_id, deposit.amount, deposit.client_ref);
  return { httpStatus: 200, body: { status: 'Completed', balance: newBalance } };
}

// 3. POST /api/wallet/deposit/verify - called by the client once bKash
//    redirects the funder back. Body: { paymentID }
router.post('/deposit/verify', async (req, res) => {
  const { paymentID } = req.body;
  if (!paymentID) {
    return res.status(400).json({ message: 'paymentID is required' });
  }
  try {
    const { httpStatus, body } = await verifyAndCredit(paymentID, req.user);
    res.status(httpStatus).json(body);
  } catch (error) {
    console.error('bKash verify failed:', error.message);
    res.status(502).json({ message: 'Could not verify the payment: ' + error.message });
  }
});

// 3c. DELETE /api/wallet/deposit/:ref - discard a deposit that was started
//     but never paid (funder closed the checkout page, payment abandoned).
//     Only ever touches a Pending row, so a completed deposit can never be
//     removed and the ledger stays a faithful record of real money.
router.delete('/deposit/:ref', async (req, res) => {
  try {
    const owner = await pool.query(
      'SELECT funder_id FROM wallet_transactions WHERE client_ref = $1',
      [req.params.ref]
    );
    if (owner.rowCount === 0) {
      return res.status(409).json({ message: 'That deposit is not pending - it cannot be discarded' });
    }
    if (!ownsWallet(req.user, owner.rows[0].funder_id)) return denyWallet(res);

    // The Pending guard stays inside the DELETE itself, so a deposit that
    // completes between these two queries still cannot be removed.
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
  if (!ownsWallet(req.user, funder_id)) return denyWallet(res);

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
