const express = require('express');
const router = express.Router();
const pool = require('../db');
const { calculateInvoiceRisk } = require('../services/riskRatingEngine');

// GET /api/confirmations/pending
router.get('/pending', async (req, res) => {
  try {
    let query = 'SELECT * FROM invoices WHERE status = $1';
    const params = ['Submitted'];
    
    // If the user is a buyer, only return their invoices. Admin sees all.
    if (req.user && req.user.role === 'buyer') {
      query += ' AND buyer_name = $2';
      params.push(req.user.business_name);
    }
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching pending invoices:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/confirmations/history
router.get('/history', async (req, res) => {
  try {
    let query = 'SELECT * FROM invoices WHERE status IN ($1, $2)';
    const params = ['Buyer Confirmed', 'Disputed'];
    
    // If the user is a buyer, only return their invoices.
    if (req.user && req.user.role === 'buyer') {
      query += ' AND buyer_name = $3';
      params.push(req.user.business_name);
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
  const { buyer_name, acknowledgment_text, signatureBase64 } = req.body;
  
  if (!buyer_name || !acknowledgment_text || !signatureBase64) {
    return res.status(400).json({ message: 'Buyer name, acknowledgment text, and signature are required.' });
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
    // We upload the base64 signature to Cloudinary
    let signature_url = null;
    try {
      const cloudinary = require('cloudinary').v2;
      const uploaded = await cloudinary.uploader.upload(signatureBase64, {
        folder: 'clarity/signatures',
        resource_type: 'image'
      });
      signature_url = uploaded.secure_url;
    } catch (uploadErr) {
      console.error('Signature upload failed:', uploadErr);
      await client.query('ROLLBACK');
      return res.status(500).json({ message: 'Failed to upload digital signature.' });
    }

    const confirmRes = await client.query(
      `INSERT INTO invoice_confirmations (invoice_id, buyer_name, acknowledgment_text, signature_url) 
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [invoiceId, buyer_name, acknowledgment_text, signature_url]
    );
    const confirmationId = confirmRes.rows[0].id;

    // Calculate Risk Rating (Mocked buyer data as per constraints/plan)
    const buyerData = {
      onTimePaymentsRatio: 0.92,
      isVerified: true,
      accountAgeMonths: 36,
      averageInvoiceAmount: 500000
    };
    const riskResult = calculateInvoiceRisk(buyerData, invoice.invoice_amount || invoice.amount || 0);

    // 3. Update invoice status to Buyer Confirmed, set timestamps and risk fields
    await client.query(
      `UPDATE invoices 
       SET status = 'Buyer Confirmed', current_stage = 'Buyer Confirmed', buyer_confirmed_at = NOW(), confirmation_id = $2, updated_at = NOW(),
           risk_score = $3, risk_rating = $4, expected_yield = $5
       WHERE id = $1`,
      [invoiceId, confirmationId, riskResult.score, riskResult.rating, riskResult.expectedYield]
    );

    // 3b. Save detailed evaluation
    await client.query(
      `INSERT INTO invoice_risk_evaluations (invoice_id, timeliness_score, membership_score, volume_score, age_score, total_score)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [invoiceId, riskResult.details.timelinessScore, riskResult.details.membershipScore, riskResult.details.volumeScore, riskResult.details.ageScore, riskResult.score]
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
    require('fs').appendFileSync('error.log', error.stack + '\n');
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
