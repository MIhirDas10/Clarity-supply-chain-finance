require('dotenv').config({ path: '.env' });
const pool = require('./db.js');
pool.query("SELECT id, invoice_number, buyer_name, status FROM invoices WHERE status = 'Submitted'")
  .then(res => console.log(res.rows))
  .catch(err => console.error(err))
  .finally(() => pool.end());
