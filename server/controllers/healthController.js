const pool = require('../db');
const notificationService = require('../services/notificationService');

// Supplier health is buyer-facing intelligence, so its alerts go to the buyer.
// Placeholder address until the app has real buyer accounts / auth. Set
// BUYER_EMAIL in .env to receive these alerts at your own inbox while testing.
const BUYER_RECIPIENT = process.env.BUYER_EMAIL || 'buyer@clarityb2b.com';

// Default band thresholds. These are used if the config table is empty or
// missing. The buyer can change them through PATCH /api/health/config.
const DEFAULT_WATCH_BELOW = 80;
const DEFAULT_DISTRESS_BELOW = 60;

// Read the current band thresholds from the database.
// If the row or table is not there yet, fall back to the defaults above.
async function readConfig() {
    try {
        const result = await pool.query(
            'SELECT watch_below, distress_below FROM supplier_health_config WHERE id = 1'
        );
        if (result.rows.length > 0) {
            const row = result.rows[0];
            return {
                watchBelow: row.watch_below,
                distressBelow: row.distress_below
            };
        }
    } catch (error) {
        console.error('Could not read health config, using defaults:', error.message);
    }
    return {
        watchBelow: DEFAULT_WATCH_BELOW,
        distressBelow: DEFAULT_DISTRESS_BELOW
    };
}

