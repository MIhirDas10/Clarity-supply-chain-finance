const pool = require('../db');

// The four score components and their default weights. They sum to 1.0.
// This is a shared service: the discount calculator and risk rating engine
// read the score this produces. The weights are tunable at runtime through
// GET/PATCH /api/credit/config (stored in the credit_config table); these are
// the fallback used when no config row exists yet.
const DEFAULT_WEIGHTS = {
    paymentSpeed: 0.30,   // how fast the buyer pays
    reliability: 0.25,    // how rarely they go overdue
    disputeFree: 0.25,    // how rarely they dispute
    trackRecord: 0.20     // how established they are (confirmations + volume)
};

// Read the tunable component weights from credit_config (single row, id = 1),
// falling back to the defaults if the table/row is missing or unreadable.
async function loadWeights() {
    try {
        const r = await pool.query(
            'SELECT payment_speed, reliability, dispute_free, track_record FROM credit_config WHERE id = 1'
        );
        if (r.rows.length === 0) return { ...DEFAULT_WEIGHTS };
        const row = r.rows[0];
        return {
            paymentSpeed: Number(row.payment_speed),
            reliability: Number(row.reliability),
            disputeFree: Number(row.dispute_free),
            trackRecord: Number(row.track_record)
        };
    } catch (error) {
        console.error('Could not read credit_config, using defaults:', error.message);
        return { ...DEFAULT_WEIGHTS };
    }
}

function clamp(n, lo, hi) {
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
}

function daysBetween(later, earlier) {
    const ms = new Date(later).getTime() - new Date(earlier).getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
}

function ratingFor(score) {
    if (score >= 80) return 'Excellent';
    if (score >= 65) return 'Good';
    if (score >= 50) return 'Fair';
    return 'Poor';
}

