const pool = require('../db');
// Feature 3 <- Feature 4 integration: the buyer credit model supplies each
// buyer's default probability, which turns raw returns into risk-adjusted ones.
const credit = require('./creditController');

// The platform facilitation fee taken from each funded invoice (FR: 0.5%-1%).
const PLATFORM_FEE_RATE = 0.01;

// An unpaid invoice within this many days past its due date counts as "Matured"
// (reached maturity, awaiting repayment). Beyond it, it becomes "Overdue".
const MATURED_GRACE_DAYS = 30;

function daysBetween(later, earlier) {
    const ms = new Date(later).getTime() - new Date(earlier).getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
}

// ===========================================================================
// INTEGRATION SEAM for teammates (Apurba's Funder Wallet Ledger + Ameet's
// Settlement Engine).
//
// This one function is the ONLY place portfolio data is sourced. Today it
// derives each investment from the `invoices` table (funder_id, payout_amount,
// invoice_amount, due_date, payment_date, status), because the real ledger and
// settlement tables do not exist yet.
//
// To connect the real features later, replace the body of loadFunderRecords()
// so it returns the same record shape from the real sources:
//   - funding + fee     -> Apurba's funder wallet ledger
//   - repayment + settle -> Ameet's settlement engine
// Nothing else in this file needs to change - the whole dashboard is built on
// the record shape returned here:
//   { funderId, funderName, buyerName, principal, faceValue, feeRate,
//     fundedDate, dueDate, repaidDate, status }
// ===========================================================================
async function loadFunderRecords(funderId) {
    // Funder display names (funders.id integer -> name).
    const funderNames = {};
    try {
        const fr = await pool.query('SELECT id, name FROM funders');
        fr.rows.forEach(row => { funderNames[String(row.id)] = row.name; });
    } catch (error) {
        console.error('Could not read funders:', error.message);
    }

    let query = `
        SELECT id, funder_id, buyer_name, invoice_amount, payout_amount,
               submitted_date, due_date, payment_date, status
        FROM invoices
        WHERE funder_id IS NOT NULL
    `;
    const params = [];
    if (funderId) { params.push(funderId); query += ' AND funder_id = $1'; }
    const result = await pool.query(query, params);

    return result.rows.map(inv => ({
        funderId: String(inv.funder_id),
        funderName: funderNames[String(inv.funder_id)] || ('Funder ' + inv.funder_id),
        invoiceId: inv.id,
        buyerName: inv.buyer_name,
        principal: Number(inv.payout_amount) || 0,   // capital deployed
        faceValue: Number(inv.invoice_amount) || 0,  // repaid at maturity
        feeRate: PLATFORM_FEE_RATE,
        fundedDate: inv.submitted_date,               // proxy for funding date
        dueDate: inv.due_date,
        repaidDate: inv.payment_date,
        status: inv.status
    }));
}

