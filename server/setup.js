// Creates the tables and inserts the sample data.
// Run this once on any new PC:   npm run setup
//
// This does the same job as running schema.sql and seed.sql by hand in the
// Supabase SQL Editor, but from Node, so you do not need the psql command
// line tool installed.
//
// Our database is shared with the rest of the group, so this script is safe
// to run more than once: it never drops a table, and it only loads the
// sample data when the invoices table is completely empty.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('./db');

// Demo accounts for the login/signup feature. Each insert is
// ON CONFLICT (email) DO NOTHING, so running this again never duplicates or
// overwrites an account someone (a teammate, or a real signup) already made.
const DEMO_ACCOUNTS = [
  { role: 'admin',    business_name: 'Clarity Platform Admin', email: 'admin@clarity.io',    password: 'admin123',    status: 'Approved' },
  { role: 'supplier', business_name: 'Rahman Textiles Ltd',    email: 'supplier@clarity.io', password: 'supplier123', status: 'Approved' },
  { role: 'buyer',    business_name: 'Apex Footwear Ltd',      email: 'buyer@clarity.io',    password: 'buyer123',    status: 'Approved' },
  { role: 'supplier', business_name: 'New Textiles BD',        email: 'pending@clarity.io',  password: 'pending123',  status: 'Pending'  },
];

async function seedUsers() {
  for (const account of DEMO_ACCOUNTS) {
    const hash = await bcrypt.hash(account.password, 10);
    await pool.query(
      `INSERT INTO users (role, business_name, email, password_hash, status, approved_at)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 = 'Approved' THEN NOW() ELSE NULL END)
       ON CONFLICT (email) DO NOTHING`,
      [account.role, account.business_name, account.email, hash, account.status]
    );
  }
  const count = await pool.query('SELECT COUNT(*) FROM users');
  console.log('Demo accounts ready. Total users in the shared table:', count.rows[0].count);
}

async function setup() {
  const schema = fs.readFileSync(path.join(__dirname, 'sql', 'schema.sql'), 'utf8');
  const seed = fs.readFileSync(path.join(__dirname, 'sql', 'seed.sql'), 'utf8');

  await pool.query(schema);
  console.log('Tables are ready.');

  // Only count OUR supplier's invoices. Other members have their own rows in
  // this shared table and we must not touch or duplicate them.
  const existing = await pool.query("SELECT COUNT(*) FROM invoices WHERE supplier_id = '1'");
  const rowCount = Number(existing.rows[0].count);

  if (rowCount > 0) {
    console.log('Sample invoices already loaded (' + rowCount + ' rows) - skipping.');
  } else {
    await pool.query(seed);
    console.log('Sample data inserted.');
  }

  const mine = await pool.query("SELECT COUNT(*) FROM invoices WHERE supplier_id = '1'");
  const all = await pool.query('SELECT COUNT(*) FROM invoices');
  console.log('Your invoice rows:', mine.rows[0].count);
  console.log('Rows in the shared table altogether:', all.rows[0].count);

  await seedUsers();

  await pool.end();
}

setup().catch((error) => {
  console.error('Setup failed:', error.message);
  console.error('Check that the DATABASE_URL in server/.env is correct.');
  process.exit(1);
});
