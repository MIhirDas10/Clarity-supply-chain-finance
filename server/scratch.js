require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function forceSeed() {
    try {
        console.log('Cleaning up existing invoices for supplier 1 and 2...');
        await pool.query("DELETE FROM invoice_history WHERE invoice_id IN (SELECT id FROM invoices WHERE supplier_id IN ('1', '2'))");
        await pool.query("DELETE FROM dynamic_discount_offers WHERE invoice_id IN (SELECT id::TEXT FROM invoices WHERE supplier_id IN ('1', '2'))");
        await pool.query("DELETE FROM invoices WHERE supplier_id IN ('1', '2')");
        
        console.log('Running seed.sql...');
        const seed = fs.readFileSync(path.join(__dirname, 'sql', 'seed.sql'), 'utf8');
        await pool.query(seed);
        
        console.log('Seed executed successfully.');
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
forceSeed();
