const express = require('express');
const pool = require('../db');
const supabase = require('../config/supabase');
const { reconcileInvoice } = require('../services/calendarSync');

const router = express.Router();

function roleScope(req, alias = 'i') {
  if (req.user?.role === 'admin') return { clause: '', params: [] };
  if (req.user?.role === 'buyer') {
    return { clause: ` AND ${alias}.buyer_name = $1`, params: [req.user.business_name] };
  }
  if (req.user?.role === 'funder') {
    return { clause: ` AND (${alias}.funder_id = $1 OR ${alias}.funder_id = $2)`, params: [String(req.user.id), `F-${req.user.id}`] };
  }
  return { clause: ' AND FALSE', params: [] };
}

async function publishSettlementNotification(recipient, message, invoiceId, type) {
  const { error } = await supabase.from('notifications').insert({
    recipient: recipient || 'Platform Operations',
    message,
    invoice_link: `/settlements?invoice=${invoiceId}`,
    type,
  });
  if (error) console.error('Settlement notification failed:', error.message);
}

function number(value) {
  return Number.parseFloat(value || 0);
}

router.get('/buyer-wallet', async (req, res) => {
  if (req.user?.role !== 'buyer') return res.status(403).json({ message: 'Only buyers have repayment wallets' });
  try {
    await pool.query(
      `INSERT INTO buyer_wallets (user_id, buyer_name) VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [req.user.id, req.user.business_name]
    );
    const wallet = await pool.query('SELECT * FROM buyer_wallets WHERE user_id = $1', [req.user.id]);
    const transactions = await pool.query(
      `SELECT * FROM buyer_wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json({ ...wallet.rows[0], transactions: transactions.rows });
  } catch (error) {
    res.status(500).json({ message: 'Could not load buyer wallet' });
  }
});

// Demo funding seam for the buyer wallet. Replace this with the payment
// provider webhook when buyer collections are connected to a real bank rail.
router.post('/buyer-wallet/deposit', async (req, res) => {
  if (req.user?.role !== 'buyer') return res.status(403).json({ message: 'Only buyers can fund a repayment wallet' });
  const amount = number(req.body.amount);
  if (amount <= 0) return res.status(400).json({ message: 'amount must be greater than zero' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO buyer_wallets (user_id, buyer_name) VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [req.user.id, req.user.business_name]
    );
    const wallet = await client.query('SELECT balance FROM buyer_wallets WHERE user_id = $1 FOR UPDATE', [req.user.id]);
    const balance = number(wallet.rows[0].balance) + amount;
    await client.query('UPDATE buyer_wallets SET balance = $2, updated_at = NOW() WHERE user_id = $1', [req.user.id, balance]);
    await client.query(
      `INSERT INTO buyer_wallet_transactions (user_id, type, amount, balance_after)
       VALUES ($1, 'Deposit', $2, $3)`,
      [req.user.id, amount, balance]
    );
    await client.query('COMMIT');
    res.status(201).json({ balance });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: 'Could not fund buyer wallet' });
  } finally {
    client.release();
  }
});

