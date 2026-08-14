// Dev helper to test Supplier Health alerts by creating a dummy supplier and
// moving it between health bands. Delete this file when you are done testing.
//
// Usage (run from the server folder):
//   node test-alerts.js healthy    -> dummy supplier scores ~100 (Healthy)
//   node test-alerts.js watch      -> ~60  (Watch, borderline)
//   node test-alerts.js distress   -> ~40  (Distress)
//   node test-alerts.js reset      -> remove the dummy supplier and its data
//
// Score = 100 - (disputes * 10). The invoices carry no payout, so only the
// dispute count moves the score, which keeps the bands predictable.

require('dotenv').config({ path: require('path').join(__dirname, '.env'), quiet: true });
const pool = require('./db');
const healthController = require('./controllers/healthController');

const SUPPLIER_ID = 'TEST-SUP';
const BUYER = 'Test Buyer';

async function clearInvoices() {
    await pool.query(
        'DELETE FROM invoice_history WHERE invoice_id IN (SELECT id FROM invoices WHERE supplier_id = $1)',
        [SUPPLIER_ID]
    );
    await pool.query('DELETE FROM invoices WHERE supplier_id = $1', [SUPPLIER_ID]);
}

// Build `total` invoices, `disputes` of which are Disputed. The BEFORE-INSERT
// trigger fills in the other required columns (number, amount, current_stage).
async function build(disputes, total) {
    await clearInvoices();
    for (let i = 1; i <= total; i++) {
        const status = i <= disputes ? 'Disputed' : 'Submitted';
        await pool.query(
            'INSERT INTO invoices (supplier_id, buyer_name, invoice_number, invoice_amount, due_date, status) VALUES ($1, $2, $3, $4, $5, $6)',
            [SUPPLIER_ID, BUYER, 'TEST-' + i, 100000, '2026-12-31', status]
        );
    }
}

const mode = process.argv[2];

(async () => {
    if (mode === 'healthy') {
        await build(0, 3);              // 0 disputes -> 100 (Healthy)
        await healthController.runRecalculation();
        console.log('TEST-SUP set to HEALTHY (score ~100).');
    } else if (mode === 'watch') {
        await build(4, 8);              // 4 disputes -> 60 (Watch, borderline)
        await healthController.runRecalculation();
        console.log('TEST-SUP set to WATCH (score ~60, borderline).');
    } else if (mode === 'distress') {
        await build(6, 10);             // 6 disputes -> 40 (Distress)
        await healthController.runRecalculation();
        console.log('TEST-SUP set to DISTRESS (score ~40).');
    } else if (mode === 'reset') {
        await clearInvoices();
        await pool.query('DELETE FROM supplier_health WHERE supplier_id = $1', [SUPPLIER_ID]);
        await pool.query('DELETE FROM supplier_watchlist WHERE supplier_id = $1', [SUPPLIER_ID]);
        await pool.query('DELETE FROM supplier_health_alerts WHERE supplier_id = $1', [SUPPLIER_ID]);
        await healthController.runRecalculation();
        console.log('TEST-SUP removed.');
    } else if (mode === 'star') {
        await pool.query('INSERT INTO supplier_watchlist (supplier_id, watchlisted) VALUES ($1, true) ON CONFLICT (supplier_id) DO UPDATE SET watchlisted = true', [SUPPLIER_ID]);
        console.log('TEST-SUP added to watchlist.');
    } else {
        console.log('Usage: node test-alerts.js [healthy|watch|distress|star|reset]');
    }
    await pool.end();
})();
