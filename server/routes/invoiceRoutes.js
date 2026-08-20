// Feature 01 - Invoice Upload with OCR Parsing & Cloud Storage
// (Apurba Roy, SL 3)   Mounted at /api/invoices
//
// The OCR itself runs in the browser. These endpoints check what it read,
// block an invoice that has already been submitted, and store the result.

const express = require('express');
const cloudinary = require('cloudinary').v2;
const pool = require('../db');

const router = express.Router();

// The SDK reads CLOUDINARY_URL from .env by itself, so the cloud name, API key
// and secret never appear in the code and never reach the browser.

// Checks the four fields the OCR filled in. Returns a list of what is wrong,
// so the supplier is told everything at once instead of one thing at a time.
function findProblems({ buyer_name, invoice_number, invoice_amount, due_date }) {
  const problems = [];

  if (!buyer_name) problems.push('buyer name is missing');
  if (!invoice_number) problems.push('invoice number is missing');

  if (!invoice_amount) {
    problems.push('amount is missing');
  } else if (isNaN(Number(invoice_amount)) || Number(invoice_amount) <= 0) {
    problems.push('amount must be a number greater than zero');
  }

  if (!due_date) {
    problems.push('due date is missing');
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
    problems.push('due date must be written as YYYY-MM-DD');
  }

  return problems;
}

// 0. POST /api/invoices/upload-file
//    Stores the invoice document in Cloudinary and hands back its link.
//
//    The browser sends the file as a data URI - the same string it already
//    built to show the preview - so no extra library is needed to read a
//    multipart form. Cloudinary accepts a data URI directly.
router.post('/upload-file', async (req, res) => {
  const { file, file_name } = req.body;

  if (!file) {
    return res.status(400).json({ message: 'file is required' });
  }
  if (!file.startsWith('data:')) {
    return res.status(400).json({ message: 'file must be a data URI' });
  }

  try {
    // resource_type 'auto' lets Cloudinary work out whether this is an image
    // or a PDF. Everything lands in one folder so invoices stay together.
    const uploaded = await cloudinary.uploader.upload(file, {
      folder: 'clarity/invoices',
      resource_type: 'auto',
    });

    res.status(201).json({
      file_url: uploaded.secure_url,
      file_name: file_name || uploaded.original_filename,
      bytes: uploaded.bytes,
      format: uploaded.format,
    });
  } catch (error) {
    console.error('Cloudinary upload failed:', error.message);
    res.status(502).json({ message: 'Could not store the document: ' + error.message });
  }
});

// 1. POST /api/invoices/check-duplicate
//    Called before the supplier confirms, so they find out early that this
//    invoice has already been submitted - the same invoice must never be
//    financed twice.
router.post('/check-duplicate', async (req, res) => {
  const { invoice_number, supplier_id } = req.body;

  if (!invoice_number) {
    return res.status(400).json({ message: 'invoice_number is required' });
  }

  try {
    const found = await pool.query(
      `SELECT id, invoice_number, buyer_name, invoice_amount, submitted_date
       FROM invoices
       WHERE invoice_number = $1 AND supplier_id = $2`,
      [invoice_number, String(supplier_id || 1)]
    );

    res.json({
      invoice_number: invoice_number,
      duplicate: found.rowCount > 0,
      existing: found.rows[0] || null,
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not check that invoice number' });
  }
});

// 2. POST /api/invoices - save the invoice the supplier just confirmed
router.post('/', async (req, res) => {
  const { supplier_id, buyer_name, invoice_number, invoice_amount, due_date, file_url } = req.body;

  const problems = findProblems(req.body);
  if (problems.length > 0) {
    return res.status(400).json({ message: 'Please fix: ' + problems.join(', ') });
  }

  try {
    // The same screening as the endpoint above, repeated here because the
    // browser could skip that step. The server is the only place we can
    // actually enforce it.
    const clash = await pool.query(
      'SELECT id FROM invoices WHERE invoice_number = $1 AND supplier_id = $2',
      [invoice_number, String(supplier_id || 1)]
    );
    if (clash.rowCount > 0) {
      return res.status(409).json({ message: 'That invoice number has already been submitted' });
    }

    // A new invoice starts at the first stage of the pipeline. It has no
    // funder and no payout yet - those come later, from other features.
    const saved = await pool.query(
      `INSERT INTO invoices
         (supplier_id, buyer_name, invoice_number, invoice_amount,
          due_date, submitted_date, status, file_url, number, amount)
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, 'Submitted', $6, $7, $8)
       RETURNING id, invoice_number, buyer_name, invoice_amount, due_date, status`,
      [
        String(supplier_id || 1), buyer_name, invoice_number, Number(invoice_amount),
        due_date, file_url || null,
        invoice_number,               // another member's column name for the same value
        String(invoice_amount),       // same again, stored as text on their side
      ]
    );

    res.status(201).json(saved.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Could not save the invoice' });
  }
});

// 3. GET /api/invoices - every invoice, newest first
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, invoice_number, buyer_name, supplier_id, status,
              invoice_amount, payout_amount, file_url, frozen_at,
              TO_CHAR(due_date, 'YYYY-MM-DD')       AS due_date,
              TO_CHAR(submitted_date, 'YYYY-MM-DD') AS submitted_date
       FROM invoices
       ORDER BY submitted_date DESC NULLS LAST, id DESC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Could not load invoices' });
  }
});

