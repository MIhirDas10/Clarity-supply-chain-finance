// Clarity - Payout History API
// Two endpoints:  read the ledger as JSON, and download it as CSV.

const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
const PORT = 4000;

app.use(cors()); // lets the React app on port 5173 call this server on port 4000

// This one query is the heart of the feature.
// It joins payouts to funders so we get the funder's NAME instead of their id,
// and it calculates the discount instead of storing it.
const LEDGER_QUERY = `
  SELECT
    p.id,
    p.invoice_number,
    p.invoice_amount,
    p.payout_amount,
    p.invoice_amount - p.payout_amount AS discount_amount,
    f.name AS funder_name,
    p.payment_date
  FROM payouts p
  JOIN funders f ON f.id = p.funder_id
  WHERE p.supplier_id = $1
  ORDER BY p.payment_date DESC
`;

// GET /api/payouts?supplierId=1  ->  the ledger as JSON, for the table
app.get('/api/payouts', async (req, res) => {
  try {
    const supplierId = req.query.supplierId || 1;
    const result = await pool.query(LEDGER_QUERY, [supplierId]);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not load payout history' });
  }
});

// GET /api/payouts/export.csv?supplierId=1  ->  the same rows as a CSV file
app.get('/api/payouts/export.csv', async (req, res) => {
  try {
    const supplierId = req.query.supplierId || 1;
    const result = await pool.query(LEDGER_QUERY, [supplierId]);

    // Build the file one line at a time. Line 1 is the column headings.
    const lines = [
      'Invoice Number,Invoice Amount,Payout Received,Discount Paid,Funder,Payment Date',
    ];

    for (const row of result.rows) {
      const date = row.payment_date.toISOString().slice(0, 10); // 2026-08-03
      lines.push(
        [
          row.invoice_number,
          row.invoice_amount,
          row.payout_amount,
          row.discount_amount,
          '"' + row.funder_name + '"', // quoted, in case a name contains a comma
          date,
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

app.listen(PORT, () => {
  console.log('Clarity API running on http://localhost:' + PORT);
});
