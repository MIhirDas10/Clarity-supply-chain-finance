const pool = require('../db');

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

    records.forEach(rec => {
        const fid = rec.funderId;
        if (!byFunder[fid]) {
            byFunder[fid] = {
                funderId: fid, funderName: rec.funderName,
                active: [], matured: [], overdue: [], completed: [],
                deployedCapital: 0, projectedReturn: 0, realizedReturn: 0,
                totalInvested: 0, completedPrincipal: 0,
                rateWeightedSum: 0, rateWeight: 0
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

        const item = {
            invoiceId: rec.invoiceId,
            buyerName: rec.buyerName,
            principal: Math.round(rec.principal),
            faceValue: Math.round(rec.faceValue),
            expectedReturn: Math.round(netReturn),
            platformFee: Math.round(platformFee),
            annualRate: annualRate.toFixed(1),
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
        }
    });

    return Object.values(byFunder).map(f => {
        const projectedAnnualRate = f.rateWeight > 0 ? (f.rateWeightedSum / f.rateWeight) : 0;
        const realizedAnnualRate = f.completedPrincipal > 0 ? (f.realizedReturn / f.completedPrincipal) * 100 : 0;

        // Maturity schedule = all capital still out, soonest first.
        const maturitySchedule = f.active.concat(f.matured).concat(f.overdue)
            .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

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
            maturitySchedule: maturitySchedule
        };
    });
}

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

// GET /api/portfolio/funders/:id
exports.getFunderPortfolio = async (req, res) => {
    try {
        const portfolios = await computePortfolios(req.params.id);
        if (portfolios.length === 0) {
            return res.status(404).json({ error: 'No portfolio found for this funder' });
        }
        res.status(200).json(portfolios[0]);
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
        portfolios.forEach(p => {
            deployed += p.deployedCapital; projected += p.projectedReturn; realized += p.realizedReturn;
            active += p.activeCount; matured += p.maturedCount; overdue += p.overdueCount; completed += p.completedCount;
        });
        res.status(200).json({
            funders: portfolios.length,
            deployedCapital: deployed, projectedReturn: projected, realizedReturn: realized,
            activeCount: active, maturedCount: matured, overdueCount: overdue, completedCount: completed
        });
    } catch (error) {
        console.error('Portfolio Summary Error:', error);
        res.status(500).json({ error: 'Failed to compute portfolio summary' });
    }
};