// Core calculation. Reads every buyer's invoice activity and turns it into a
// credit score with a transparent component breakdown and reasons.
// If buyerName is given, only that buyer is scored.
async function computeScores(buyerName) {
    const WEIGHTS = await loadWeights();
    let query = `
        SELECT buyer_name, status, invoice_amount, funder_id,
               submitted_date, due_date, payment_date
        FROM invoices
        WHERE buyer_name IS NOT NULL AND buyer_name <> ''
    `;
    const params = [];
    if (buyerName) {
        params.push(buyerName);
        query += ' AND buyer_name = $1';
    }
    const result = await pool.query(query, params);
    const invoices = result.rows;

    const today = new Date();
    const buyers = {};

    // 1. Gather the five raw metrics per buyer.
    invoices.forEach(inv => {
        const name = inv.buyer_name;
        if (!buyers[name]) {
            buyers[name] = {
                buyerName: name,
                total: 0, confirmed: 0, disputed: 0,
                repaid: 0, overdue: 0, daysToPaySum: 0, financedVolume: 0
            };
        }
        const b = buyers[name];
        b.total += 1;

        const confirmedStages = ['Buyer Confirmed', 'Funded', 'Payout Initiated', 'Completed'];
        if (confirmedStages.indexOf(inv.status) !== -1) {
            b.confirmed += 1;
        }
        if (inv.status === 'Disputed') {
            b.disputed += 1;
        }
        if (inv.funder_id) {
            b.financedVolume += Number(inv.invoice_amount) || 0;
        }

        const isRepaid = inv.payment_date !== null;
        if (isRepaid) {
            b.repaid += 1;
            if (inv.submitted_date) {
                const d = daysBetween(inv.payment_date, inv.submitted_date);
                if (d > 0) {
                    b.daysToPaySum += d;
                }
            }
            if (inv.due_date && new Date(inv.payment_date) > new Date(inv.due_date)) {
                b.overdue += 1; // paid, but late
            }
        } else if (inv.due_date && new Date(inv.due_date) < today) {
            b.overdue += 1; // unpaid and past its due date
        }
    });

    // 2. Normalise each metric into a 0-100 component, then weight into a score.
    const scores = Object.values(buyers).map(b => {
        const avgDaysToPay = b.repaid > 0 ? Math.round(b.daysToPaySum / b.repaid) : null;

        // Component 1: payment speed. 30 days -> 100, 120 days -> 0.
        let paymentSpeed;
        if (b.repaid === 0) {
            paymentSpeed = 60; // no repayments yet: neutral, limited data
        } else {
            paymentSpeed = clamp(100 - Math.max(0, avgDaysToPay - 30) * (100 / 90), 0, 100);
        }

        // Component 2: on-time reliability (fewer overdue = better).
        const overdueRatio = b.total > 0 ? (b.overdue / b.total) : 0;
        const reliability = (1 - overdueRatio) * 100;

        // Component 3: dispute-free record.
        const disputeRatio = b.total > 0 ? (b.disputed / b.total) : 0;
        const disputeFree = (1 - disputeRatio) * 100;

        // Component 4: track record = confirmations (60%) + financed volume (40%).
        const confirmationScore = Math.min(100, b.confirmed * 20);            // 5 confirmations -> 100
        const volumeScore = Math.min(100, (b.financedVolume / 5000000) * 100); // 5M financed -> 100
        const trackRecord = 0.6 * confirmationScore + 0.4 * volumeScore;

        const score = Math.round(
            WEIGHTS.paymentSpeed * paymentSpeed +
            WEIGHTS.reliability * reliability +
            WEIGHTS.disputeFree * disputeFree +
            WEIGHTS.trackRecord * trackRecord
        );
        const rating = ratingFor(score);

        const components = {
            paymentSpeed: Math.round(paymentSpeed),
            reliability: Math.round(reliability),
            disputeFree: Math.round(disputeFree),
            trackRecord: Math.round(trackRecord)
        };

        // Transparent, human-readable breakdown of how the score was reached.
        const reasons = [
            `Payment speed ${components.paymentSpeed}/100` +
                (avgDaysToPay !== null ? ` (avg ${avgDaysToPay} days to pay)` : ' (no repayments yet)'),
            `On-time reliability ${components.reliability}/100 (${b.overdue} overdue of ${b.total})`,
            `Dispute-free record ${components.disputeFree}/100 (${b.disputed} dispute(s) of ${b.total})`,
            `Track record ${components.trackRecord}/100 (${b.confirmed} confirmed, ৳${Math.round(b.financedVolume).toLocaleString()} financed)`
        ];

        return {
            buyerName: b.buyerName,
            score: score,
            rating: rating,
            components: components,
            reasons: reasons,
            metrics: {
                totalInvoices: b.total,
                confirmationCount: b.confirmed,
                disputeCount: b.disputed,
                avgDaysToPay: avgDaysToPay,
                overdueCount: b.overdue,
                financedVolume: Math.round(b.financedVolume)
            }
        };
    });

    return scores;
}

// Build the "reason for every change" text stored in the history table.
function buildHistoryReason(entry, oldScore) {
    const c = entry.components;
    const parts = [
        { name: 'payment speed', val: c.paymentSpeed },
        { name: 'on-time reliability', val: c.reliability },
        { name: 'dispute record', val: c.disputeFree },
        { name: 'track record', val: c.trackRecord }
    ];
    parts.sort((a, b) => a.val - b.val);

    let reason;
    if (oldScore === null || oldScore === undefined) {
        reason = `Initial score ${entry.score} (${entry.rating}).`;
    } else {
        const dir = entry.score > oldScore ? 'improved' : 'declined';
        reason = `Score ${dir} from ${oldScore} to ${entry.score} (${entry.rating}).`;
    }
    reason += ` Main factor: ${parts[0].name} at ${parts[0].val}/100`;
    if (entry.metrics.disputeCount > 0) {
        reason += `; ${entry.metrics.disputeCount} dispute(s)`;
    }
    if (entry.metrics.overdueCount > 0) {
        reason += `; ${entry.metrics.overdueCount} overdue`;
    }
    reason += '.';
    return reason;
}

