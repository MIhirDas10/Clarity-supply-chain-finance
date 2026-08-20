// Feature 4 - Auto-Invest Rules Engine
// (Apurba Roy, SL 3)   Mounted at /api/auto-invest
//
// A funder sets standing criteria once ("Rating A or B, ৳50,000-৳500,000,
// up to ৳300,000 per invoice") instead of visiting the marketplace and
// clicking Fund every time a matching invoice appears. Running the engine
// finds every open invoice that fits an active rule and funds it out of
// that rule's own wallet, through the exact same locked transaction the
// manual "Fund" button uses (see services/funderWallet.js).
//
// There is no background scheduler in this student project, so "running"
// the engine is a button the funder presses (POST /run) rather than a cron
// job - the matching logic itself is identical either way.

const express = require('express');
const pool = require('../db');
const { fundInvoiceFromWallet } = require('../services/funderWallet');

const router = express.Router();

// Higher number = better invoice. Lets "min_risk_rating: Rating B" match
// both Rating A and Rating B invoices with a single >= comparison.
const RATING_RANK = { 'Rating A': 3, 'Rating B': 2, 'Rating C': 1 };

function findProblems({ funder_id, funder_name, max_capital_per_invoice, min_risk_rating }) {
  const problems = [];
  if (!funder_id) problems.push('funder_id is required');
  if (!funder_name) problems.push('funder_name is required');
  if (!max_capital_per_invoice || Number(max_capital_per_invoice) <= 0) {
    problems.push('max_capital_per_invoice must be greater than zero');
  }
  if (min_risk_rating && !(min_risk_rating in RATING_RANK)) {
    problems.push('min_risk_rating must be Rating A, Rating B or Rating C');
  }
  return problems;
}

// 1. POST /api/auto-invest/rules - create a standing rule
router.post('/rules', async (req, res) => {
  const { funder_id, funder_name, min_amount, max_amount, min_risk_rating, max_capital_per_invoice } = req.body;

  const problems = findProblems(req.body);
  if (problems.length > 0) {
    return res.status(400).json({ message: 'Please fix: ' + problems.join(', ') });
  }

  try {
    const saved = await pool.query(
      `INSERT INTO auto_invest_rules
         (funder_id, funder_name, min_amount, max_amount, min_risk_rating, max_capital_per_invoice)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [funder_id, funder_name, min_amount || 0, max_amount || null, min_risk_rating || 'Rating C', max_capital_per_invoice]
    );
    res.status(201).json(saved.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Could not save the rule' });
  }
});

// 2. GET /api/auto-invest/rules?funder_id=F-1 - a funder's own rules
router.get('/rules', async (req, res) => {
  try {
    const { funder_id } = req.query;
    const result = funder_id
      ? await pool.query('SELECT * FROM auto_invest_rules WHERE funder_id = $1 ORDER BY created_at DESC', [funder_id])
      : await pool.query('SELECT * FROM auto_invest_rules ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Could not load rules' });
  }
});

// 3. PATCH /api/auto-invest/rules/:id - toggle active or adjust the criteria
router.patch('/rules/:id', async (req, res) => {
  const fields = ['min_amount', 'max_amount', 'min_risk_rating', 'max_capital_per_invoice', 'is_active'];
  const updates = fields.filter((f) => req.body[f] !== undefined);

  if (updates.length === 0) {
    return res.status(400).json({ message: 'Send at least one field to change' });
  }

  const setClause = updates.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const values = updates.map((f) => req.body[f]);

  try {
    const result = await pool.query(
      `UPDATE auto_invest_rules SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'No rule with that id' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Could not update the rule' });
  }
});

// 4. DELETE /api/auto-invest/rules/:id
router.delete('/rules/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM auto_invest_rules WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'No rule with that id' });
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: 'Could not delete the rule' });
  }
});

// 5. POST /api/auto-invest/run - the matching engine.
//    Optional body: { funder_id } to run just one funder's rules (used by
//    the "Run Auto-Invest Now" button); with no body, runs every active rule.
router.post('/run', async (req, res) => {
  try {
    const { funder_id } = req.body || {};
    const rules = funder_id
      ? await pool.query(
          'SELECT * FROM auto_invest_rules WHERE is_active = TRUE AND funder_id = $1 ORDER BY created_at ASC',
          [funder_id]
        )
      : await pool.query('SELECT * FROM auto_invest_rules WHERE is_active = TRUE ORDER BY created_at ASC');

    const funded = [];
    const skipped = [];

    for (const rule of rules.rows) {
      // Same pool marketplaceRoutes.js draws from: confirmed, unfunded,
      // within the rule's amount and quality criteria. Locking happens
      // per-invoice inside fundInvoiceFromWallet, not here, so this list can
      // safely go a little stale between being read and being acted on.
      const candidates = await pool.query(
        `SELECT id, invoice_amount, risk_rating FROM invoices
         WHERE status = 'Buyer Confirmed' AND funder_id IS NULL AND frozen_at IS NULL
           AND invoice_amount >= $1
           AND ($2::NUMERIC IS NULL OR invoice_amount <= $2)
           AND invoice_amount <= $3
         ORDER BY created_at ASC`,
        [rule.min_amount, rule.max_amount, rule.max_capital_per_invoice]
      );

      const minRank = RATING_RANK[rule.min_risk_rating] || 1;

      for (const invoice of candidates.rows) {
        const rank = RATING_RANK[invoice.risk_rating] || 0;
        if (rank < minRank) continue;

        const result = await fundInvoiceFromWallet(invoice.id, rule.funder_id, rule.funder_name, 'auto-invest');
        if (result.ok) {
          funded.push({ invoice_id: invoice.id, amount: result.amount, rule_id: rule.id, funder_id: rule.funder_id });
        } else {
          skipped.push({ invoice_id: invoice.id, rule_id: rule.id, reason: result.reason });
          // A low wallet balance will not improve later in this same run, so
          // there is no point trying the rest of this rule's candidates.
          if (result.reason.includes('balance')) break;
        }
      }
    }

    res.json({ funded, skipped, rules_checked: rules.rows.length });
  } catch (error) {
    console.error('Auto-invest run failed:', error.message);
    res.status(500).json({ message: 'Could not run the auto-invest engine' });
  }
});

module.exports = router;
