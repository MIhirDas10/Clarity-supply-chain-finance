require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const pool = require('./db');

const BUYER_NAME = 'Apex Footwear Ltd';
const SUPPLIER_NAME = 'Rahman Textiles Ltd';
const DISCOUNT_RATE = 0.03;
const PLATFORM_FEE_RATE = 0.005;
const TEST_PREFIX = 'TEST-DISCOUNT-';

const TEST_INVOICES = [
  {
    number: 'TEST-DISCOUNT-OPEN',
    amount: 1000000,
    due: '2026-09-15',
    offerStatus: 'Offered',
  },
  {
    number: 'TEST-DISCOUNT-ACCEPTED',
    amount: 750000,
    due: '2026-09-30',
    offerStatus: 'Accepted',
  },
  {
    number: 'TEST-DISCOUNT-DECLINED',
    amount: 500000,
    due: '2026-10-15',
    offerStatus: 'Declined',
  },
  {
    number: 'TEST-DISCOUNT-ELIGIBLE',
    amount: 1250000,
    due: '2026-11-01',
    offerStatus: null,
  },
];

function money(value) {
  return Math.round(Number(value) * 100) / 100;
}

function calculateOffer(amount) {
  const invoiceAmount = money(amount);
  const discountAmount = money(invoiceAmount * DISCOUNT_RATE);
  const supplierPayout = money(invoiceAmount - discountAmount);
  const platformFee = money(invoiceAmount * PLATFORM_FEE_RATE);

  return {
    invoiceAmount,
    discountAmount,
    supplierPayout,
    platformFee,
    buyerReturn: money(discountAmount - platformFee),
  };
}

async function getSupplierId(client) {
  const result = await client.query(
    'SELECT id FROM suppliers WHERE name = $1 LIMIT 1',
    [SUPPLIER_NAME]
  );

  if (!result.rowCount) {
    throw new Error(`Supplier profile not found: ${SUPPLIER_NAME}. Run npm run setup first.`);
  }

  return String(result.rows[0].id);
}

async function resetTestData(client) {
  const invoices = await client.query(
    `SELECT id FROM invoices WHERE invoice_number LIKE $1`,
    [`${TEST_PREFIX}%`]
  );
  const invoiceIds = invoices.rows.map((row) => String(row.id));

  if (invoiceIds.length) {
    await client.query(
      `DELETE FROM dynamic_discount_offers WHERE invoice_id = ANY($1::TEXT[])`,
      [invoiceIds]
    );
    await client.query(
      `DELETE FROM invoice_history
       WHERE invoice_id::TEXT = ANY($1::TEXT[])
         AND actor = 'Dynamic Discount Test Seed'`,
      [invoiceIds]
    );
    await client.query(
      `UPDATE invoices
       SET status = 'Buyer Confirmed', current_stage = 'Buyer Confirmed',
           payout_amount = NULL, payment_date = NULL, funder_id = NULL,
           funded_at = NULL, settled_at = NULL, updated_at = NOW()
       WHERE invoice_number LIKE $1`,
      [`${TEST_PREFIX}%`]
    );
  }
}

async function seedInvoice(client, supplierId, testInvoice) {
  const existing = await client.query(
    'SELECT id FROM invoices WHERE invoice_number = $1 LIMIT 1',
    [testInvoice.number]
  );
  const invoiceId = existing.rows[0]?.id;

  if (invoiceId) {
    await client.query(
      `UPDATE invoices
       SET supplier_id = $1, buyer_name = $2, invoice_amount = $3, amount = $4,
           due_date = $5::DATE, submitted_date = CURRENT_DATE - 14,
           status = 'Buyer Confirmed', current_stage = 'Buyer Confirmed',
           payout_amount = NULL, payment_date = NULL, funder_id = NULL,
           funded_at = NULL, settled_at = NULL, updated_at = NOW()
       WHERE id = $6`,
      [supplierId, BUYER_NAME, testInvoice.amount, String(testInvoice.amount), testInvoice.due, invoiceId]
    );
    return String(invoiceId);
  }

  const inserted = await client.query(
    `INSERT INTO invoices
      (supplier_id, buyer_name, invoice_number, invoice_amount, amount, due_date,
       submitted_date, status, current_stage, funder_id, payout_amount, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::DATE, CURRENT_DATE - 14,
       'Buyer Confirmed', 'Buyer Confirmed', NULL, NULL, NOW(), NOW())
     RETURNING id`,
    [supplierId, BUYER_NAME, testInvoice.number, testInvoice.amount, String(testInvoice.amount), testInvoice.due]
  );

  return String(inserted.rows[0].id);
}

async function seedOffer(client, invoiceId, testInvoice) {
  if (!testInvoice.offerStatus) return;

  const calculated = calculateOffer(testInvoice.amount);
  const responded = testInvoice.offerStatus === 'Offered' ? null : 'NOW()';
  const settled = testInvoice.offerStatus === 'Accepted' ? 'NOW()' : 'NULL';

  await client.query(
    `INSERT INTO dynamic_discount_offers
      (invoice_id, buyer_name, discount_rate, platform_fee_rate,
       invoice_amount, discount_amount, supplier_payout, platform_fee, buyer_return,
       status, responded_at, settled_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       ${responded}, ${settled})`,
    [
      invoiceId,
      BUYER_NAME,
      DISCOUNT_RATE,
      PLATFORM_FEE_RATE,
      calculated.invoiceAmount,
      calculated.discountAmount,
      calculated.supplierPayout,
      calculated.platformFee,
      calculated.buyerReturn,
      testInvoice.offerStatus,
    ]
  );

  if (testInvoice.offerStatus === 'Accepted') {
    await client.query(
      `UPDATE invoices
       SET status = 'Payout Initiated', current_stage = 'Payout Initiated',
           payout_amount = $1, payment_date = CURRENT_DATE, updated_at = NOW()
       WHERE id = $2`,
      [calculated.supplierPayout, invoiceId]
    );
  }
}

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const supplierId = await getSupplierId(client);
    await resetTestData(client);

    if (process.argv.includes('--reset')) {
      await client.query('COMMIT');
      console.log('Dynamic discounting test data reset. Four buyer-confirmed invoices are ready.');
      return;
    }

    const saved = [];
    for (const testInvoice of TEST_INVOICES) {
      const invoiceId = await seedInvoice(client, supplierId, testInvoice);
      await seedOffer(client, invoiceId, testInvoice);
      await client.query(
        `INSERT INTO invoice_history (invoice_id, stage, actor, note)
         VALUES ($1, 'Buyer Confirmed', 'Dynamic Discount Test Seed', 'Synthetic dynamic discounting test invoice')`,
        [invoiceId]
      );
      saved.push({ number: testInvoice.number, id: invoiceId, offer: testInvoice.offerStatus || 'none' });
    }

    await client.query('COMMIT');
    console.log(JSON.stringify({ buyer: BUYER_NAME, supplier: SUPPLIER_NAME, discountRate: DISCOUNT_RATE, invoices: saved }, null, 2));
    console.log('Buyer page: create another offer from the eligible invoice. Supplier page: accept or decline the open offer.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((error) => {
  console.error('Dynamic discounting test seed failed:', error.message);
  process.exitCode = 1;
});