// Recompute every buyer, save the latest score, and append a history row with a
// reason whenever the score is new or has changed. Also called by the invoice
// pipeline so history is captured on real events.
async function runRecalculation() {
    const scores = await computeScores();

    for (let i = 0; i < scores.length; i++) {
        const entry = scores[i];

        const prev = await pool.query(
            'SELECT score, manual_override FROM buyer_credit_score WHERE buyer_name = $1',
            [entry.buyerName]
        );
        let oldScore = null;
        let isOverridden = false;
        if (prev.rows.length > 0) {
            oldScore = prev.rows[0].score;
            isOverridden = prev.rows[0].manual_override === true;
        }

        // A manually overridden score is pinned by an analyst - a recompute must
        // not silently replace it, so leave the row (and its history) untouched.
        if (isOverridden) {
            continue;
        }

        // Save the latest score/rating (never clobber a manual override).
        await pool.query(`
            INSERT INTO buyer_credit_score (buyer_name, score, rating, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (buyer_name)
            DO UPDATE SET score = $2, rating = $3, updated_at = NOW()
            WHERE buyer_credit_score.manual_override IS NOT TRUE
        `, [entry.buyerName, entry.score, entry.rating]);

        // Only record history when the score is new or actually changed.
        if (oldScore === null || oldScore !== entry.score) {
            const reason = buildHistoryReason(entry, oldScore);
            await pool.query(`
                INSERT INTO buyer_credit_history (buyer_name, score, old_score, reason)
                VALUES ($1, $2, $3, $4)
            `, [entry.buyerName, entry.score, oldScore, reason]);
        }
    }

    return scores;
}

// Exported so the invoice pipeline can refresh scores after a status change.
exports.runRecalculation = runRecalculation;

// A manual override lets an analyst pin a score by hand (with a reason written
// to history). When present it wins over the computed score, but the computed
// components/metrics are still shown so the override stays transparent.
async function loadOverrides(buyerName) {
    const overrides = {};
    try {
        let q = 'SELECT buyer_name, score, rating, override_reason FROM buyer_credit_score WHERE manual_override = TRUE';
        const params = [];
        if (buyerName) { params.push(buyerName); q += ' AND buyer_name = $1'; }
        const r = await pool.query(q, params);
        r.rows.forEach(row => {
            overrides[row.buyer_name] = {
                score: row.score, rating: row.rating, reason: row.override_reason
            };
        });
    } catch (error) {
        // manual_override column may not exist on an older DB - treat as none.
        console.error('Could not read overrides:', error.message);
    }
    return overrides;
}

// Overlay a manual override on a computed score entry (if one exists for it).
function applyOverride(entry, overrides) {
    const o = overrides[entry.buyerName];
    if (!o) return entry;
    return {
        ...entry,
        score: o.score,
        rating: o.rating,
        computedScore: entry.score,    // keep the machine score for reference
        overridden: true,
        overrideReason: o.reason
    };
}

// GET /api/credit/buyers
// Every buyer with current score, rating, components, and metrics.
exports.getBuyers = async (req, res) => {
    try {
        let scores = await computeScores();
        const overrides = await loadOverrides();
        scores = scores.map(s => applyOverride(s, overrides));
        // sort worst-first so risky buyers surface at the top
        scores.sort((a, b) => a.score - b.score);
        res.status(200).json(scores);
    } catch (error) {
        console.error('Credit Buyers Error:', error);
        res.status(500).json({ error: 'Failed to compute buyer credit scores' });
    }
};

// GET /api/credit/buyers/:name
// One buyer's full credit detail. This is what the discount calculator and
// risk rating engine read.
exports.getBuyer = async (req, res) => {
    try {
        const scores = await computeScores(req.params.name);
        if (scores.length === 0) {
            return res.status(404).json({ error: 'Buyer not found' });
        }
        const overrides = await loadOverrides(req.params.name);
        res.status(200).json(applyOverride(scores[0], overrides));
    } catch (error) {
        console.error('Credit Buyer Error:', error);
        res.status(500).json({ error: 'Failed to compute buyer credit score' });
    }
};

// GET /api/credit/buyers/:name/history
// The transparent score-change timeline for one buyer.
exports.getHistory = async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM buyer_credit_history WHERE buyer_name = $1 ORDER BY created_at DESC',
            [req.params.name]
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Credit History Error:', error);
        res.status(500).json({ error: 'Failed to load score history' });
    }
};