// Turn the sourced records into per-funder portfolios: buckets, returns,
// annualised rates, and a maturity schedule.
async function computePortfolios(funderId) {
    const records = await loadFunderRecords(funderId);
    const today = new Date();
    const byFunder = {};

    // Credit-risk inputs (Feature 4): every buyer's score + the pricing policy,
    // used to compute a probability of default and expected loss per investment.
    const scoreMap = await credit.allBuyerScores();
    const policy = await credit.loadPricingPolicy();

    records.forEach(rec => {
        const fid = rec.funderId;
        if (!byFunder[fid]) {
            byFunder[fid] = {
                funderId: fid, funderName: rec.funderName,
                active: [], matured: [], overdue: [], completed: [],
                deployedCapital: 0, projectedReturn: 0, realizedReturn: 0,
                totalInvested: 0, completedPrincipal: 0,
                rateWeightedSum: 0, rateWeight: 0,
                expectedLoss: 0, buyerExposure: {}
            };
        }
        const f = byFunder[fid];

        const grossReturn = rec.faceValue - rec.principal;
        const platformFee = rec.faceValue * rec.feeRate;
        let netReturn = grossReturn - platformFee;
        if (netReturn < 0) netReturn = grossReturn;

        let holdingDays = 90;
        if (rec.fundedDate && rec.dueDate) {
            const d = daysBetween(rec.dueDate, rec.fundedDate);
            if (d > 0) holdingDays = d;
        }
        const annualRate = rec.principal > 0
            ? (netReturn / rec.principal) * (365 / holdingDays) * 100 : 0;

        // Default risk from the buyer's credit score (unknown buyer -> neutral 50).
        const buyerScore = scoreMap[rec.buyerName] != null ? scoreMap[rec.buyerName] : 50;
        const pdAnnual = credit.pdFromScore(buyerScore, policy);
        const pdHold = pdAnnual * (holdingDays / 365);
        const expectedLoss = rec.principal * pdHold * policy.lgd;

        const item = {
            invoiceId: rec.invoiceId,
            buyerName: rec.buyerName,
            principal: Math.round(rec.principal),
            faceValue: Math.round(rec.faceValue),
            expectedReturn: Math.round(netReturn),
            platformFee: Math.round(platformFee),
            annualRate: annualRate.toFixed(1),
            buyerScore: buyerScore,
            pd: Number((pdAnnual * 100).toFixed(1)),
            expectedLoss: Math.round(expectedLoss),
            riskAdjustedReturn: Math.round(netReturn - expectedLoss),
            dueDate: rec.dueDate,
            status: rec.status
        };

        f.totalInvested += rec.principal;
        const isRepaid = rec.repaidDate !== null || rec.status === 'Completed';

        if (isRepaid) {
            item.bucket = 'Completed';
            f.completed.push(item);
            f.realizedReturn += netReturn;
            f.completedPrincipal += rec.principal;
        } else {
            // Capital still out: split by how far past its due date it is.
            let daysPastDue = 0;
            if (rec.dueDate) {
                daysPastDue = daysBetween(today, rec.dueDate);
            }
            if (daysPastDue > MATURED_GRACE_DAYS) {
                item.bucket = 'Overdue';        // well past due - late
                f.overdue.push(item);
            } else if (daysPastDue > 0) {
                item.bucket = 'Matured';         // reached maturity, awaiting repayment
                f.matured.push(item);
            } else {
                item.bucket = 'Active';          // still running
                f.active.push(item);
            }
            f.deployedCapital += rec.principal;
            f.projectedReturn += netReturn;
            f.rateWeightedSum += annualRate * rec.principal;
            f.rateWeight += rec.principal;
            // Risk accumulation on capital still at risk.
            f.expectedLoss += expectedLoss;
            f.buyerExposure[rec.buyerName] = (f.buyerExposure[rec.buyerName] || 0) + rec.principal;
        }
    });

    return Object.values(byFunder).map(f => {
        const projectedAnnualRate = f.rateWeight > 0 ? (f.rateWeightedSum / f.rateWeight) : 0;
        const realizedAnnualRate = f.completedPrincipal > 0 ? (f.realizedReturn / f.completedPrincipal) * 100 : 0;

        // Maturity schedule = all capital still out, soonest first.
        const maturitySchedule = f.active.concat(f.matured).concat(f.overdue)
            .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

        // ---- Risk-adjusted analytics (Feature 3 <- Feature 4) --------------
        const riskAdjustedReturn = f.projectedReturn - f.expectedLoss;
        const riskAdjustedAnnualRate = f.projectedReturn > 0
            ? projectedAnnualRate * (riskAdjustedReturn / f.projectedReturn) : 0;
        const expectedLossRate = f.deployedCapital > 0 ? (f.expectedLoss / f.deployedCapital) * 100 : 0;

        // Concentration: how the deployed capital is spread across buyers.
        const buyers = Object.keys(f.buyerExposure).map(name => ({
            name,
            exposure: Math.round(f.buyerExposure[name]),
            pct: f.deployedCapital > 0 ? Number(((f.buyerExposure[name] / f.deployedCapital) * 100).toFixed(1)) : 0
        })).sort((a, b) => b.exposure - a.exposure);
        // Herfindahl-Hirschman Index (0-10000): sum of squared percentage shares.
        const hhi = Math.round(buyers.reduce((s, b) => s + Math.pow(b.pct, 2), 0));
        let concentrationStatus = 'Diversified';
        if (hhi > 2500) concentrationStatus = 'Concentrated';
        else if (hhi >= 1500) concentrationStatus = 'Moderate';

        return {
            funderId: f.funderId,
            funderName: f.funderName,
            deployedCapital: Math.round(f.deployedCapital),
            projectedReturn: Math.round(f.projectedReturn),
            realizedReturn: Math.round(f.realizedReturn),
            totalInvested: Math.round(f.totalInvested),
            projectedAnnualRate: projectedAnnualRate.toFixed(1),
            realizedAnnualRate: realizedAnnualRate.toFixed(1),
            activeCount: f.active.length,
            maturedCount: f.matured.length,
            overdueCount: f.overdue.length,
            completedCount: f.completed.length,
            totalInvestments: f.active.length + f.matured.length + f.overdue.length + f.completed.length,
            active: f.active,
            matured: f.matured,
            overdue: f.overdue,
            completed: f.completed,
            maturitySchedule: maturitySchedule,
            risk: {
                expectedLoss: Math.round(f.expectedLoss),
                expectedLossRate: Number(expectedLossRate.toFixed(2)),
                riskAdjustedReturn: Math.round(riskAdjustedReturn),
                riskAdjustedAnnualRate: Number(riskAdjustedAnnualRate.toFixed(1)),
                concentration: {
                    hhi: hhi,
                    status: concentrationStatus,
                    topBuyerName: buyers.length ? buyers[0].name : null,
                    topBuyerPct: buyers.length ? buyers[0].pct : 0,
                    buyers: buyers.slice(0, 6)
                }
            }
        };
    });
}

