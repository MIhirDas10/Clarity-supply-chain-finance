const express = require('express');
const router = express.Router();
const pool = require('../db');
const { reconcileInvoice } = require('../services/calendarSync');
const credit = require('../controllers/creditController');

// GET /api/marketplace/invoices
router.get('/invoices', async (req, res) => {
  const { riskRating, industry, minAmount, maxAmount } = req.query;
  try {let query = `
      SELECT i.*
      FROM invoices i
      WHERE i.status = 'Buyer Confirmed' AND i.funder_id IS NULL
    `;
    const params = [];
    let paramIndex = 1;

    if (riskRating && riskRating !== 'All') {
      query += ` AND i.risk_rating = $${paramIndex++}`;
      params.push(riskRating);
    }
    if (minAmount) {
      query += ` AND i.invoice_amount >= $${paramIndex++}`;
      params.push(minAmount);
    }
    if (maxAmount) {
      query += ` AND i.invoice_amount <= $${paramIndex++}`;
      params.push(maxAmount);}
    query += ' ORDER BY i.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching marketplace invoices:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/marketplace/:invoiceId/fund
router.post('/:invoiceId/fund', async (req, res) => {
  const { invoiceId } = req.params;
  const { funderId, funderName } = req.body;

  if (!funderId || !funderName) {
    return res.status(400).json({ error: 'Funder ID and name are required' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Acquire row-level lock
    const checkRes = await client.query(
      'SELECT * FROM invoices WHERE id = $1 FOR UPDATE',
      [invoiceId]
    );

    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = checkRes.rows[0];

    // Validate status and funder_id
    if (invoice.status !== 'Buyer Confirmed' || invoice.funder_id !== null) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Invoice already claimed by another funder' });
    }

    // Credit-limit control (see creditController.checkCreditLimit): reject
    // funding that would push the buyer past their score-recommended, override,
    // or analyst-set credit limit. Same enforcement the wallet/Auto-Invest
    // paths use, so the marketplace honours it too.
    const faceValue = Number(invoice.invoice_amount);
    const limitCheck = await credit.checkCreditLimit(client, invoice.buyer_name, faceValue);
    if (!limitCheck.ok) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: limitCheck.reason });
    }

    // Risk-based pricing: record the discounted payout the supplier receives
    // (face - risk premium). The discount is the funder's return at settlement.
    // Same math as the wallet path and GET /pricing, so the marketplace honours
    // the buyer's credit score too.
    const tenorDays = credit.tenorDaysUntil(invoice.due_date);
    const quote = await credit.quoteForBuyer(invoice.buyer_name, faceValue, tenorDays);
    const payout = (quote.supplierPayout > 0 && quote.supplierPayout <= faceValue)
      ? quote.supplierPayout : faceValue;

    // Execute update
    const updateRes = await client.query(
      `UPDATE invoices
       SET status = 'Funded', current_stage = 'Funded', funder_id = $2, funded_at = NOW(),
           payout_amount = $3, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [invoiceId, funderId, payout]
    );
    // Log stage transition
    await client.query(
      `INSERT INTO invoice_history (invoice_id, stage, actor) VALUES ($1, 'Funded', $2)`,
      [invoiceId, funderName]
    );

    await client.query('COMMIT');
    reconcileInvoice(invoiceId).catch((error) => console.error('Calendar funding sync failed:', error.message));
    res.json({ success: true, invoice: updateRes.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error funding invoice:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }});
module.exports = router;