// Core calculation. Reads invoice activity, turns it into a health score and
// band for every supplier, and returns them as an array.
//
// If buyerName is given, only that buyer's suppliers are included. If it is
// left out, every supplier is scored.
async function computeHealth(buyerName) {
    // 1. Read the band thresholds (the buyer may have changed them).
    const config = await readConfig();

    // 2. Fetch invoices. Optionally limit to a single buyer's suppliers.
    let invoiceQuery = `
        SELECT
            supplier_id,
            buyer_name,
            status,
            invoice_amount,
            payout_amount
        FROM invoices
        WHERE supplier_id IS NOT NULL
    `;
    const invoiceParams = [];
    if (buyerName) {
        invoiceParams.push(buyerName);
        invoiceQuery += ' AND buyer_name = $1';
    }
    const invoiceResult = await pool.query(invoiceQuery, invoiceParams);
    const invoices = invoiceResult.rows;

    // 3. Count "late corrections" per supplier. A late correction is when one
    //    of the supplier's invoices was moved from Disputed back to an active
    //    stage, meaning the supplier had to fix and resubmit after a dispute.
    let correctionQuery = `
        SELECT i.supplier_id AS supplier_id
        FROM invoice_history h
        JOIN invoices i ON h.invoice_id = i.id
        WHERE h.old_status = 'Disputed'
          AND h.stage IN ('Submitted', 'Buyer Confirmed')
    `;
    const correctionParams = [];
    if (buyerName) {
        correctionParams.push(buyerName);
        correctionQuery += ' AND i.buyer_name = $1';
    }
    const correctionResult = await pool.query(correctionQuery, correctionParams);

    const correctionCounts = {};
    correctionResult.rows.forEach(row => {
        const id = row.supplier_id;
        if (!correctionCounts[id]) {
            correctionCounts[id] = 0;
        }
        correctionCounts[id] += 1;
    });

    // 3b. Which suppliers the buyer has flagged onto the review watchlist.
    //     Wrapped in try/catch so it still works before the table is created.
    const watchlistMap = {};
    try {
        const watchlistResult = await pool.query('SELECT supplier_id, watchlisted FROM supplier_watchlist');
        watchlistResult.rows.forEach(row => {
            watchlistMap[row.supplier_id] = row.watchlisted;
        });
    } catch (error) {
        console.error('Could not read watchlist, treating all as not flagged:', error.message);
    }

    // 3c. Real supplier names. First from the suppliers table (integer id,
    //     read as text so it matches invoices.supplier_id). Then overlay the
    //     text-keyed supplier_names table, which can name suppliers whose id is
    //     text like "BUP-606". Anything still unnamed falls back to a
    //     "Supplier <id>" label below. Both reads are guarded so a missing
    //     table is not fatal.
    const nameMap = {};
    try {
        const nameResult = await pool.query('SELECT id, name FROM suppliers');
        nameResult.rows.forEach(row => {
            nameMap[String(row.id)] = row.name;
        });
    } catch (error) {
        console.error('Could not read suppliers table, using fallback labels:', error.message);
    }
    try {
        const customNames = await pool.query('SELECT supplier_id, name FROM supplier_names');
        customNames.rows.forEach(row => {
            nameMap[row.supplier_id] = row.name;
        });
    } catch (error) {
        console.error('Could not read supplier_names table:', error.message);
    }

    // 4. Group the invoice numbers by supplier.
    const suppliersData = {};

    invoices.forEach(inv => {
        if (!suppliersData[inv.supplier_id]) {
            suppliersData[inv.supplier_id] = {
                id: inv.supplier_id,
                // Real company name if we have one, otherwise a "Supplier <id>" label.
                name: nameMap[inv.supplier_id] || `Supplier ${inv.supplier_id}`,
                totalInvoices: 0,
                earlyFunded: 0,
                disputed: 0,
                lateCorrections: correctionCounts[inv.supplier_id] || 0,
                totalDiscount: 0,
                totalInvoiceAmount: 0
            };
        }

        const s = suppliersData[inv.supplier_id];
        s.totalInvoices += 1;

        const amount = Number(inv.invoice_amount) || 0;
        const payout = Number(inv.payout_amount) || 0;

        s.totalInvoiceAmount += amount;

        // Early funding: a payout exists and is smaller than the invoice amount.
        if (payout > 0 && payout < amount) {
            s.earlyFunded += 1;
            s.totalDiscount += (amount - payout);
        }

        if (inv.status === 'Disputed') {
            s.disputed += 1;
        }
    });

    // 5. Turn each supplier's numbers into a score, a list of reasons, and a band.
    const analytics = Object.values(suppliersData).map(supplier => {
        let score = 100;
        const reasons = [];

        // Signal 1: how often the supplier relies on early funding.
        const earlyFundingRate = supplier.totalInvoices > 0
            ? (supplier.earlyFunded / supplier.totalInvoices)
            : 0;
        if (earlyFundingRate > 0.8) {
            score -= 20;
            reasons.push('-20 pts: Extremely high reliance on early funding (>80% of invoices)');
        } else if (earlyFundingRate > 0.5) {
            score -= 10;
            reasons.push('-10 pts: High reliance on early funding (>50% of invoices)');
        }

        // Signal 2: how aggressive the accepted discount rates are.
        const avgDiscountRate = supplier.totalInvoiceAmount > 0
            ? (supplier.totalDiscount / supplier.totalInvoiceAmount)
            : 0;
        if (avgDiscountRate > 0.05) {
            score -= 15;
            reasons.push('-15 pts: Accepting aggressively high discount rates (>5% avg)');
        }

        // Signal 3: open disputes cause buyer friction.
        if (supplier.disputed > 0) {
            const penalty = supplier.disputed * 10;
            score -= penalty;
            reasons.push(`-${penalty} pts: ${supplier.disputed} disputed invoice(s) causing buyer friction`);
        }

        // Signal 4: late corrections after a dispute.
        if (supplier.lateCorrections > 0) {
            const penalty = supplier.lateCorrections * 5;
            score -= penalty;
            reasons.push(`-${penalty} pts: ${supplier.lateCorrections} late correction(s) after a dispute`);
        }

        // Never let the score drop below zero.
        if (score < 0) {
            score = 0;
        }

        // Decide the band from the (buyer-configurable) thresholds.
        let band = 'Healthy';
        let color = 'green';
        if (score < config.distressBelow) {
            band = 'Distress';
            color = 'red';
        } else if (score < config.watchBelow) {
            band = 'Watch';
            color = 'yellow';
        }

        if (reasons.length === 0) {
            reasons.push('Excellent operational and financial track record');
        }

        return {
            id: supplier.id,
            name: supplier.name,
            totalInvoices: supplier.totalInvoices,
            earlyFunded: supplier.earlyFunded,
            disputed: supplier.disputed,
            lateCorrections: supplier.lateCorrections,
            score: score,
            band: band,
            color: color,
            reasons: reasons,
            earlyFundingRate: Math.round(earlyFundingRate * 100),
            avgDiscountRate: (avgDiscountRate * 100).toFixed(1),
            watchlisted: watchlistMap[supplier.id] || false
        };
    });

    return analytics;
}

// Rank the bands so we can tell when a supplier moved to a worse one.
// Higher number = worse health.
function bandRank(band) {
    if (band === 'Distress') {
        return 2;
    }
    if (band === 'Watch') {
        return 1;
    }
    return 0; // Healthy or unknown
}

