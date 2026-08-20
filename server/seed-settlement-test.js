require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const pool = require('./db');

const BUYER_ID = 3;
const BUYER_NAME = 'Apex Footwear Ltd';
const FUNDER_ID = 'F-14';
const FUNDER_NAME = 'jhv';

const TEST_INVOICES = [
  {
    number: 'TEST-SETTLEMENT-ACTIVE',
    amount: 1000000,
    payout: 970000,
    due: '2026-09-15',
    status: 'Funded',
  },
  {
    number: 'TEST-SETTLEMENT-OVERDUE',
    amount: 500000,
    payout: 485000,
    due: '2026-08-01',
    status: 'Overdue',
  },
  {
    number: 'TEST-SETTLEMENT-COMPLETED',
    amount: 750000,
    payout: 727500,
    due: '2026-07-31',
    status: 'Completed',
  },
];

async function resetTestData(client) {
  const invoices = await client.query(
    `SELECT id FROM invoices WHERE invoice_number LIKE 'TEST-SETTLEMENT-%'`
  );
  const invoiceIds = invoices.rows.map((row) => row.id);

  if (invoiceIds.length) {
    await client.query(
      `DELETE FROM invoice_repayments WHERE invoice_id = ANY($1::TEXT[])`,
      [invoiceIds]
    );
    await client.query(
      `DELETE FROM buyer_wallet_transactions WHERE invoice_id = ANY($1::TEXT[])`,
      [invoiceIds]
    );
    await client.query(
      `DELETE FROM wallet_transactions WHERE invoice_id = ANY($1::TEXT[])`,
      [invoiceIds]
    );
    await client.query(
      `DELETE FROM invoice_history WHERE invoice_id = ANY($1::UUID[]) AND actor = 'Settlement Test Seed'`,
      [invoiceIds]
    );
    await client.query(
      `UPDATE invoices
       SET status = CASE WHEN invoice_number = 'TEST-SETTLEMENT-OVERDUE' THEN 'Overdue' ELSE 'Funded' END,
           current_stage = CASE WHEN invoice_number = 'TEST-SETTLEMENT-OVERDUE' THEN 'Overdue' ELSE 'Funded' END,
           due_date = CASE WHEN invoice_number = 'TEST-SETTLEMENT-COMPLETED' THEN DATE '2026-09-01' ELSE due_date END,
           payment_date = NULL, repayment_date = NULL, settled_at = NULL, overdue_at = NULL, updated_at = NOW()
       WHERE invoice_number LIKE 'TEST-SETTLEMENT-%'`
    );
  }

  await client.query(
    `DELETE FROM wallet_transactions WHERE funder_id = $1 AND type = 'Test Invoice Funding'`,
    [FUNDER_ID]
  );
  await client.query(
    `DELETE FROM buyer_wallet_transactions WHERE user_id = $1 AND type IN ('Deposit', 'Test Deposit')`,
    [BUYER_ID]
  );
  await client.query(
    `UPDATE buyer_wallets SET balance = 3000000, updated_at = NOW() WHERE user_id = $1`,
    [BUYER_ID]
  );
  await client.query(
    `UPDATE funder_wallets SET balance = 10000000, updated_at = NOW() WHERE funder_id = $1`,
    [FUNDER_ID]
  );
}

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (process.argv.includes('--reset')) {
      await resetTestData(client);
      await client.query('COMMIT');
      console.log('Settlement test data reset. Test invoices are payable again.');
      return;
    }

    await client.query(
      `INSERT INTO buyer_wallets (user_id, buyer_name, balance)
       VALUES ($1, $2, 3000000)
       ON CONFLICT (user_id) DO UPDATE SET buyer_name = EXCLUDED.buyer_name`,
      [BUYER_ID, BUYER_NAME]
    );
    await client.query(
      `INSERT INTO funder_wallets (funder_id, funder_name, balance)
       VALUES ($1, $2, 10000000)
       ON CONFLICT (funder_id) DO UPDATE SET funder_name = EXCLUDED.funder_name`,
      [FUNDER_ID, FUNDER_NAME]
    );

    const saved = [];
    for (const testInvoice of TEST_INVOICES) {
      const existing = await client.query(
        'SELECT id FROM invoices WHERE invoice_number = $1 OR number = $1',
        [testInvoice.number]
      );
      if (existing.rowCount) {
        saved.push({ number: testInvoice.number, id: existing.rows[0].id, inserted: false });
        continue;
      }

      const inserted = await client.query(
        `INSERT INTO invoices
         (supplier_id, buyer_name, invoice_number, invoice_amount, due_date, submitted_date,
          status, current_stage, funder_id, payout_amount, funded_at, number, amount)
         VALUES ('1', $1, $2, $3, $4, CURRENT_DATE - 30, $5, $6, $7, $8, NOW(), $9, $10)
         RETURNING id`,
        [BUYER_NAME, testInvoice.number, testInvoice.amount, testInvoice.due, testInvoice.status, testInvoice.status, FUNDER_ID, testInvoice.payout, testInvoice.number, String(testInvoice.amount)]
      );
      const invoiceId = inserted.rows[0].id;
      await client.query(
        `INSERT INTO invoice_history (invoice_id, stage, actor, note)
         VALUES ($1, $2, 'Settlement Test Seed', 'Synthetic test invoice')`,
        [invoiceId, testInvoice.status]
      );

      if (testInvoice.status === 'Completed') {
        const fee = testInvoice.amount * 0.005;
        const funderPayout = testInvoice.payout - fee;
        await client.query(
          `INSERT INTO invoice_repayments
           (invoice_id, amount_received, principal_due, return_due, platform_fee_rate,
            platform_fee, funder_payout, supplier_residual, status, received_at, settled_at)
           VALUES ($1, $2, $3, $4, 0.005, $5, $6, 0, 'Completed', NOW(), NOW())`,
          [invoiceId, testInvoice.amount, testInvoice.payout, testInvoice.amount - testInvoice.payout, fee, funderPayout]
        );
        await client.query(
          `UPDATE invoices SET repayment_date = CURRENT_DATE, payment_date = CURRENT_DATE,
           settled_at = NOW(), overdue_at = NULL WHERE id = $1`,
          [invoiceId]
        );
      }

      saved.push({ number: testInvoice.number, id: invoiceId, inserted: true });
    }

    const depositExists = await client.query(
      `SELECT id FROM buyer_wallet_transactions WHERE user_id = $1 AND type = 'Test Deposit' AND amount = 3000000`,
      [BUYER_ID]
    );
    if (!depositExists.rowCount) {
      await client.query(
        `INSERT INTO buyer_wallet_transactions (user_id, type, amount, balance_after)
         VALUES ($1, 'Test Deposit', 3000000, 3000000)`,
        [BUYER_ID]
      );
    }

    const fundingExists = await client.query(
      `SELECT id FROM wallet_transactions WHERE funder_id = $1 AND type = 'Test Invoice Funding'`,
      [FUNDER_ID]
    );
    if (!fundingExists.rowCount) {
      await client.query(
        `INSERT INTO wallet_transactions (funder_id, type, amount, balance_after, status, completed_at)
         VALUES ($1, 'Test Invoice Funding', -2702500, 7297500, 'Completed', NOW())`,
        [FUNDER_ID]
      );
    }

    const completed = await client.query(
      `SELECT id FROM invoices WHERE invoice_number = 'TEST-SETTLEMENT-COMPLETED' AND status = 'Completed'`
    );
    const completedInvoiceId = completed.rows[0]?.id;
    const repaymentExists = await client.query(
      `SELECT id FROM buyer_wallet_transactions WHERE user_id = $1 AND type = 'Repayment' AND invoice_id = $2`,
      [BUYER_ID, completedInvoiceId]
    );
    if (!repaymentExists.rowCount && completedInvoiceId) {
      await client.query(
        `INSERT INTO buyer_wallet_transactions (user_id, type, amount, balance_after, invoice_id)
         VALUES ($1, 'Repayment', -750000, 2250000, $2)`,
        [BUYER_ID, completedInvoiceId]
      );
    }

    const settlementExists = await client.query(
      `SELECT id FROM wallet_transactions WHERE funder_id = $1 AND type = 'Repayment Settlement' AND invoice_id = $2`,
      [FUNDER_ID, completedInvoiceId]
    );
    if (!settlementExists.rowCount && completedInvoiceId) {
      await client.query(
        `INSERT INTO wallet_transactions (funder_id, type, amount, balance_after, invoice_id, status, completed_at)
         VALUES ($1, 'Repayment Settlement', 723750, 8021250, $2, 'Completed', NOW())`,
        [FUNDER_ID, completedInvoiceId]
      );
    }

    await client.query('COMMIT');
    console.log(JSON.stringify({ buyer: { id: BUYER_ID, name: BUYER_NAME }, funder: { id: FUNDER_ID, name: FUNDER_NAME }, invoices: saved }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((error) => {
  console.error('Settlement test seed failed:', error.message);
  process.exitCode = 1;
});