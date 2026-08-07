const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

async function main() {
  // Use the transaction pooler (port 6543)
  const pool = new Pool({
    connectionString:
      "postgresql://postgres.eccnwrodjktfamizdzeb:digonto12345%24@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres",
    ssl: { rejectUnauthorized: false },
  });

  // Test connectivity first
  try {
    const test = await pool.query("SELECT NOW() AS server_time");
    console.log("✓ Connected to Supabase at", test.rows[0].server_time);
  } catch (err) {
    console.error("✗ Connection failed:", err.message);
    process.exit(1);
  }

  // Run the CREATE TABLE
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id              SERIAL PRIMARY KEY,
        supplier_id     VARCHAR(50)    NOT NULL,
        buyer_name      VARCHAR(200)   NOT NULL,
        invoice_number  VARCHAR(50)    UNIQUE NOT NULL,
        amount          NUMERIC(14,2)  NOT NULL,
        due_date        DATE           NOT NULL,
        file_url        TEXT,
        status          VARCHAR(20)    NOT NULL DEFAULT 'Pending',
        created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
      );
    `);
    console.log("✓ Table 'invoices' created (or already exists)");
  } catch (err) {
    console.error("✗ CREATE TABLE failed:", err.message);
    process.exit(1);
  }

  // Seed sample data
  try {
    const result = await pool.query(`
      INSERT INTO invoices (supplier_id, buyer_name, invoice_number, amount, due_date, file_url, status)
      VALUES
        ('SUP-001', 'Apex Footwear Ltd.',  'INV-1001', 4500000.00, '2026-09-15', NULL, 'Confirmed'),
        ('SUP-002', 'Beximco Pharma',      'INV-1002', 2500000.00, '2026-08-30', NULL, 'Pending'),
        ('SUP-003', 'Square Group',        'INV-1003',  850000.00, '2026-10-01', NULL, 'Pending'),
        ('SUP-004', 'BRAC Bank',           'INV-1004', 5000000.00, '2026-08-20', NULL, 'Confirmed'),
        ('SUP-005', 'Envoy Textiles',      'INV-1005', 3400000.00, '2026-09-10', NULL, 'Rejected')
      ON CONFLICT (invoice_number) DO NOTHING;
    `);
    console.log("✓ Seed data inserted, rows:", result.rowCount);
  } catch (err) {
    console.error("✗ Seed data failed:", err.message);
  }

  // Verify
  const check = await pool.query("SELECT COUNT(*) AS total FROM invoices");
  console.log("✓ Total invoices in table:", check.rows[0].total);

  await pool.end();
  console.log("\n🎉 Migration complete!");
}

main();