// POST /api/credit/recalculate
// Recompute and save every buyer's score, appending history rows.
exports.recalculate = async (req, res) => {
    try {
        const scores = await runRecalculation();
        res.status(200).json({
            message: 'Buyer credit scores recalculated and saved',
            buyersProcessed: scores.length
        });
    } catch (error) {
        console.error('Credit Recalculate Error:', error);
        res.status(500).json({ error: 'Failed to recalculate credit scores' });
    }
};

// GET /api/credit/summary
// Rating distribution and average score across all buyers.
exports.getSummary = async (req, res) => {
    try {
        const scores = await computeScores();
        let excellent = 0, good = 0, fair = 0, poor = 0;
        scores.forEach(s => {
            if (s.rating === 'Excellent') excellent += 1;
            else if (s.rating === 'Good') good += 1;
            else if (s.rating === 'Fair') fair += 1;
            else poor += 1;
        });
        const averageScore = scores.length > 0
            ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length)
            : 0;

        res.status(200).json({
            totalBuyers: scores.length,
            averageScore: averageScore,
            excellent: excellent,
            good: good,
            fair: fair,
            poor: poor
        });
    } catch (error) {
        console.error('Credit Summary Error:', error);
        res.status(500).json({ error: 'Failed to compute credit summary' });
    }
};

// ===========================================================================
// Weights config, review notes & manual override (write side of the feature).
//
// These give Feature 4 a full GET + POST + PATCH + DELETE surface:
//   - credit_config : tune the four component weights (they must sum to 1.0)
//   - credit_notes  : analyst credit-review notes per buyer
//   - override      : pin a buyer's score by hand, with the reason logged to
//                     buyer_credit_history so the change stays explainable.
// ===========================================================================

// GET /api/credit/config - the current component weights.
exports.getConfig = async (req, res) => {
    try {
        const weights = await loadWeights();
        res.status(200).json({ weights, defaults: DEFAULT_WEIGHTS });
    } catch (error) {
        console.error('Credit Config Read Error:', error);
        res.status(500).json({ error: 'Failed to load config' });
    }
};

// PATCH /api/credit/config
// body: { paymentSpeed, reliability, disputeFree, trackRecord } as fractions.
// Any subset may be sent; the four are then normalised to sum to 1.0 so the
// score stays on a 0-100 scale whatever the analyst enters.
exports.updateConfig = async (req, res) => {
    try {
        const current = await loadWeights();
        const merged = {
            paymentSpeed: req.body.paymentSpeed !== undefined ? Number(req.body.paymentSpeed) : current.paymentSpeed,
            reliability: req.body.reliability !== undefined ? Number(req.body.reliability) : current.reliability,
            disputeFree: req.body.disputeFree !== undefined ? Number(req.body.disputeFree) : current.disputeFree,
            trackRecord: req.body.trackRecord !== undefined ? Number(req.body.trackRecord) : current.trackRecord
        };
        const vals = Object.values(merged);
        if (vals.some(v => !isFinite(v) || v < 0)) {
            return res.status(400).json({ error: 'Weights must be non-negative numbers' });
        }
        const total = vals.reduce((s, v) => s + v, 0);
        if (total <= 0) {
            return res.status(400).json({ error: 'Weights cannot all be zero' });
        }
        // Normalise to sum to exactly 1.0.
        const norm = {
            paymentSpeed: merged.paymentSpeed / total,
            reliability: merged.reliability / total,
            disputeFree: merged.disputeFree / total,
            trackRecord: merged.trackRecord / total
        };
        await pool.query(`
            INSERT INTO credit_config (id, payment_speed, reliability, dispute_free, track_record, updated_at)
            VALUES (1, $1, $2, $3, $4, NOW())
            ON CONFLICT (id)
            DO UPDATE SET payment_speed = $1, reliability = $2, dispute_free = $3, track_record = $4, updated_at = NOW()
        `, [norm.paymentSpeed, norm.reliability, norm.disputeFree, norm.trackRecord]);
        res.status(200).json({ message: 'Weights updated', weights: norm });
    } catch (error) {
        console.error('Credit Config Update Error:', error);
        res.status(500).json({ error: 'Failed to update config' });
    }
};