// Active (capital-still-at-risk) holdings for one funder, each enriched with the
// buyer's default probability + baseline expected loss. Exported so the Stress
// Testing module (Feature 3 - Part B) can apply scenario shocks to real holdings
// without re-deriving the fee/holding/PD logic.
exports.activeHoldingsWithRisk = async (funderId) => {
    const records = await loadFunderRecords(funderId);
    const scoreMap = await credit.allBuyerScores();
    const policy = await credit.loadPricingPolicy();

    const holdings = [];
    records.forEach(rec => {
        const isRepaid = rec.repaidDate !== null || rec.status === 'Completed';
        if (isRepaid) return; // stress applies only to capital still out

        const grossReturn = rec.faceValue - rec.principal;
        const platformFee = rec.faceValue * rec.feeRate;
        let netReturn = grossReturn - platformFee;
        if (netReturn < 0) netReturn = grossReturn;

        let holdingDays = 90;
        if (rec.fundedDate && rec.dueDate) {
            const d = daysBetween(rec.dueDate, rec.fundedDate);
            if (d > 0) holdingDays = d;
        }

        const score = scoreMap[rec.buyerName] != null ? scoreMap[rec.buyerName] : 50;
        const pdAnnual = credit.pdFromScore(score, policy);
        const lgd = policy.lgd;
        const expectedLoss = rec.principal * (pdAnnual * (holdingDays / 365)) * lgd;

        holdings.push({
            invoiceId: rec.invoiceId,
            buyerName: rec.buyerName,
            principal: rec.principal,
            netReturn,
            holdingDays,
            score,
            pdAnnual,
            lgd,
            expectedLoss
        });
    });
    return holdings;
};

// GET /api/portfolio/funders
exports.getFunders = async (req, res) => {
    try {
        const portfolios = await computePortfolios();
        const summary = portfolios.map(p => ({
            funderId: p.funderId, funderName: p.funderName,
            deployedCapital: p.deployedCapital, projectedReturn: p.projectedReturn,
            realizedReturn: p.realizedReturn, projectedAnnualRate: p.projectedAnnualRate,
            realizedAnnualRate: p.realizedAnnualRate,
            activeCount: p.activeCount, maturedCount: p.maturedCount,
            overdueCount: p.overdueCount, completedCount: p.completedCount,
            totalInvestments: p.totalInvestments
        }));
        res.status(200).json(summary);
    } catch (error) {
        console.error('Portfolio Funders Error:', error);
        res.status(500).json({ error: 'Failed to compute portfolios' });
    }
};

// Read a funder's saved target return %, or null if none set yet.
async function loadTarget(funderId) {
    try {
        const r = await pool.query(
            'SELECT target_rate FROM portfolio_targets WHERE funder_id = $1',
            [String(funderId)]
        );
        return r.rows.length > 0 ? Number(r.rows[0].target_rate) : null;
    } catch (error) {
        console.error('Could not read portfolio target:', error.message);
        return null;
    }
}

// GET /api/portfolio/funders/:id
exports.getFunderPortfolio = async (req, res) => {
    try {
        const portfolios = await computePortfolios(req.params.id);
        if (portfolios.length === 0) {
            return res.status(404).json({ error: 'No portfolio found for this funder' });
        }
        const detail = portfolios[0];

        // Attach the funder's target return % and how the projected rate compares.
        const targetRate = await loadTarget(req.params.id);
        detail.targetRate = targetRate;
        if (targetRate !== null) {
            const projected = Number(detail.projectedAnnualRate) || 0;
            detail.targetGap = Number((projected - targetRate).toFixed(1)); // + means ahead of target
            detail.onTarget = projected >= targetRate;
        }

        res.status(200).json(detail);
    } catch (error) {
        console.error('Portfolio Detail Error:', error);
        res.status(500).json({ error: 'Failed to compute portfolio' });
    }
};

