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

// A rule spends its funder's wallet, so a funder must not be able to create
// or run one under someone else's id - that would sidestep the same check
// walletRoutes.js makes and let them drain another funder's balance.
function ownsFunder(user, funderId) {
  if (!user || !funderId) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'funder') return false;
  return String(funderId) === String(user.id) || String(funderId) === `F-${user.id}`;
}

function denyFunder(res) {
  return res.status(403).json({ message: 'That funder account is not yours.' });
}

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

// An empty sector box means "any sector", which is stored as NULL rather than
// an empty string so the matching query has a single thing to test for.
function normaliseSector(value) {
  const trimmed = (value || '').trim();
  return trimmed === '' ? null : trimmed;
}

// 1. POST /api/auto-invest/rules - create a standing rule
router.post('/rules', async (req, res) => {
  const { funder_id, funder_name, min_amount, max_amount, min_risk_rating, sector, max_capital_per_invoice } = req.body;

  const problems = findProblems(req.body);
  if (problems.length > 0) {
    return res.status(400).json({ message: 'Please fix: ' + problems.join(', ') });
  }
  if (!ownsFunder(req.user, funder_id)) return denyFunder(res);

  try {
    const saved = await pool.query(
      `INSERT INTO auto_invest_rules
         (funder_id, funder_name, min_amount, max_amount, min_risk_rating, sector, max_capital_per_invoice)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [funder_id, funder_name, min_amount || 0, max_amount || null, min_risk_rating || 'Rating C',
       normaliseSector(sector), max_capital_per_invoice]
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
    // Admins may list every rule; a funder only ever sees their own.
    if (!funder_id) {
      if (req.user?.role !== 'admin') return denyFunder(res);
      const all = await pool.query('SELECT * FROM auto_invest_rules ORDER BY created_at DESC');
      return res.json(all.rows);
    }
    if (!ownsFunder(req.user, funder_id)) return denyFunder(res);
    const result = await pool.query(
      'SELECT * FROM auto_invest_rules WHERE funder_id = $1 ORDER BY created_at DESC',
      [funder_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Could not load rules' });
  }
});

// 2b. GET /api/auto-invest/sectors - the sectors a rule can be limited to.
//     Read from the buyers actually on file rather than a hardcoded list, so
//     the dropdown cannot drift away from what the matcher can really match.
router.get('/sectors', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT DISTINCT sector FROM buyers WHERE sector IS NOT NULL AND sector <> '' ORDER BY sector"
    );
    res.json(result.rows.map((row) => row.sector));
  } catch (error) {
    res.status(500).json({ message: 'Could not load sectors' });
  }
});

// 3. PATCH /api/auto-invest/rules/:id - toggle active or adjust the criteria
router.patch('/rules/:id', async (req, res) => {
  const fields = ['min_amount', 'max_amount', 'min_risk_rating', 'sector', 'max_capital_per_invoice', 'is_active'];
  const updates = fields.filter((f) => req.body[f] !== undefined);

  if (updates.length === 0) {
    return res.status(400).json({ message: 'Send at least one field to change' });
  }
  if (req.body.min_risk_rating !== undefined && !(req.body.min_risk_rating in RATING_RANK)) {
    return res.status(400).json({ message: 'min_risk_rating must be Rating A, Rating B or Rating C' });
  }

  const setClause = updates.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const values = updates.map((f) => (f === 'sector' ? normaliseSector(req.body[f]) : req.body[f]));

  try {
    const existing = await pool.query('SELECT funder_id FROM auto_invest_rules WHERE id = $1', [req.params.id]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ message: 'No rule with that id' });
    }
    if (!ownsFunder(req.user, existing.rows[0].funder_id)) return denyFunder(res);

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
    const existing = await pool.query('SELECT funder_id FROM auto_invest_rules WHERE id = $1', [req.params.id]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ message: 'No rule with that id' });
    }
    if (!ownsFunder(req.user, existing.rows[0].funder_id)) return denyFunder(res);

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
    if (funder_id) {
      if (!ownsFunder(req.user, funder_id)) return denyFunder(res);
    } else if (req.user?.role !== 'admin') {
      // Running every funder's rules at once is an admin action - otherwise
      // one funder pressing the button would spend everyone else's wallets.
      return denyFunder(res);
    }

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
      // An invoice's sector comes from the buyer it is drawn on. The join is
      // on buyer_name because invoices.buyer_id is not populated anywhere in
      // this codebase yet - every invoice on file carries the name only.
      // A rule with sector NULL skips the test entirely and funds any sector;
      // a rule WITH a sector will not match an invoice whose buyer has no
      // sector on file, which is the safe reading of "only this sector".
      const candidates = await pool.query(
        `SELECT i.id, i.invoice_amount, i.risk_rating, b.sector
         FROM invoices i
         LEFT JOIN buyers b ON LOWER(b.name) = LOWER(i.buyer_name)
         WHERE i.status = 'Buyer Confirmed' AND i.funder_id IS NULL AND i.frozen_at IS NULL
           AND i.invoice_amount >= $1
           AND ($2::NUMERIC IS NULL OR i.invoice_amount <= $2)
           AND i.invoice_amount <= $3
           AND ($4::TEXT IS NULL OR LOWER(b.sector) = LOWER($4))
         ORDER BY i.created_at ASC`,
        [rule.min_amount, rule.max_amount, rule.max_capital_per_invoice, rule.sector]
      );

      const minRank = RATING_RANK[rule.min_risk_rating] || 1;

      for (const invoice of candidates.rows) {
        const rank = RATING_RANK[invoice.risk_rating] || 0;
        if (rank < minRank) continue;

        const result = await fundInvoiceFromWallet(invoice.id, rule.funder_id, rule.funder_name, 'auto-invest');
        if (result.ok) {
          funded.push({
            invoice_id: invoice.id, amount: result.amount, rule_id: rule.id,
            funder_id: rule.funder_id, sector: invoice.sector,
          });
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