// GET /api/credit/buyers/:name/notes - analyst review notes for one buyer.
exports.getNotes = async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM credit_notes WHERE buyer_name = $1 ORDER BY created_at DESC',
            [req.params.name]
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Credit Notes Read Error:', error);
        res.status(500).json({ error: 'Failed to load notes' });
    }
};

// POST /api/credit/buyers/:name/notes
// body: { note, author? }
exports.addNote = async (req, res) => {
    try {
        const { note, author } = req.body;
        if (!note || !String(note).trim()) {
            return res.status(400).json({ error: 'A non-empty note is required' });
        }
        const result = await pool.query(`
            INSERT INTO credit_notes (buyer_name, note, author)
            VALUES ($1, $2, $3)
            RETURNING *
        `, [req.params.name, String(note).trim(), author ? String(author).trim() : 'Analyst']);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Credit Add Note Error:', error);
        res.status(500).json({ error: 'Failed to add note' });
    }
};

// DELETE /api/credit/buyers/:name/notes/:id
exports.deleteNote = async (req, res) => {
    try {
        const result = await pool.query(
            'DELETE FROM credit_notes WHERE id = $1 AND buyer_name = $2 RETURNING id',
            [Number(req.params.id), req.params.name]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Note not found' });
        res.status(200).json({ message: 'Note deleted', id: result.rows[0].id });
    } catch (error) {
        console.error('Credit Delete Note Error:', error);
        res.status(500).json({ error: 'Failed to delete note' });
    }
};

// PATCH /api/credit/buyers/:name/override
// body: { score, reason }  - pin a score by hand; reason is required and is
// written to buyer_credit_history so the manual change is auditable.
// Send score = null to clear the override and fall back to the computed score.
exports.override = async (req, res) => {
    try {
        const name = req.params.name;
        const { score, reason } = req.body;

        // Clear the override.
        if (score === null || score === undefined || score === '') {
            const prev = await pool.query('SELECT score FROM buyer_credit_score WHERE buyer_name = $1', [name]);
            const oldScore = prev.rows.length > 0 ? prev.rows[0].score : null;
            await pool.query(`
                UPDATE buyer_credit_score
                SET manual_override = FALSE, override_reason = NULL, updated_at = NOW()
                WHERE buyer_name = $1
            `, [name]);
            await pool.query(`
                INSERT INTO buyer_credit_history (buyer_name, score, old_score, reason)
                VALUES ($1, $2, $3, $4)
            `, [name, oldScore, oldScore, `Manual override cleared${reason ? ': ' + String(reason).trim() : ''}.`]);
            return res.status(200).json({ message: 'Override cleared', buyerName: name });
        }

        const newScore = Math.round(Number(score));
        if (!isFinite(newScore) || newScore < 0 || newScore > 100) {
            return res.status(400).json({ error: 'score must be a number between 0 and 100 (or null to clear)' });
        }
        if (!reason || !String(reason).trim()) {
            return res.status(400).json({ error: 'A reason is required for a manual override' });
        }
        const rating = ratingFor(newScore);
        const cleanReason = String(reason).trim();

        const prev = await pool.query('SELECT score FROM buyer_credit_score WHERE buyer_name = $1', [name]);
        const oldScore = prev.rows.length > 0 ? prev.rows[0].score : null;

        await pool.query(`
            INSERT INTO buyer_credit_score (buyer_name, score, rating, manual_override, override_reason, updated_at)
            VALUES ($1, $2, $3, TRUE, $4, NOW())
            ON CONFLICT (buyer_name)
            DO UPDATE SET score = $2, rating = $3, manual_override = TRUE, override_reason = $4, updated_at = NOW()
        `, [name, newScore, rating, cleanReason]);

        await pool.query(`
            INSERT INTO buyer_credit_history (buyer_name, score, old_score, reason)
            VALUES ($1, $2, $3, $4)
        `, [name, newScore, oldScore, `Manual override to ${newScore} (${rating}): ${cleanReason}`]);

        res.status(200).json({
            message: 'Score overridden', buyerName: name,
            score: newScore, rating, overridden: true, overrideReason: cleanReason
        });
    } catch (error) {
        console.error('Credit Override Error:', error);
        res.status(500).json({ error: 'Failed to override score' });
    }
};