// GET /api/portfolio/summary
exports.getSummary = async (req, res) => {
    try {
        const portfolios = await computePortfolios();
        let deployed = 0, projected = 0, realized = 0;
        let active = 0, matured = 0, overdue = 0, completed = 0;
        let expectedLoss = 0, riskAdjusted = 0;
        portfolios.forEach(p => {
            deployed += p.deployedCapital; projected += p.projectedReturn; realized += p.realizedReturn;
            active += p.activeCount; matured += p.maturedCount; overdue += p.overdueCount; completed += p.completedCount;
            expectedLoss += p.risk.expectedLoss; riskAdjusted += p.risk.riskAdjustedReturn;
        });
        res.status(200).json({
            funders: portfolios.length,
            deployedCapital: deployed, projectedReturn: projected, realizedReturn: realized,
            expectedLoss: expectedLoss, riskAdjustedReturn: riskAdjusted,
            activeCount: active, maturedCount: matured, overdueCount: overdue, completedCount: completed
        });
    } catch (error) {
        console.error('Portfolio Summary Error:', error);
        res.status(500).json({ error: 'Failed to compute portfolio summary' });
    }
};

// ===========================================================================
// Investment Notes & Return Targets (write side of the feature).
//
// A funder can annotate or flag individual investments (portfolio_notes) and
// set a target return % that the dashboard compares against the projected rate
// (portfolio_targets). These give Feature 3 a full GET + POST + PATCH + DELETE
// surface instead of being read-only.
// ===========================================================================