// Recalculate every supplier, save the latest score/band, and raise alerts.
//
// Alerting depends on whether the buyer is watching the supplier:
//   - Normal supplier:    alert only when they fall into the Distress band.
//   - Watchlisted supplier: alert as soon as they slip into ANY worse band
//                           (Healthy -> Watch, or into Distress). This is the
//                           earlier warning the buyer gets by watching them.
//
// This is also called by the invoice pipeline after a status change, so health
// stays up to date whenever an invoice moves.
async function runRecalculation() {
    const analytics = await computeHealth();

    for (let i = 0; i < analytics.length; i++) {
        const supplier = analytics[i];

        // What band did we save for this supplier last time?
        const previous = await pool.query(
            'SELECT band FROM supplier_health WHERE supplier_id = $1',
            [supplier.id]
        );
        let previousBand = null;
        if (previous.rows.length > 0) {
            previousBand = previous.rows[0].band;
        }

        // Save (insert or update) the latest score and band.
        await pool.query(`
            INSERT INTO supplier_health (supplier_id, score, band, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (supplier_id)
            DO UPDATE SET score = $2, band = $3, updated_at = NOW()
        `, [supplier.id, supplier.score, supplier.band]);

        // Decide whether this change is worth an alert.
        let shouldAlert = false;
        let message = '';

        // Did the supplier move to a worse band than last time?
        const gotWorse = bandRank(supplier.band) > bandRank(previousBand);

        if (supplier.watchlisted) {
            // Watched: earlier warning on any slip into a worse band.
            // (previousBand must exist, so we do not alert on the first ever calc.)
            if (previousBand !== null && gotWorse) {
                shouldAlert = true;
                message = `[Watchlist] ${supplier.name} slipped into the ${supplier.band} band (score ${supplier.score}). Early warning on a supplier you are monitoring.`;
            }
        } else {
            // Normal: only when newly crossing into Distress.
            if (supplier.band === 'Distress' && previousBand !== 'Distress') {
                shouldAlert = true;
                message = `Supplier ${supplier.name} has crossed into the Distress band (score ${supplier.score}).`;
            }
        }

        if (shouldAlert) {
            // 1. Save the alert for the Supplier Health panel's own banner.
            await pool.query(`
                INSERT INTO supplier_health_alerts (supplier_id, score, message)
                VALUES ($1, $2, $3)
            `, [supplier.id, supplier.score, message]);

            // 2. Also push the same alert to the buyer through the shared
            //    Notification Center, so it lands in the bell and email
            //    automatically - no need to open the health panel.
            await notificationService.sendNotification({
                recipient: BUYER_RECIPIENT,
                message: message,
                invoiceLink: '/health',
                type: 'distress_alert',
                emailSubject: 'Clarity B2B: Supplier Health Alert'
            });
        }
    }

    return analytics;
}

// Exported so the invoice pipeline can refresh health after a status change.
exports.runRecalculation = runRecalculation;

// GET /api/health/suppliers            (optional ?buyer=Name)
// List every supplier with its current health score and band.
exports.getSupplierHealth = async (req, res) => {
    try {
        const buyerName = req.query.buyer; // undefined means "all buyers"
        const analytics = await computeHealth(buyerName);
        res.status(200).json(analytics);
    } catch (error) {
        console.error('Supplier Health Error:', error);
        res.status(500).json({ error: 'Failed to compute supplier health' });
    }
};

// GET /api/health/suppliers/:id
// One supplier's full health detail (signals, reasons, band).
exports.getSupplierById = async (req, res) => {
    try {
        const supplierId = req.params.id;
        const analytics = await computeHealth();
        const supplier = analytics.find(s => String(s.id) === String(supplierId));

        if (!supplier) {
            return res.status(404).json({ error: 'Supplier not found' });
        }

        res.status(200).json(supplier);
    } catch (error) {
        console.error('Supplier Detail Error:', error);
        res.status(500).json({ error: 'Failed to compute supplier health' });
    }
};

// GET /api/health/summary             (optional ?buyer=Name)
// Counts of suppliers in each band, plus percentages. This drives the
// buyer's "Supplier Risk Index" panel.
exports.getSummary = async (req, res) => {
    try {
        const buyerName = req.query.buyer;
        const analytics = await computeHealth(buyerName);

        const total = analytics.length;
        let healthy = 0;
        let watch = 0;
        let distress = 0;

        analytics.forEach(supplier => {
            if (supplier.band === 'Healthy') {
                healthy += 1;
            } else if (supplier.band === 'Watch') {
                watch += 1;
            } else if (supplier.band === 'Distress') {
                distress += 1;
            }
        });

        // Small helper so we do not repeat the same rounding three times.
        function toPercent(count) {
            if (total === 0) {
                return 0;
            }
            return Math.round((count / total) * 100);
        }

        res.status(200).json({
            totalSuppliers: total,
            healthy: healthy,
            watch: watch,
            distress: distress,
            healthyPercent: toPercent(healthy),
            watchPercent: toPercent(watch),
            distressPercent: toPercent(distress)
        });
    } catch (error) {
        console.error('Supplier Summary Error:', error);
        res.status(500).json({ error: 'Failed to compute supplier summary' });
    }
};