// 4. GET /api/invoices/:id - one invoice
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, invoice_number, buyer_name, supplier_id, status,
              invoice_amount, payout_amount, file_url, frozen_at,
              TO_CHAR(due_date, 'YYYY-MM-DD')       AS due_date,
              TO_CHAR(submitted_date, 'YYYY-MM-DD') AS submitted_date
       FROM invoices WHERE id::TEXT = $1`,
      [req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'No invoice with that id' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Could not load that invoice' });
  }
});

// 5. PATCH /api/invoices/:id - correct a field the OCR read wrongly.
//    Only allowed while the invoice is still at the Submitted stage; once a
//    buyer has confirmed it, the amount is part of an agreement.
router.patch('/:id', async (req, res) => {
  const { buyer_name, invoice_amount, due_date } = req.body;

  if (!buyer_name && !invoice_amount && !due_date) {
    return res.status(400).json({ message: 'Send at least one field to change' });
  }
  if (invoice_amount && (isNaN(Number(invoice_amount)) || Number(invoice_amount) <= 0)) {
    return res.status(400).json({ message: 'amount must be a number greater than zero' });
  }
  if (due_date && !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
    return res.status(400).json({ message: 'due date must be written as YYYY-MM-DD' });
  }

  try {
    const invoice = await pool.query('SELECT status FROM invoices WHERE id::TEXT = $1', [req.params.id]);
    if (invoice.rowCount === 0) {
      return res.status(404).json({ message: 'No invoice with that id' });
    }
    if (invoice.rows[0].status !== 'Submitted') {
      return res.status(409).json({ message: 'This invoice has moved past Submitted and can no longer be edited' });
    }

    // COALESCE keeps the old value whenever a field was left out of the request.
    const updated = await pool.query(
      `UPDATE invoices
       SET buyer_name     = COALESCE($1, buyer_name),
           invoice_amount = COALESCE($2, invoice_amount),
           due_date       = COALESCE($3::DATE, due_date)
       WHERE id::TEXT = $4
       RETURNING id, invoice_number, buyer_name, invoice_amount, status`,
      [buyer_name || null, invoice_amount || null, due_date || null, req.params.id]
    );

    res.json(updated.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Could not update that invoice' });
  }
});

// 6. DELETE /api/invoices/:id - withdraw an invoice uploaded by mistake.
//    Same rule: only while nobody else has acted on it.
router.delete('/:id', async (req, res) => {
  try {
    const removed = await pool.query(
      "DELETE FROM invoices WHERE id::TEXT = $1 AND status = 'Submitted' RETURNING id, invoice_number",
      [req.params.id]
    );

    if (removed.rowCount === 0) {
      return res.status(409).json({
        message: 'No invoice was removed - it does not exist, or it has moved past Submitted',
      });
    }
    res.json({ deleted: true, invoice: removed.rows[0] });
  } catch (error) {
    res.status(500).json({ message: 'Could not remove that invoice' });
  }
});

// ---------------------------------------------------------------------------
// Confirmations API (Buyer Confirmation)
// ---------------------------------------------------------------------------
router.get('/confirmations/pending', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM invoices WHERE status = 'Submitted' AND buyer_name = $1 ORDER BY id DESC`,
      [req.query.buyer]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/confirmations/history', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM invoices WHERE status IN ('Buyer Confirmed', 'Disputed') AND buyer_name = $1 ORDER BY id DESC`,
      [req.query.buyer]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/confirmations/:id/confirm', async (req, res) => {
  try {
    const { buyer_name, acknowledgment_text } = req.body;
    const invoiceId = req.params.id;
    
    // Update invoice status
    const result = await pool.query(
      "UPDATE invoices SET status = 'Buyer Confirmed', current_stage = 'Buyer Confirmed' WHERE id = $1 AND buyer_name = $2 RETURNING *",
      [invoiceId, buyer_name]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Invoice not found or unauthorized' });
    }

    res.status(200).json({ message: 'Invoice confirmed successfully', invoice: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