// GET /api/portfolio/notes            all notes
// GET /api/portfolio/notes?funder=1   only that funder's notes
// GET /api/portfolio/notes?invoice=42 only that investment's notes
exports.getNotes = async (req, res) => {
    try {
        const clauses = [];
        const params = [];
        if (req.query.funder) { params.push(String(req.query.funder)); clauses.push('funder_id = $' + params.length); }
        if (req.query.invoice) { params.push(Number(req.query.invoice)); clauses.push('invoice_id = $' + params.length); }
        const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
        const result = await pool.query(
            'SELECT * FROM portfolio_notes' + where + ' ORDER BY created_at DESC',
            params
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Portfolio Notes Error:', error);
        res.status(500).json({ error: 'Failed to load notes' });
    }
};

// POST /api/portfolio/notes
// body: { funderId, invoiceId?, note, flagged? }
exports.createNote = async (req, res) => {
    try {
        const { funderId, invoiceId, note, flagged } = req.body;
        if (!funderId || !note || !String(note).trim()) {
            return res.status(400).json({ error: 'funderId and a non-empty note are required' });
        }
        const result = await pool.query(`
            INSERT INTO portfolio_notes (funder_id, invoice_id, note, flagged)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [String(funderId), invoiceId ? Number(invoiceId) : null, String(note).trim(), flagged === true]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Portfolio Create Note Error:', error);
        res.status(500).json({ error: 'Failed to create note' });
    }
};

// PATCH /api/portfolio/notes/:id
// body: { note?, flagged? } - either field may be updated
exports.updateNote = async (req, res) => {
    try {
        const { note, flagged } = req.body;
        if (note === undefined && flagged === undefined) {
            return res.status(400).json({ error: 'Provide note and/or flagged to update' });
        }
        const sets = [];
        const params = [];
        if (note !== undefined) { params.push(String(note).trim()); sets.push('note = $' + params.length); }
        if (flagged !== undefined) { params.push(flagged === true); sets.push('flagged = $' + params.length); }
        params.push(Number(req.params.id));
        const result = await pool.query(
            'UPDATE portfolio_notes SET ' + sets.join(', ') + ' WHERE id = $' + params.length + ' RETURNING *',
            params
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Note not found' });
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Portfolio Update Note Error:', error);
        res.status(500).json({ error: 'Failed to update note' });
    }
};

// DELETE /api/portfolio/notes/:id
exports.deleteNote = async (req, res) => {
    try {
        const result = await pool.query(
            'DELETE FROM portfolio_notes WHERE id = $1 RETURNING id',
            [Number(req.params.id)]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Note not found' });
        res.status(200).json({ message: 'Note deleted', id: result.rows[0].id });
    } catch (error) {
        console.error('Portfolio Delete Note Error:', error);
        res.status(500).json({ error: 'Failed to delete note' });
    }
};

// PUT /api/portfolio/funders/:id/target
// body: { targetRate }  - annualised target return %, e.g. 14.5
exports.setTarget = async (req, res) => {
    try {
        const rate = Number(req.body.targetRate);
        if (!isFinite(rate) || rate < 0 || rate > 100) {
            return res.status(400).json({ error: 'targetRate must be a number between 0 and 100' });
        }
        const result = await pool.query(`
            INSERT INTO portfolio_targets (funder_id, target_rate, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (funder_id)
            DO UPDATE SET target_rate = $2, updated_at = NOW()
            RETURNING *
        `, [String(req.params.id), rate]);
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Portfolio Set Target Error:', error);
        res.status(500).json({ error: 'Failed to set target' });
    }
};

// ===========================================================================
// Return Calculator / Deployment Planner (add-on).
//
// This is NOT a read of stored data - it takes the funder's own inputs (how
// much capital, over how many months) and RUNS a projection against the live
// marketplace: the capital-weighted average annualised rate and average ticket
// size are computed from real invoice-derived records, then used to project the
// return, monthly income, and how many invoices the capital could fund.
// ===========================================================================

// Current marketplace benchmarks, computed from every funded record.
async function marketplaceBenchmarks() {
    const records = await loadFunderRecords();
    let rateWeightedSum = 0, rateWeight = 0, principalSum = 0, count = 0;

    records.forEach(rec => {
        if (!(rec.principal > 0)) return;
        const grossReturn = rec.faceValue - rec.principal;
        const platformFee = rec.faceValue * rec.feeRate;
        let netReturn = grossReturn - platformFee;
        if (netReturn < 0) netReturn = grossReturn;

        let holdingDays = 90;
        if (rec.fundedDate && rec.dueDate) {
            const d = daysBetween(rec.dueDate, rec.fundedDate);
            if (d > 0) holdingDays = d;
        }
        const annualRate = (netReturn / rec.principal) * (365 / holdingDays) * 100;

        rateWeightedSum += annualRate * rec.principal;
        rateWeight += rec.principal;
        principalSum += rec.principal;
        count += 1;
    });

    return {
        marketplaceRate: rateWeight > 0 ? rateWeightedSum / rateWeight : 0,
        avgTicket: count > 0 ? principalSum / count : 0,
        sampleSize: count
    };
}

// POST /api/portfolio/return-calculator
// body: { capital, months, targetRate? }
exports.returnCalculator = async (req, res) => {
    try {
        const capital = Number(req.body.capital);
        const months = Number(req.body.months);
        if (!isFinite(capital) || capital <= 0) {
            return res.status(400).json({ error: 'capital must be a positive number' });
        }
        if (!isFinite(months) || months <= 0 || months > 60) {
            return res.status(400).json({ error: 'months must be between 1 and 60' });
        }

        const { marketplaceRate, avgTicket, sampleSize } = await marketplaceBenchmarks();

        const projectedReturn = capital * (marketplaceRate / 100) * (months / 12);
        const projectedTotal = capital + projectedReturn;
        const monthlyIncome = projectedReturn / months;
        const estInvoices = avgTicket > 0 ? Math.floor(capital / avgTicket) : 0;

        const targetRate = req.body.targetRate !== undefined ? Number(req.body.targetRate) : null;
        let meetsTarget = null, targetGap = null;
        if (targetRate !== null && isFinite(targetRate)) {
            meetsTarget = marketplaceRate >= targetRate;
            targetGap = Number((marketplaceRate - targetRate).toFixed(1));
        }

        res.status(200).json({
            inputs: { capital: Math.round(capital), months },
            marketplaceRate: Number(marketplaceRate.toFixed(1)),
            avgTicket: Math.round(avgTicket),
            sampleSize,
            projectedReturn: Math.round(projectedReturn),
            projectedTotal: Math.round(projectedTotal),
            monthlyIncome: Math.round(monthlyIncome),
            estInvoices,
            effectiveAnnualReturnPct: capital > 0 ? Number(((projectedReturn / capital) * (12 / months) * 100).toFixed(1)) : 0,
            meetsTarget,
            targetGap
        });
    } catch (error) {
        console.error('Return Calculator Error:', error);
        res.status(500).json({ error: 'Failed to run return calculation' });
    }
};
