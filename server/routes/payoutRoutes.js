// Payout ledger - supporting screen for the supplier's history page.
// (Apurba) Mounted at /api/payouts
//
// Not one of the graded features, but the Payout History page reads it.

const express = require('express');
const pool = require('../db');

const router = express.Router();

// LEFT JOIN, not JOIN: an invoice with no funder yet must still appear in the
// ledger. The discount is calculated here rather than stored, so it can never
// disagree with the two amounts it comes from.
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

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(LEDGER_QUERY, [req.query.supplierId || 1]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Could not load payout history' });
  }
});

router.get('/export.csv', async (req, res) => {
  try {
    const result = await pool.query(LEDGER_QUERY, [req.query.supplierId || 1]);

    const lines = ['Invoice Number,Buyer,Status,Invoice Amount,Payout Received,Discount Paid,Funder,Submitted Date,Payment Date'];

    for (const row of result.rows) {
      // Empty values must become empty cells, not the word "null". Text is
      // quoted in case a company name contains a comma.
      const buyer = row.buyer_name === null ? '' : '"' + row.buyer_name + '"';
      const funder = row.funder_name === null ? '' : '"' + row.funder_name + '"';
      lines.push([
        row.invoice_number, buyer, row.status, row.invoice_amount,
        row.payout_amount, row.discount_amount, funder,
        row.submitted_date, row.payment_date,
      ].join(','));
    }

    // These two headers are what make the browser download a file.
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="payout-history.csv"');
    res.send(lines.join('\n'));
  } catch (error) {
    res.status(500).json({ message: 'Could not export payout history' });
  }
});

module.exports = router;
