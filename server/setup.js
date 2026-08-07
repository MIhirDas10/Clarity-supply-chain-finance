// Creates the tables and inserts the sample data.
// Run this once on any new PC:   npm run setup
//
// This does the same job as running schema.sql and seed.sql by hand in pgAdmin,
// but from Node, so you do not need the psql command line tool installed.

const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function setup() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');

  await pool.query(schema);
  console.log('Tables created.');

  await pool.query(seed);
  console.log('Sample data inserted.');

  const result = await pool.query('SELECT COUNT(*) FROM payouts');
  console.log('Payout rows in database:', result.rows[0].count);

  await pool.end();
}

setup().catch((error) => {
  console.error('Setup failed:', error.message);
  console.error('Check that PostgreSQL is running and that the connection');
  console.error('details in db.js are correct for this PC.');
  process.exit(1);
});
