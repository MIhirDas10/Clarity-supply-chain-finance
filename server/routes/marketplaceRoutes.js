const express = require('express');
const router = express.Router();
const pool = require('../db');

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
    // Execute update
    const updateRes = await client.query(
      `UPDATE invoices 
       SET status = 'Funded', current_stage = 'Funded', funder_id = $2, funded_at = NOW(), updated_at = NOW() 
       WHERE id = $1 RETURNING *`,
      [invoiceId, funderId]
    );
    // Log stage transition
    await client.query(
      `INSERT INTO invoice_history (invoice_id, stage, actor) VALUES ($1, 'Funded', $2)`,
      [invoiceId, funderName]
    );

    await client.query('COMMIT');
    res.json({ success: true, invoice: updateRes.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error funding invoice:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }});
module.exports = router;