// POST /api/health/recalculate
// Recompute and save every supplier's score, raising distress alerts.
exports.recalculate = async (req, res) => {
    try {
        const analytics = await runRecalculation();
        res.status(200).json({
            message: 'Supplier health recalculated and saved',
            suppliersProcessed: analytics.length,
            data: analytics
        });
    } catch (error) {
        console.error('Recalculate Error:', error);
        res.status(500).json({ error: 'Failed to recalculate supplier health' });
    }
};

// GET /api/health/alerts
// List distress alerts, newest first.
exports.getAlerts = async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM supplier_health_alerts ORDER BY created_at DESC'
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Get Alerts Error:', error);
        res.status(500).json({ error: 'Failed to fetch alerts' });
    }
};

// PATCH /api/health/alerts/:id/acknowledge
// Mark one alert as read (seen by the buyer).
exports.acknowledgeAlert = async (req, res) => {
    try {
        const alertId = req.params.id;
        const result = await pool.query(
            'UPDATE supplier_health_alerts SET is_read = TRUE WHERE id = $1 RETURNING *',
            [alertId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Alert not found' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Acknowledge Alert Error:', error);
        res.status(500).json({ error: 'Failed to acknowledge alert' });
    }
};

// GET /api/health/config
// Show the current band thresholds.
exports.getConfig = async (req, res) => {
    try {
        const config = await readConfig();
        res.status(200).json(config);
    } catch (error) {
        console.error('Get Config Error:', error);
        res.status(500).json({ error: 'Failed to read config' });
    }
};

// PATCH /api/health/config
// Update the band thresholds. Body: { "watchBelow": 80, "distressBelow": 60 }
exports.updateConfig = async (req, res) => {
    try {
        const watchBelow = req.body.watchBelow;
        const distressBelow = req.body.distressBelow;

        // Basic validation so we never store nonsense thresholds.
        if (typeof watchBelow !== 'number' || typeof distressBelow !== 'number') {
            return res.status(400).json({ error: 'watchBelow and distressBelow must be numbers' });
        }
        if (distressBelow < 0 || watchBelow > 100) {
            return res.status(400).json({ error: 'Thresholds must be between 0 and 100' });
        }
        if (distressBelow >= watchBelow) {
            return res.status(400).json({ error: 'distressBelow must be less than watchBelow' });
        }

        await pool.query(`
            INSERT INTO supplier_health_config (id, watch_below, distress_below)
            VALUES (1, $1, $2)
            ON CONFLICT (id)
            DO UPDATE SET watch_below = $1, distress_below = $2
        `, [watchBelow, distressBelow]);

        res.status(200).json({
            message: 'Thresholds updated',
            watchBelow: watchBelow,
            distressBelow: distressBelow
        });
    } catch (error) {
        console.error('Update Config Error:', error);
        res.status(500).json({ error: 'Failed to update config' });
    }
};

// POST /api/health/suppliers/:id/watchlist
// Add or remove one supplier from the buyer's review watchlist (flips it).
exports.toggleWatchlist = async (req, res) => {
    try {
        const supplierId = req.params.id;

        // Read the current flag (default false if there is no row yet).
        const current = await pool.query(
            'SELECT watchlisted FROM supplier_watchlist WHERE supplier_id = $1',
            [supplierId]
        );
        let watchlisted = false;
        if (current.rows.length > 0) {
            watchlisted = current.rows[0].watchlisted;
        }

        // Flip it and save (insert the row if it does not exist yet).
        const newWatchlisted = !watchlisted;
        await pool.query(`
            INSERT INTO supplier_watchlist (supplier_id, watchlisted, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (supplier_id)
            DO UPDATE SET watchlisted = $2, updated_at = NOW()
        `, [supplierId, newWatchlisted]);

        res.status(200).json({ supplierId: supplierId, watchlisted: newWatchlisted });
    } catch (error) {
        console.error('Toggle Watchlist Error:', error);
        res.status(500).json({ error: 'Failed to update watchlist' });
    }
};

// GET /api/health/watchlist
// Return only the suppliers currently on the buyer's watchlist.
exports.getWatchlist = async (req, res) => {
    try {
        const analytics = await computeHealth();
        const watchlisted = analytics.filter(s => s.watchlisted === true);
        res.status(200).json(watchlisted);
    } catch (error) {
        console.error('Get Watchlist Error:', error);
        res.status(500).json({ error: 'Failed to fetch watchlist' });
    }
};
