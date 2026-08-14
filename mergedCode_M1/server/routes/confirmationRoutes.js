const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/confirmations/pending?buyer=X
router.get('/pending', async (req, res) => {
  const { buyer } = req.query;
  try {
    let query = 'SELECT * FROM invoices WHERE status = $1';
    const params = ['Submitted'];
    
    if (buyer) {
      query += ' AND buyer_name = $2';
      params.push(buyer);
    }
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching pending invoices:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/confirmations/history?buyer=X
router.get('/history', async (req, res) => {
  const { buyer } = req.query;
  try {
    let query = 'SELECT * FROM invoices WHERE status IN ($1, $2)';
    const params = ['Buyer Confirmed', 'Disputed'];
    
    if (buyer) {
      query += ' AND buyer_name = $3';
      params.push(buyer);
    }
    
    // Order by the most recently updated
    query += ' ORDER BY updated_at DESC NULLS LAST';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching history invoices:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/confirmations/:invoiceId/confirm
router.post('/:invoiceId/confirm', async (req, res) => {
  const { invoiceId } = req.params;
  const { buyer_name, acknowledgment_text } = req.body;
  
  if (!buyer_name || !acknowledgment_text) {
    return res.status(400).json({ message: 'Buyer name and acknowledgment text are required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify invoice exists and is in "Submitted" status
    const invoiceRes = await client.query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
    if (invoiceRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Invoice not found.' });
    }
    
    const invoice = invoiceRes.rows[0];
    if (invoice.status !== 'Submitted') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Only Submitted invoices can be confirmed.' });
    }

    // 2. Insert into invoice_confirmations
    const confirmRes = await client.query(
      `INSERT INTO invoice_confirmations (invoice_id, buyer_name, acknowledgment_text) 
       VALUES ($1, $2, $3) RETURNING id`,
      [invoiceId, buyer_name, acknowledgment_text]
    );
    const confirmationId = confirmRes.rows[0].id;

    // 3. Update invoice status to Buyer Confirmed and set timestamps
    await client.query(
      `UPDATE invoices 
       SET status = 'Buyer Confirmed', current_stage = 'Buyer Confirmed', buyer_confirmed_at = NOW(), confirmation_id = $2, updated_at = NOW() 
       WHERE id = $1`,
      [invoiceId, confirmationId]
    );

    // 4. Record in invoice_history (Mihir's pipeline expectation)
    await client.query(
      `INSERT INTO invoice_history (invoice_id, stage, actor) VALUES ($1, 'Buyer Confirmed', $2)`,
      [invoiceId, buyer_name]
    );

    await client.query('COMMIT');
    res.json({ success: true, confirmationId, status: 'Buyer Confirmed' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error confirming invoice:', error);
    // Handle unique constraint violation
    if (error.code === '23505') {
      res.status(400).json({ message: 'This invoice has already been confirmed.' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  } finally {
    client.release();
  }
});

// POST /api/confirmations/:invoiceId/dispute
router.post('/:invoiceId/dispute', async (req, res) => {
  const { invoiceId } = req.params;
  const { buyer_name, reason } = req.body;

  if (!buyer_name || !reason) {
    return res.status(400).json({ message: 'Buyer name and reason are required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify invoice exists
    const invoiceRes = await client.query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
    if (invoiceRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Invoice not found.' });
    }

    const invoice = invoiceRes.rows[0];
    if (invoice.status !== 'Submitted') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Only Submitted invoices can be disputed.' });
    }

    // 2. Update invoice status to Disputed
    await client.query(
      `UPDATE invoices 
       SET status = 'Disputed', current_stage = 'Disputed', updated_at = NOW() 
       WHERE id = $1`,
      [invoiceId]
    );

    // 3. Record in invoice_history with reason as part of the actor or separate column if modified. We append it to actor string for now.
    await client.query(
      `INSERT INTO invoice_history (invoice_id, stage, actor) VALUES ($1, 'Disputed', $2)`,
      [invoiceId, `${buyer_name} (Reason: ${reason})`]
    );

    await client.query('COMMIT');
    res.json({ success: true, status: 'Disputed' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error disputing invoice:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
