const pool = require('../db');

// The four score components and their weights. They sum to 1.0.
// This is a shared service: the discount calculator and risk rating engine
// read the score this produces.
const WEIGHTS = {
    paymentSpeed: 0.30,   // how fast the buyer pays
    reliability: 0.25,    // how rarely they go overdue
    disputeFree: 0.25,    // how rarely they dispute
    trackRecord: 0.20     // how established they are (confirmations + volume)
};

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
            'SELECT score FROM buyer_credit_score WHERE buyer_name = $1',
            [entry.buyerName]
        );
        let oldScore = null;
        if (prev.rows.length > 0) {
            oldScore = prev.rows[0].score;
        }

        // Save the latest score/rating.
        await pool.query(`
            INSERT INTO buyer_credit_score (buyer_name, score, rating, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (buyer_name)
            DO UPDATE SET score = $2, rating = $3, updated_at = NOW()
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

// GET /api/credit/buyers
// Every buyer with current score, rating, components, and metrics.
exports.getBuyers = async (req, res) => {
    try {
        const scores = await computeScores();
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
        res.status(200).json(scores[0]);
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
