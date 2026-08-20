require('dotenv').config({ path: require('path').join(__dirname, '.env'), override: true });

const pool = require('./db');

const funderId = process.env.CALENDAR_TEST_FUNDER_ID || 'F-14';
const testInvoices = [
  { number: 'TEST-CALENDAR-SYNC', buyer: 'Calendar Test Buyer', amount: 250000, due: '2026-09-30' },
  { number: 'TEST-CALENDAR-30-DAYS', buyer: 'Apex Footwear Ltd', amount: 480000, due: '2026-09-20' },
  { number: 'TEST-CALENDAR-60-DAYS', buyer: 'Northstar Manufacturing', amount: 1250000, due: '2026-10-20' },
  { number: 'TEST-CALENDAR-90-DAYS', buyer: 'Greenline Logistics', amount: 875000, due: '2026-11-20' },
  { number: 'TEST-CALENDAR-LARGE', buyer: 'Harbor Retail Group', amount: 2400000, due: '2026-12-15' },
];

async function seedInvoice(client, invoice) {
    const payout = Math.round(invoice.amount * 0.97);
    const existing = await client.query('SELECT id FROM invoices WHERE invoice_number = $1', [invoice.number]);
    if (existing.rowCount) {
      const invoiceId = String(existing.rows[0].id);
      await client.query('DELETE FROM invoice_repayments WHERE invoice_id = $1', [invoiceId]);
      await client.query(`UPDATE invoices SET buyer_name=$1, invoice_amount=$2, amount=$3, payout_amount=$4,
        due_date=$5::DATE, status='Funded', current_stage='Funded', funder_id=$6, funded_at=NOW(),
        payment_date=NULL, repayment_date=NULL, settled_at=NULL, frozen_at=NULL, updated_at=NOW() WHERE id=$7`, [invoice.buyer, invoice.amount, String(invoice.amount), payout, invoice.due, funderId, existing.rows[0].id]);
      return { number: invoice.number, id: invoiceId, action: 'reset' };
    } else {
      const inserted = await client.query(`INSERT INTO invoices
        (invoice_number, number, buyer_name, invoice_amount, amount, payout_amount, due_date, submitted_date,
         status, current_stage, funder_id, funded_at, created_at, updated_at)
        VALUES ($1::TEXT,$1::TEXT,$2::TEXT,$3,$4,$5,$6::DATE,CURRENT_DATE,'Funded','Funded',$7::TEXT,NOW(),NOW(),NOW())
        RETURNING id`, [invoice.number, invoice.buyer, invoice.amount, String(invoice.amount), payout, invoice.due, funderId]);
      return { number: invoice.number, id: String(inserted.rows[0].id), action: 'created' };
    }
}

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const results = [];
    for (const invoice of testInvoices) results.push(await seedInvoice(client, invoice));
    await client.query('COMMIT');
    console.log(`Calendar showcase data ready for funder ${funderId}:`);
    results.forEach((result) => console.log(`${result.action}: ${result.number} (id ${result.id})`));
    console.log('Refresh /funder/calendar, select each invoice, and click Sync date.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((error) => { console.error('Calendar test seed failed:', error.message); process.exitCode = 1; });