router.get('/', async (req, res) => {
  try {
    const scope = roleScope(req, 'i');
    const result = await pool.query(
      `SELECT r.*, i.invoice_number, i.buyer_name, i.due_date, i.status AS invoice_status
       FROM invoice_repayments r
       LEFT JOIN invoices i ON i.id::TEXT = r.invoice_id
       WHERE ($${scope.params.length + 1}::TEXT IS NULL OR r.status = $${scope.params.length + 1})${scope.clause}
       ORDER BY r.settled_at DESC`,
      [...scope.params, req.query.status || null]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Could not load settlements' });
  }
});

router.get('/due', async (req, res) => {
  try {
    const scope = roleScope(req, 'i');
    const result = await pool.query(
      `SELECT i.*, r.id AS repayment_id,
              CASE WHEN i.due_date < CURRENT_DATE THEN 'Overdue' ELSE 'Due' END AS repayment_state
       FROM invoices i
       LEFT JOIN invoice_repayments r ON r.invoice_id = i.id::TEXT
       WHERE i.funder_id IS NOT NULL
         AND i.status IN ('Funded', 'Matured', 'Overdue')
         AND r.id IS NULL
        ${scope.clause}
       ORDER BY i.due_date ASC NULLS LAST`
      , scope.params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Could not load repayment queue' });
  }
});

router.post('/reconcile-overdue', async (req, res) => {
  if (!['buyer', 'admin'].includes(req.user?.role)) {
    return res.status(403).json({ message: 'Only buyers can reconcile their overdue repayments' });
  }
  try {
    const scope = roleScope(req, 'invoices');
    const result = await pool.query(
      `UPDATE invoices SET status = 'Overdue', current_stage = 'Overdue', overdue_at = COALESCE(overdue_at, NOW()), updated_at = NOW()
       WHERE due_date < CURRENT_DATE AND funder_id IS NOT NULL AND settled_at IS NULL
         AND status IN ('Funded', 'Matured')${scope.clause.replaceAll('invoices.', '')} RETURNING id, invoice_number, buyer_name, funder_id`,
      scope.params
    );
    await Promise.all(result.rows.map((invoice) => publishSettlementNotification(
      invoice.buyer_name,
      `Invoice ${invoice.invoice_number || invoice.id} is overdue and has been escalated for reconciliation.`,
      invoice.id,
      'overdue'
    )));
    res.json({ escalated: result.rowCount, invoices: result.rows });
  } catch (error) {
    res.status(500).json({ message: 'Could not reconcile overdue invoices' });
  }
});

router.post('/:invoiceId/repay', async (req, res) => {
  if (!['buyer', 'admin'].includes(req.user?.role)) {
    return res.status(403).json({ message: 'Only buyers can submit invoice repayment' });
  }
  const { amount_received, platform_fee_rate = 0.005, return_rate, received_at } = req.body;
  const amountReceived = number(amount_received);
  const feeRate = number(platform_fee_rate);

  if (amountReceived <= 0) return res.status(400).json({ message: 'amount_received must be greater than zero' });
  if (feeRate < 0.005 || feeRate > 0.01) return res.status(400).json({ message: 'platform_fee_rate must be between 0.005 and 0.01' });
  if (return_rate !== undefined && (number(return_rate) < 0 || number(return_rate) > 1)) return res.status(400).json({ message: 'return_rate must be between 0 and 1' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const invoiceResult = await client.query('SELECT * FROM invoices WHERE id::TEXT = $1 FOR UPDATE', [req.params.invoiceId]);
    if (!invoiceResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const invoice = invoiceResult.rows[0];
    if (req.user.role === 'buyer' && invoice.buyer_name !== req.user.business_name) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'You can only repay your own buyer invoices' });
    }
    if (!invoice.funder_id) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Only funded invoices can be settled' });
    }
    if (invoice.frozen_at) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Frozen invoices cannot be settled' });
    }
    const existing = await client.query('SELECT id FROM invoice_repayments WHERE invoice_id = $1 FOR UPDATE', [String(invoice.id)]);
    if (existing.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This invoice has already been settled' });
    }

    const principalDue = number(invoice.payout_amount || invoice.invoice_amount);
    const faceValue = number(invoice.invoice_amount);
    const buyerUserId = req.user.role === 'buyer' ? req.user.id : req.body.buyer_user_id;
    if (!buyerUserId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'buyer_user_id is required for admin repayments' });
    }
    await client.query(
      `INSERT INTO buyer_wallets (user_id, buyer_name) VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [buyerUserId, invoice.buyer_name]
    );
    const buyerWallet = await client.query('SELECT balance FROM buyer_wallets WHERE user_id = $1 FOR UPDATE', [buyerUserId]);
    const buyerBalance = number(buyerWallet.rows[0]?.balance);
    if (buyerBalance < amountReceived) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: `Buyer wallet balance is too low. Available: ${buyerBalance.toFixed(2)}; required: ${amountReceived.toFixed(2)}`, available_balance: buyerBalance, required_amount: amountReceived });
    }
    // If no explicit product return is supplied, the invoice discount is the
    // agreed return: the buyer repays face value and the funder receives the
    // deployed principal plus that return, less Clarity's fee.
    const agreedReturnRate = return_rate === undefined
      ? Math.max(0, faceValue - principalDue) / Math.max(principalDue, 1)
      : number(return_rate);
    const returnDue = Math.round(principalDue * agreedReturnRate * 100) / 100;
    const platformFee = Math.round(faceValue * feeRate * 100) / 100;
    const availableForWaterfall = Math.max(0, amountReceived - platformFee);
    const grossFunderDue = principalDue + returnDue;
    // The buyer pays the face value once. Clarity's facilitation fee is taken
    // from that payment, so the funder target is net of the fee rather than
    // requiring the buyer to pay the fee a second time.
    const netFunderDue = Math.max(0, grossFunderDue - platformFee);
    const funderPayout = Math.min(availableForWaterfall, netFunderDue);
    const supplierResidual = Math.max(0, availableForWaterfall - funderPayout);
    const fullySettled = funderPayout >= netFunderDue;
    if (!fullySettled) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: `Repayment is short by ${(netFunderDue - funderPayout).toFixed(2)} after the platform fee`,
        principal_due: principalDue,
        return_due: returnDue,
        platform_fee: platformFee,
        required_amount: grossFunderDue,
      });
    }
    const status = 'Completed';

    const newBuyerBalance = buyerBalance - amountReceived;
    await client.query('UPDATE buyer_wallets SET balance = $2, updated_at = NOW() WHERE user_id = $1', [buyerUserId, newBuyerBalance]);
    await client.query(
      `INSERT INTO buyer_wallet_transactions (user_id, type, amount, balance_after, invoice_id)
       VALUES ($1, 'Repayment', $2, $3, $4)`,
      [buyerUserId, -amountReceived, newBuyerBalance, String(invoice.id)]
    );

    const repayment = await client.query(
      `INSERT INTO invoice_repayments
       (invoice_id, amount_received, principal_due, return_due, platform_fee_rate, platform_fee, funder_payout, supplier_residual, status, received_at, settled_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::TIMESTAMPTZ,NOW()),NOW()) RETURNING *`,
      [String(invoice.id), amountReceived, principalDue, returnDue, feeRate, platformFee, funderPayout, supplierResidual, status, received_at || null]
    );

    await client.query(
      `UPDATE invoices SET repayment_date = COALESCE($2::DATE, CURRENT_DATE), settled_at = CASE WHEN $3 THEN NOW() ELSE NULL END,
       payment_date = COALESCE($2::DATE, CURRENT_DATE), status = 'Completed', current_stage = 'Completed', updated_at = NOW() WHERE id = $1`,
      [invoice.id, received_at || null, fullySettled]
    );
    await client.query(
      `INSERT INTO funder_wallets (funder_id, funder_name, balance)
       VALUES ($1, $1, 0) ON CONFLICT (funder_id) DO NOTHING`,
      [String(invoice.funder_id)]
    );
    const wallet = await client.query('SELECT balance FROM funder_wallets WHERE funder_id = $1 FOR UPDATE', [String(invoice.funder_id)]);
    const walletBalance = number(wallet.rows[0]?.balance);
    const newWalletBalance = walletBalance + funderPayout;
    await client.query('UPDATE funder_wallets SET balance = $2, updated_at = NOW() WHERE funder_id = $1', [String(invoice.funder_id), newWalletBalance]);
    await client.query(
      `INSERT INTO wallet_transactions (funder_id, type, amount, balance_after, invoice_id, status, completed_at)
       VALUES ($1, 'Repayment Settlement', $2, $3, $4, 'Completed', NOW())`,
      [String(invoice.funder_id), funderPayout, newWalletBalance, String(invoice.id)]
    );
    await client.query(
      `INSERT INTO invoice_history (invoice_id, stage, actor, note) VALUES ($1, $2, $3, $4)`,
      [invoice.id, status, req.user?.email || 'Settlement Engine', `Waterfall: funder ${funderPayout}, fee ${platformFee}`]
    );
    await client.query('COMMIT');
    reconcileInvoice(invoice.id).catch((error) => console.error('Calendar repayment sync failed:', error.message));

    await publishSettlementNotification(invoice.buyer_name, `Repayment received for invoice ${invoice.invoice_number || invoice.id}. Settlement status: ${status}.`, invoice.id, 'repayment');
    await publishSettlementNotification(invoice.funder_id, `Settlement completed for invoice ${invoice.invoice_number || invoice.id}. Funder payout: ${funderPayout.toFixed(2)}.`, invoice.id, 'settlement');
    res.status(201).json(repayment.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Repayment failed:', error.message);
    res.status(500).json({ message: 'Could not process repayment' });
  } finally {
    client.release();
  }
});

module.exports = router;