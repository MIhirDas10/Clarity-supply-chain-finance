// Clarity - Invoice Upload + Payout History API   (Apurba)
//
// Originally a standalone Express app (server/index.js). It is now an Express
// Router so the whole platform can run on one server. The handler logic is
// unchanged; only the `app` object became `router`, and the listen() call moved
// to the shared entry point (../index.js).
//
//   POST /api/invoices              save an uploaded invoice
//   GET  /api/invoices              every invoice in the shared table
//   GET  /api/payouts               the ledger, as JSON, for the table
//   GET  /api/payouts/export.csv    the same rows as a downloadable file

const express = require('express');
const router = express.Router();
const pool = require('../db');

// The platform's standard early-payment discount.
// A supplier who submits a 1,00,000 taka invoice receives 97,000 taka now and
// pays 3,000 taka for not having to wait 90 days for the buyer to pay.
const DISCOUNT_RATE = 0.03;

// ---------------------------------------------------------------------------
// The ledger query - the heart of Payout History.
//
// LEFT JOIN, not JOIN: a plain JOIN would throw away every invoice that has
// no funder yet, and the ledger has to show every invoice ever submitted.
//
// The discount is calculated here instead of being stored. If payout_amount
// is empty the subtraction gives an empty result too, which is correct - an
// invoice that has not been funded has no discount yet.
// ---------------------------------------------------------------------------
const LEDGER_QUERY = `
  SELECT
    i.id,
    i.invoice_number,
    i.buyer_name,
    i.status,
    i.invoice_amount,
    i.payout_amount,
    i.invoice_amount - i.payout_amount AS discount_amount,
    f.name AS funder_name,
    TO_CHAR(i.submitted_date, 'YYYY-MM-DD') AS submitted_date,
    TO_CHAR(i.payment_date, 'YYYY-MM-DD') AS payment_date
  FROM invoices i
  LEFT JOIN funders f ON f.id = i.funder_id
  WHERE i.supplier_id = $1
  ORDER BY i.submitted_date DESC NULLS LAST, i.id DESC
`;

// ---------------------------------------------------------------------------
// POST /api/invoices  ->  save an invoice the supplier just uploaded
// ---------------------------------------------------------------------------
router.post('/invoices', async (req, res) => {
  // Two screens post to this endpoint and they name things differently:
  // the OCR upload page sends invoice_amount / file_name, Digonta's form
  // sends amount / file_url. Accept either.
  const {
    supplier_id, buyer_name, invoice_number, due_date,
    invoice_amount, amount: amountAlias,
    file_name, file_url,
    discounted_amount, discount_days,
  } = req.body;

  const rawAmount = invoice_amount || amountAlias;
  const document = file_url || file_name || null;

  // Never trust what arrives from the browser. OCR can misread a field, and
  // the supplier can edit any of them by hand before pressing submit.
  const missing = [];
  if (!buyer_name) missing.push('buyer name');
  if (!invoice_number) missing.push('invoice number');
  if (!rawAmount) missing.push('amount');
  if (!due_date) missing.push('due date');

  if (missing.length > 0) {
    return res.status(400).json({ message: 'Please fill in: ' + missing.join(', ') });
  }

  const amount = Number(rawAmount);
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ message: 'The amount must be a number greater than zero.' });
  }

  try {
    // Work out what the supplier will actually receive. If the discount slider
    // was used, that figure is already worked out on screen and the supplier
    // agreed to it, so honour it. Otherwise apply the standard rate.
    // Rounding to 2 decimal places keeps it to whole paisa - money should
    // never carry a long tail of decimals.
    const payout = discounted_amount
      ? Number(discounted_amount)
      : Math.round(amount * (1 - DISCOUNT_RATE) * 100) / 100;

    // Match the invoice to a funder straight away, so the supplier can see who
    // is backing it and exactly what they will be paid.
    const funders = await pool.query('SELECT id FROM funders ORDER BY random() LIMIT 1');
    const funderId = funders.rows.length > 0 ? funders.rows[0].id : null;

    // The invoice is now funded: it has a funder, a payout and a discount.
    // payment_date stays empty until the money actually lands.
    //
    // TEMPORARY: "number" and "amount" are another member's versions of
    // invoice_number and invoice_amount. They are NOT NULL on the shared
    // database, so we have to fill them in as well or the insert is rejected.
    // Delete them once the group agrees on a single set of column names.
    const result = await pool.query(
      `INSERT INTO invoices
         (supplier_id, buyer_name, invoice_number, invoice_amount,
          due_date, submitted_date, status, file_name,
          funder_id, payout_amount,
          number, amount)
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, 'Funded', $6,
               $7, $8,
               $9, $10)
       RETURNING id, invoice_number`,
      [
        String(supplier_id || 1),  // supplier_id is TEXT so Digonta's "sup-420" fits too
        buyer_name, invoice_number, amount, due_date, document,
        funderId, payout,
        invoice_number,   // $9  -> "number", their column, holds the same value
        String(amount),   // $10 -> "amount", their column, stores it as text
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not save the invoice' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/invoices  ->  every invoice in the shared table, whoever added it.
//
// No supplier filter here on purpose. This is the "My Invoices" screen, and it
// has to show invoices submitted through Digonta's form as well as our own.
//
// "amount" and "file_url" are Digonta's column names; they are returned as well
// so his invoice table renders the amount and the file link correctly.
// ---------------------------------------------------------------------------
router.get('/invoices', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        i.id,
        i.invoice_number,
        i.buyer_name,
        i.supplier_id,
        i.status,
        i.invoice_amount,
        i.amount,
        i.file_url,
        i.payout_amount,
        f.name AS funder_name,
        TO_CHAR(i.due_date, 'YYYY-MM-DD') AS due_date,
        TO_CHAR(i.submitted_date, 'YYYY-MM-DD') AS submitted_date
      FROM invoices i
      LEFT JOIN funders f ON f.id = i.funder_id
      ORDER BY i.submitted_date DESC NULLS LAST, i.id DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not load invoices' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/payouts?supplierId=1  ->  the ledger as JSON
// ---------------------------------------------------------------------------
router.get('/payouts', async (req, res) => {
  try {
    const supplierId = req.query.supplierId || 1;
    const result = await pool.query(LEDGER_QUERY, [supplierId]);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not load payout history' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/payouts/export.csv?supplierId=1  ->  the same rows as a CSV file
// ---------------------------------------------------------------------------
router.get('/payouts/export.csv', async (req, res) => {
  try {
    const supplierId = req.query.supplierId || 1;
    const result = await pool.query(LEDGER_QUERY, [supplierId]);

    // Build the file one line at a time. Line 1 is the column headings.
    const lines = [
      'Invoice Number,Buyer,Status,Invoice Amount,Payout Received,Discount Paid,Funder,Submitted Date,Payment Date',
    ];

    for (const row of result.rows) {
      // Empty database values must become empty cells, not the word "null".
      // Text is wrapped in quotes in case a company name contains a comma.
      const buyer = row.buyer_name === null ? '' : '"' + row.buyer_name + '"';
      const funder = row.funder_name === null ? '' : '"' + row.funder_name + '"';

      lines.push(
        [
          row.invoice_number,
          buyer,
          row.status,
          row.invoice_amount,
          row.payout_amount,
          row.discount_amount,
          funder,
          row.submitted_date,
          row.payment_date,
        ].join(',')
      );
    }

    // These two headers are what make the browser download a file
    // instead of just showing the text on screen.
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="payout-history.csv"');
    res.send(lines.join('\n'));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not export payout history' });
  }
});

module.exports = router;
