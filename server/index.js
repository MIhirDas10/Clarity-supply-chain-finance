// Clarity - Apurba Roy (23101012)
//
// Feature 01  /api/invoices   Invoice Upload with OCR Parsing & Cloud Storage
// Feature 02  /api/disputes   Dispute Filing & Invoice Freeze
//
// /api/payouts is older supporting screen, kept so the app still runs.
// It is not part of the API assignment.

const express = require('express');
const cors = require('cors');
const pool = require('./db');

const invoiceRoutes = require('./routes/invoiceRoutes'); // Feature 01
const disputeRoutes = require('./routes/disputeRoutes'); // Feature 02

const app = express();

// The assignment asks for the last four digits of the student id: 23101012.
const PORT = 1012;

app.use(cors());         // lets the React app on port 5173 call this server
app.use(express.json()); // lets us read JSON sent in a POST body

app.use('/api/invoices', invoiceRoutes);
app.use('/api/disputes', disputeRoutes);

// ---------------------------------------------------------------------------
// Supporting screen only - the payout ledger the app's history page reads.
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

app.get('/api/payouts', async (req, res) => {
  try {
    const result = await pool.query(LEDGER_QUERY, [req.query.supplierId || 1]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Could not load payout history' });
  }
});

app.get('/api/payouts/export.csv', async (req, res) => {
  try {
    const result = await pool.query(LEDGER_QUERY, [req.query.supplierId || 1]);

    const lines = ['Invoice Number,Buyer,Status,Invoice Amount,Payout Received,Discount Paid,Funder,Submitted Date,Payment Date'];

    for (const row of result.rows) {
      const buyer = row.buyer_name === null ? '' : '"' + row.buyer_name + '"';
      const funder = row.funder_name === null ? '' : '"' + row.funder_name + '"';
      lines.push([
        row.invoice_number, buyer, row.status, row.invoice_amount,
        row.payout_amount, row.discount_amount, funder,
        row.submitted_date, row.payment_date,
      ].join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="payout-history.csv"');
    res.send(lines.join('\n'));
  } catch (error) {
    res.status(500).json({ message: 'Could not export payout history' });
  }
});

app.listen(PORT, () => {
  console.log('Clarity API running on http://localhost:' + PORT);
});